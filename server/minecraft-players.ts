import type { Server } from "@shared/schema";
import { dockerManager } from "./docker-manager";
import { storage } from "./storage";
import { execInContainer } from "./container-utils";
import { readTextFile } from "./game-server";

/** Ник Java-игрока (3–16 символов) или Bedrock-игрока через Geyser/Floodgate (с точкой в начале). */
const PLAYER_NAME = /^\.?[A-Za-z0-9_]{1,16}$/;

export const PLAYER_ACTIONS = ["whitelist_add", "whitelist_remove", "op", "deop", "ban", "pardon", "kick", "whitelist_on", "whitelist_off"] as const;
export type PlayerAction = (typeof PLAYER_ACTIONS)[number];

interface ListedPlayer {
  name: string;
  uuid?: string;
}

export interface PlayersInfo {
  rconReady: boolean;
  /** RCON включён в настройках, но контейнер ещё работает со старыми — нужен перезапуск. */
  restartRequired: boolean;
  online: string[] | null;
  max: number | null;
  whitelistEnabled: boolean;
  whitelist: ListedPlayer[];
  ops: (ListedPlayer & { level?: number })[];
  banned: (ListedPlayer & { reason?: string; source?: string; created?: string })[];
}


async function gameContainer(server: Server) {
  if (!server.containerId) throw Object.assign(new Error("The server has no container yet — start it once"), { status: 409 });
  const node = await storage.getNode(server.nodeId);
  if (!node) throw new Error("Node not found");
  return dockerManager.getContainer(node, server.containerId);
}

/** Пароль RCON, с которым реально запущен контейнер (после смены настроек он может отличаться от сохранённого). */
async function runningRconPassword(server: Server): Promise<string | null> {
  const container = await gameContainer(server);
  const env: string[] = (await container.inspect()).Config?.Env ?? [];
  if (!env.includes("ENABLE_RCON=true")) return null;
  return env.find((e) => e.startsWith("RCON_PASSWORD="))?.slice("RCON_PASSWORD=".length) ?? null;
}

/** Выполняет команду консоли Minecraft через RCON внутри контейнера и возвращает ответ сервера. */
export async function rcon(server: Server, args: string[]): Promise<string> {
  if (server.status !== "running") throw Object.assign(new Error("Start the server to manage players"), { status: 409 });
  const password = await runningRconPassword(server);
  if (!password) throw Object.assign(new Error("Restart the server to turn on player management"), { status: 409 });
  const container = await gameContainer(server);
  const result = await execInContainer(container, ["rcon-cli", "--port", "25575", "--password", password, ...args], { timeoutMs: 15000 });
  const output = `${result.stdout.toString()}${result.stderr.toString()}`.replace(/\x1b\[[0-9;]*m|§./g, "").trim();
  if (result.exitCode !== 0) throw Object.assign(new Error(output || "The server did not answer the command"), { status: 502 });
  return output;
}

async function readJsonList<T>(server: Server, file: string): Promise<T[]> {
  try {
    const parsed = JSON.parse(await readTextFile(server, `/data/${file}`));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Вывод команды list: «There are 2 of a max of 20 players online: A, B» или «There are 2/20 players online: A, B». */
export function parseListOutput(output: string): { online: string[]; max: number | null } | null {
  const match = output.match(/There are (\d+)(?: of a max of |\/)(\d+) players online:?\s*(.*)$/im);
  if (!match) return null;
  const names = match[3]
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  return { online: names, max: Number(match[2]) };
}

export async function getPlayers(server: Server): Promise<PlayersInfo> {
  const [whitelist, ops, banned, properties] = await Promise.all([
    readJsonList<ListedPlayer>(server, "whitelist.json"),
    readJsonList<ListedPlayer & { level?: number }>(server, "ops.json"),
    readJsonList<ListedPlayer & { reason?: string; source?: string; created?: string }>(server, "banned-players.json"),
    readTextFile(server, "/data/server.properties").catch(() => ""),
  ]);
  const whitelistEnabled = /^white-list\s*=\s*true\s*$/m.test(properties);

  let online: string[] | null = null;
  let max: number | null = null;
  let rconReady = false;
  let restartRequired = false;
  if (server.status === "running") {
    const password = await runningRconPassword(server).catch(() => null);
    restartRequired = !password;
    if (password) {
      const listed = parseListOutput(await rcon(server, ["list"]).catch(() => ""));
      rconReady = listed !== null;
      online = listed?.online ?? null;
      max = listed?.max ?? null;
    }
  }
  return {
    rconReady,
    restartRequired,
    online,
    max,
    whitelistEnabled,
    whitelist: whitelist.map(({ name, uuid }) => ({ name, uuid })),
    ops: ops.map(({ name, uuid, level }) => ({ name, uuid, level })),
    banned: banned.map(({ name, uuid, reason, source, created }) => ({ name, uuid, reason, source, created })),
  };
}

export async function playerAction(server: Server, action: PlayerAction, player?: string, reason?: string): Promise<string> {
  if (action === "whitelist_on") return rcon(server, ["whitelist", "on"]);
  if (action === "whitelist_off") return rcon(server, ["whitelist", "off"]);
  if (!player || !PLAYER_NAME.test(player)) throw Object.assign(new Error("Enter a valid player name"), { status: 400 });
  const why = (reason ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 200);
  switch (action) {
    case "whitelist_add":
      return rcon(server, ["whitelist", "add", player]);
    case "whitelist_remove":
      return rcon(server, ["whitelist", "remove", player]);
    case "op":
      return rcon(server, ["op", player]);
    case "deop":
      return rcon(server, ["deop", player]);
    case "ban":
      return rcon(server, why ? ["ban", player, why] : ["ban", player]);
    case "pardon":
      return rcon(server, ["pardon", player]);
    case "kick":
      return rcon(server, why ? ["kick", player, why] : ["kick", player]);
  }
}
