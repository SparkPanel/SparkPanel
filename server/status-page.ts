import type { Server } from "@shared/schema";
import { settingsStore } from "./data-dir";
import { storage } from "./storage";
import { parseListOutput, rcon } from "./minecraft-players";
import { connectHost } from "./node-address";

/** Публичная страница состояния: какие серверы видны посетителям без входа в панель. */
export interface StatusPageSettings {
  enabled: boolean;
  title: string;
  description: string;
  serverIds: string[];
  /** Показывать адрес подключения (IP ноды и порт). */
  showAddress: boolean;
}

const KEY = "status-page";
const DEFAULTS: StatusPageSettings = { enabled: false, title: "Server status", description: "", serverIds: [], showAddress: false };

export function getStatusPageSettings(): StatusPageSettings {
  return { ...DEFAULTS, ...settingsStore.get<Partial<StatusPageSettings>>(KEY, {}) };
}

export async function saveStatusPageSettings(next: StatusPageSettings): Promise<StatusPageSettings> {
  const known = new Set((await storage.getAllServers()).map((s) => s.id));
  const clean = { ...next, serverIds: next.serverIds.filter((id) => known.has(id)) };
  await settingsStore.set(KEY, clean);
  cache = null;
  return clean;
}

export interface PublicServerStatus {
  name: string;
  game: string;
  state: "online" | "starting" | "offline" | "problem";
  players: { online: number; max: number | null } | null;
  address: string | null;
}

const stateOf = (status: Server["status"]): PublicServerStatus["state"] =>
  status === "running" ? "online" : status === "starting" || status === "stopping" ? "starting" : status === "error" ? "problem" : "offline";

const CACHE_MS = 15_000;
let cache: { at: number; body: unknown } | null = null;

export async function publicStatus(fallbackHost: string): Promise<{ title: string; description: string; updatedAt: string; servers: PublicServerStatus[] } | null> {
  const settings = getStatusPageSettings();
  if (!settings.enabled) return null;
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.body as any;

  const servers = (await Promise.all(settings.serverIds.map((id) => storage.getServer(id)))).filter((s): s is Server => Boolean(s));
  const nodes = new Map((await storage.getAllNodes()).map((n) => [n.id, n]));
  const result: PublicServerStatus[] = await Promise.all(
    servers.map(async (server) => {
      let players: PublicServerStatus["players"] = null;
      if (server.gameType === "minecraft" && server.status === "running") {
        const listed = parseListOutput(await rcon(server, ["list"]).catch(() => ""));
        if (listed) players = { online: listed.online.length, max: listed.max };
      }
      const node = nodes.get(server.nodeId);
      return {
        name: server.name,
        game: server.gameType,
        state: stateOf(server.status),
        players,
        address: settings.showAddress && node ? `${connectHost(node) ?? fallbackHost}:${server.port}` : null,
      };
    }),
  );
  const body = { title: settings.title, description: settings.description, updatedAt: new Date().toISOString(), servers: result };
  cache = { at: Date.now(), body };
  return body;
}
