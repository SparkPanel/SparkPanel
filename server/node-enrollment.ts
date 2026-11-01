import { randomBytes } from "crypto";
import { existsSync, readFileSync } from "fs";
import { writeFile } from "fs/promises";
import { join } from "path";
import { isIP } from "net";
import { dataPath, ensureDir, settingsStore } from "./data-dir";
import { dockerManager } from "./docker-manager";
import { buildImageFromFiles, demuxBuffer } from "./container-utils";

/**
 * Подключение ноды одной командой. Панель держит свой центр сертификации (CA) и клиентский сертификат;
 * скрипт на ноде ставит Docker, создаёт ключ и запрос на сертификат (ключ не покидает ноду), панель подписывает
 * запрос для IP ноды, и Docker начинает принимать только TLS-подключения с клиентским сертификатом панели (порт 2376).
 * OpenSSL запускается в небольшом локальном контейнере — на машине с панелью ничего ставить не нужно.
 */
const CERT_DIR = () => process.env.DOCKER_CERT_PATH || ensureDir(dataPath("docker-certs"));
const CERTGEN_IMAGE = "sparkpanel/certgen:1";
const TOKEN_TTL_MS = 24 * 3600_000;
const KEY = "node-enrollments";

export interface Enrollment {
  token: string;
  name: string;
  location: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  nodeId?: string;
}

/** Выполняет sh-скрипт с OpenSSL в одноразовом контейнере; входные файлы передаются через переменные (base64). */
async function runOpenssl(script: string, files: Record<string, string>): Promise<string> {
  const docker = dockerManager.getDockerClient();
  try {
    await docker.getImage(CERTGEN_IMAGE).inspect();
  } catch {
    await buildImageFromFiles(docker, CERTGEN_IMAGE, { Dockerfile: "FROM alpine:3.20\nRUN apk add --no-cache openssl\n" });
  }
  const env = Object.entries(files).map(([name, content]) => `IN_${name}=${Buffer.from(content).toString("base64")}`);
  const prelude = Object.keys(files)
    .map((name) => `printf '%s' "$IN_${name}" | base64 -d > /w/${name.toLowerCase().replace(/_/g, ".")}`)
    .join("\n");
  const container = await docker.createContainer({
    Image: CERTGEN_IMAGE,
    Cmd: ["sh", "-ec", `mkdir -p /w && cd /w\n${prelude}\n${script}`],
    Env: env,
    Labels: { "sparkpanel.managed": "true", "sparkpanel.role": "certgen" },
    HostConfig: { NetworkMode: "none", AutoRemove: false },
  });
  try {
    await container.start();
    const { StatusCode } = await container.wait();
    const logs = demuxBuffer((await container.logs({ stdout: true, stderr: true, follow: false })) as unknown as Buffer);
    if (StatusCode !== 0) throw new Error(`Certificate tool failed: ${logs.stderr.toString().trim().split("\n").slice(-2).join(" ")}`);
    return logs.stdout.toString();
  } finally {
    await container.remove({ force: true }).catch(() => {});
  }
}

const pemBlocks = (text: string) => text.match(/-----BEGIN [A-Z ]+-----[\s\S]+?-----END [A-Z ]+-----\n?/g) ?? [];

/** Создаёт CA и клиентский сертификат панели, если их ещё нет. */
export async function ensurePanelCertificates(): Promise<void> {
  const dir = CERT_DIR();
  if (["ca.pem", "ca-key.pem", "cert.pem", "key.pem"].every((f) => existsSync(join(dir, f)))) return;
  if (existsSync(join(dir, "ca.pem")) && !existsSync(join(dir, "ca-key.pem"))) {
    throw new Error("DOCKER_CERT_PATH has certificates from another CA without its key; nodes cannot be added by script");
  }
  const out = await runOpenssl(
    `openssl genrsa -out ca-key.pem 4096 2>/dev/null
openssl req -new -x509 -days 3650 -key ca-key.pem -sha256 -subj "/CN=SparkPanel CA" -out ca.pem
openssl genrsa -out key.pem 4096 2>/dev/null
openssl req -new -key key.pem -subj "/CN=sparkpanel-client" -out client.csr
printf 'extendedKeyUsage = clientAuth\\n' > ext.cnf
openssl x509 -req -days 3650 -sha256 -in client.csr -CA ca.pem -CAkey ca-key.pem -CAcreateserial -out cert.pem -extfile ext.cnf 2>/dev/null
cat ca.pem ca-key.pem cert.pem key.pem`,
    {},
  );
  const [ca, caKey, cert, key] = pemBlocks(out);
  if (!ca || !caKey || !cert || !key) throw new Error("Certificate tool returned incomplete output");
  await writeFile(join(dir, "ca.pem"), ca);
  await writeFile(join(dir, "ca-key.pem"), caKey, { mode: 0o600 });
  await writeFile(join(dir, "cert.pem"), cert);
  await writeFile(join(dir, "key.pem"), key, { mode: 0o600 });
}

/** Подписывает запрос на сертификат Docker-сервера ноды для её IP-адреса. */
export async function signNodeCertificate(csr: string, ip: string): Promise<{ ca: string; cert: string }> {
  if (!isIP(ip)) throw Object.assign(new Error("Invalid node IP address"), { status: 400 });
  if (!/^-----BEGIN CERTIFICATE REQUEST-----[A-Za-z0-9+/=\s]+-----END CERTIFICATE REQUEST-----\s*$/.test(csr)) {
    throw Object.assign(new Error("Invalid certificate request"), { status: 400 });
  }
  await ensurePanelCertificates();
  const dir = CERT_DIR();
  const ca = readFileSync(join(dir, "ca.pem"), "utf-8");
  const out = await runOpenssl(
    `printf 'subjectAltName = IP:%s\\nextendedKeyUsage = serverAuth\\n' "$NODE_IP" > ext.cnf
openssl x509 -req -days 3650 -sha256 -in node.csr -CA ca.pem -CAkey ca.key.pem -CAcreateserial -out node.pem -extfile ext.cnf 2>/dev/null
cat node.pem`.replace("$NODE_IP", ip),
    { NODE_CSR: csr, CA_PEM: ca, CA_KEY_PEM: readFileSync(join(dir, "ca-key.pem"), "utf-8") },
  );
  const [cert] = pemBlocks(out);
  if (!cert) throw new Error("The node certificate was not issued");
  return { ca, cert };
}

/* Одноразовые токены установки */

const enrollments = () => settingsStore.get<Enrollment[]>(KEY, []).filter((e) => new Date(e.expiresAt).getTime() > Date.now() || e.usedAt);

export async function createEnrollment(name: string, location: string): Promise<Enrollment> {
  const now = Date.now();
  const enrollment: Enrollment = { token: randomBytes(24).toString("hex"), name, location, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + TOKEN_TTL_MS).toISOString() };
  const keep = enrollments().filter((e) => !e.usedAt || now - new Date(e.usedAt).getTime() < TOKEN_TTL_MS);
  await settingsStore.set(KEY, [...keep, enrollment]);
  return enrollment;
}

export function findEnrollment(token: string): Enrollment | null {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const e = enrollments().find((x) => x.token === token);
  return e && !e.usedAt && new Date(e.expiresAt).getTime() > Date.now() ? e : null;
}

export async function markEnrollmentUsed(token: string, nodeId: string): Promise<void> {
  await settingsStore.set(
    KEY,
    enrollments().map((e) => (e.token === token ? { ...e, usedAt: new Date().toISOString(), nodeId } : e)),
  );
}

/** Скрипт установки ноды (bash, Debian/Ubuntu/CentOS/Fedora с systemd). */
export function installScript(panelUrl: string, token: string): string {
  return `#!/usr/bin/env bash
# SparkPanel: connects this machine as a node. Run as root.
set -euo pipefail
PANEL='${panelUrl}'
TOKEN='${token}'
CERTS=/etc/docker/sparkpanel

say() { printf '\\033[1;32m[SparkPanel]\\033[0m %s\\n' "$*"; }
die() { printf '\\033[1;31m[SparkPanel]\\033[0m %s\\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root: curl -fsSL ... | sudo bash"
command -v systemctl >/dev/null || die "systemd is required"
command -v curl >/dev/null || die "curl is required"

if ! command -v docker >/dev/null; then
  say "Installing Docker…"
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null

if ! command -v openssl >/dev/null; then
  say "Installing OpenSSL…"
  if command -v apt-get >/dev/null; then apt-get update -qq && apt-get install -y -qq openssl; else (dnf install -y openssl || yum install -y openssl); fi
fi

IP="\${SPARKPANEL_NODE_IP:-$(curl -fsS4 --max-time 10 https://api.ipify.org || hostname -I | awk '{print $1}')}"
[ -n "$IP" ] || die "Could not find this machine's IP. Run again with SPARKPANEL_NODE_IP=1.2.3.4"
say "Node address: $IP"

mkdir -p "$CERTS" && chmod 700 "$CERTS"
# The key is created here and never leaves the machine; only the certificate request goes to the panel.
[ -f "$CERTS/server-key.pem" ] || openssl genrsa -out "$CERTS/server-key.pem" 4096 2>/dev/null
openssl req -new -key "$CERTS/server-key.pem" -subj "/CN=$IP" -out "$CERTS/server.csr"

CPU=$(nproc)
RAM=$(awk '/MemTotal/ {printf "%d", $2/1024/1024 + 0.5}' /proc/meminfo)
DISK=$(df -BG --output=size /var/lib/docker 2>/dev/null | tail -1 | tr -dc '0-9' || echo 0)
CSR=$(sed ':a;N;$!ba;s/\\n/\\\\n/g' "$CERTS/server.csr")

say "Registering with the panel…"
RESPONSE=$(curl -fsS -X POST "$PANEL/api/nodes/enroll" -H 'Content-Type: application/json' \\
  -d "{\\"token\\":\\"$TOKEN\\",\\"ip\\":\\"$IP\\",\\"cpuCores\\":$CPU,\\"ramTotal\\":\${RAM:-1},\\"diskTotal\\":\${DISK:-10},\\"csr\\":\\"$CSR\\"}") || die "The panel refused the registration (the command may have expired — create a new one)"

printf '%s' "$RESPONSE" | sed -n 's/.*"ca":"\\([^"]*\\)".*/\\1/p' | sed 's/\\\\n/\\n/g' > "$CERTS/ca.pem"
printf '%s' "$RESPONSE" | sed -n 's/.*"cert":"\\([^"]*\\)".*/\\1/p' | sed 's/\\\\n/\\n/g' > "$CERTS/server-cert.pem"
grep -q 'BEGIN CERTIFICATE' "$CERTS/server-cert.pem" || die "The panel did not return a certificate"

say "Turning on Docker TLS on port 2376…"
mkdir -p /etc/systemd/system/docker.service.d
cat > /etc/systemd/system/docker.service.d/sparkpanel.conf <<UNIT
[Service]
ExecStart=
ExecStart=/usr/bin/dockerd -H fd:// -H tcp://0.0.0.0:2376 --tlsverify --tlscacert=$CERTS/ca.pem --tlscert=$CERTS/server-cert.pem --tlskey=$CERTS/server-key.pem --containerd=/run/containerd/containerd.sock
UNIT
systemctl daemon-reload
systemctl restart docker

if command -v ufw >/dev/null && ufw status | grep -q active; then ufw allow 2376/tcp >/dev/null; fi
if command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then firewall-cmd --permanent --add-port=2376/tcp >/dev/null && firewall-cmd --reload >/dev/null; fi

curl -fsS -X POST "$PANEL/api/nodes/enroll/done" -H 'Content-Type: application/json' -d "{\\"token\\":\\"$TOKEN\\"}" >/dev/null || true
say "Done. The node appears as online in the panel within a minute."
say "Only the panel's certificate can connect to Docker on this machine. Open game ports in your firewall as you add servers."
`;
}
