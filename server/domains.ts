import { resolve4 } from "dns/promises";
import type { Node, Server } from "@shared/schema";
import { settingsStore } from "./data-dir";
import { dockerManager } from "./docker-manager";
import { storage } from "./storage";
import { ensureImage, ensureVolume, execChecked, execInContainer } from "./container-utils";
import { connectHost } from "./node-address";

/**
 * Домены с HTTPS для сайтов и веб-приложений. На каждой ноде с доменами работает контейнер Caddy (порты 80 и 443):
 * он сам получает сертификаты Let's Encrypt и проксирует домен на порт сервера. Конфигурация собирается из списка
 * доменов и применяется командой `caddy reload` без остановки.
 */
const PROXY_IMAGE = "caddy:2.8-alpine";
const PROXY_NAME = "sparkpanel-proxy";
const DOMAINS_KEY = "domains";
const PROXY_KEY = "proxy";
const HOSTNAME = /^(?=.{1,253}$)(?!-)([a-z0-9-]{1,63}(?<!-)\.)+[a-z][a-z0-9-]{0,62}$/;

export interface ProxySettings {
  /** Почта для Let's Encrypt (уведомления об истечении сертификатов). */
  email: string;
}

const allDomains = () => settingsStore.get<Record<string, string[]>>(DOMAINS_KEY, {});

export const getProxySettings = (): ProxySettings => ({ email: "", ...settingsStore.get<Partial<ProxySettings>>(PROXY_KEY, {}) });

export async function saveProxySettings(next: ProxySettings): Promise<void> {
  if (next.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) throw Object.assign(new Error("Enter a valid email"), { status: 400 });
  await settingsStore.set(PROXY_KEY, next);
}

export function getServerDomains(serverId: string): string[] {
  return allDomains()[serverId] ?? [];
}

export function normalizeDomain(input: string): string {
  const domain = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (!HOSTNAME.test(domain)) throw Object.assign(new Error(`${input} is not a valid domain`), { status: 400 });
  return domain;
}

/** Заменяет домены сервера; один домен не может принадлежать двум серверам. */
export async function setServerDomains(server: Server, domains: string[]): Promise<string[]> {
  const clean = Array.from(new Set(domains.map(normalizeDomain)));
  if (clean.length > 20) throw Object.assign(new Error("A server can have up to 20 domains"), { status: 400 });
  const all = { ...allDomains() };
  for (const [id, list] of Object.entries(all)) {
    if (id === server.id) continue;
    const taken = clean.find((d) => list.includes(d));
    if (taken) throw Object.assign(new Error(`${taken} is already used by another server`), { status: 409 });
  }
  if (clean.length) all[server.id] = clean;
  else delete all[server.id];
  await settingsStore.set(DOMAINS_KEY, all);
  return clean;
}

export async function forgetServerDomains(serverId: string): Promise<void> {
  const all = { ...allDomains() };
  if (!all[serverId]) return;
  delete all[serverId];
  await settingsStore.set(DOMAINS_KEY, all);
}

/**
 * Адреса, на которые прокси отправляет трафик домена: основной сервер и его копии (при масштабировании).
 * Копии на этой же машине — через host.docker.internal, на других нодах — по адресу ноды.
 */
function upstreamsFor(server: Server, nodes: Map<string, Node>): string[] {
  const replicas: { nodeId: string; port: number }[] = (server.config as Record<string, any> | null)?.scaling?.replicas ?? [];
  const local = (port: number) => `host.docker.internal:${port}`;
  const remote = replicas.map((r) => {
    if (r.nodeId === server.nodeId) return local(r.port);
    const node = nodes.get(r.nodeId);
    return node ? `${connectHost(node) ?? node.ip}:${r.port}` : null;
  });
  return [local(server.port), ...remote].filter((u): u is string => Boolean(u));
}

/**
 * Несколько копий: запрос идёт на наименее загруженную; упавшая копия на 30 секунд выводится из ротации,
 * а запрос, который не удалось отправить, повторяется на другой копии.
 */
const BALANCING = ["lb_policy least_conn", "lb_try_duration 5s", "lb_try_interval 250ms", "fail_duration 30s", "max_fails 1", "unhealthy_status 5xx"];

/** Caddyfile для ноды: каждый домен проксируется на сервер этой ноды и его копии. */
async function caddyfileFor(nodeId: string): Promise<string> {
  const nodes = new Map((await storage.getAllNodes()).map((n) => [n.id, n]));
  const servers = (await storage.getAllServers()).filter((s) => s.nodeId === nodeId);
  const { email } = getProxySettings();
  const lines = [`{\n${email ? `\temail ${email}\n` : ""}\tadmin localhost:2019\n}\n`];
  for (const server of servers) {
    const domains = getServerDomains(server.id);
    if (!domains.length) continue;
    const upstreams = upstreamsFor(server, nodes);
    const balancing = upstreams.length > 1 ? ` {\n${BALANCING.map((line) => `\t\t${line}`).join("\n")}\n\t}` : "";
    lines.push(`# ${server.name.replace(/[\r\n]/g, " ")}\n${domains.join(", ")} {\n\tencode gzip\n\treverse_proxy ${upstreams.join(" ")}${balancing}\n}\n`);
  }
  return lines.join("\n");
}

async function nodeOf(server: Server): Promise<Node> {
  const node = await storage.getNode(server.nodeId);
  if (!node) throw new Error("Node not found");
  return node;
}

/** Создаёт или обновляет прокси на ноде сервера. Без доменов на ноде прокси удаляется и освобождает 80/443. */
export async function syncProxy(server: Server): Promise<{ running: boolean }> {
  const node = await nodeOf(server);
  const docker = dockerManager.getDockerClient(node);
  const config = await caddyfileFor(node.id);
  const hasSites = config.includes("reverse_proxy");
  const container = docker.getContainer(PROXY_NAME);
  const exists = await container.inspect().then(
    () => true,
    () => false,
  );
  if (!hasSites) {
    if (exists) await container.remove({ force: true });
    return { running: false };
  }
  if (!exists) {
    await ensureImage(docker, PROXY_IMAGE);
    await ensureVolume(docker, "sparkpanel-proxy-data", { "sparkpanel.role": "proxy" });
    const created = await docker.createContainer({
      name: PROXY_NAME,
      Image: PROXY_IMAGE,
      Labels: { "sparkpanel.managed": "true", "sparkpanel.role": "proxy" },
      ExposedPorts: { "80/tcp": {}, "443/tcp": {}, "443/udp": {} },
      HostConfig: {
        PortBindings: { "80/tcp": [{ HostPort: "80" }], "443/tcp": [{ HostPort: "443" }], "443/udp": [{ HostPort: "443" }] },
        Binds: ["sparkpanel-proxy-data:/data"],
        ExtraHosts: ["host.docker.internal:host-gateway"],
        RestartPolicy: { Name: "unless-stopped" },
      },
    });
    try {
      await created.start();
    } catch (error: any) {
      await created.remove({ force: true }).catch(() => {});
      throw Object.assign(new Error(/port is already allocated|address already in use/i.test(error.message) ? "Ports 80 and 443 on this node are taken by another program" : error.message), { status: 409 });
    }
  }
  const proxy = docker.getContainer(PROXY_NAME);
  await execChecked(proxy, ["sh", "-c", "cat > /etc/caddy/Caddyfile"], { stdin: config });
  const valid = await execInContainer(proxy, ["caddy", "validate", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"], { timeoutMs: 30000 });
  if (valid.exitCode !== 0) throw new Error(`Proxy configuration rejected: ${valid.stderr.toString().trim().split("\n").slice(-1)[0]}`);
  await execChecked(proxy, ["caddy", "reload", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile", "--force"], { timeoutMs: 30000 });
  return { running: true };
}

/** Указывает ли DNS домена на ноду — без этого Let's Encrypt не выдаст сертификат. */
export async function dnsStatus(domain: string, node: Node): Promise<{ domain: string; addresses: string[]; pointsToNode: boolean | null }> {
  if (domain.endsWith(".localhost")) return { domain, addresses: ["127.0.0.1"], pointsToNode: null };
  const addresses = await resolve4(domain).catch(() => [] as string[]);
  const local = ["127.0.0.1", "localhost", "local"].includes(node.ip);
  return { domain, addresses, pointsToNode: local ? null : addresses.includes(node.ip) };
}

/** Состояние сертификата по журналу Caddy: выдан ли он и последняя ошибка. */
export async function certificateStatus(server: Server): Promise<Record<string, "issued" | "pending">> {
  const domains = getServerDomains(server.id);
  if (!domains.length) return {};
  const docker = dockerManager.getDockerClient(await nodeOf(server));
  const result = await execInContainer(docker.getContainer(PROXY_NAME), ["sh", "-c", "ls /data/caddy/certificates/*/ 2>/dev/null; ls /data/caddy/pki/authorities/local >/dev/null 2>&1 && echo local-ca"], { timeoutMs: 10000 }).catch(() => null);
  const listing = result?.stdout.toString() ?? "";
  return Object.fromEntries(domains.map((d) => [d, listing.split(/\s+/).includes(d) || (d.endsWith(".localhost") && listing.includes("local-ca")) ? "issued" : "pending"]));
}
