import type { Server } from "@shared/schema";
import { storage } from "./storage";
import { dockerManager } from "./docker-manager";
import { demuxBuffer } from "./container-utils";
import { logStreamer } from "./log-streamer";
import { readTextFile, writeTextFile } from "./game-server";
import { rconHost, rustWebRcon, sourceRcon } from "./rcon-client";

/**
 * Игроки серверов CS2, Rust, ARK, Garry's Mod, Valheim и Terraria. У каждой игры свои команды:
 *  - CS2, Garry's Mod, ARK — Source RCON; Rust — WebRCON (WebSocket);
 *  - Terraria — команды консоли сервера (stdin), ответ читается из вывода;
 *  - Valheim — RCON нет, доступ задаётся списками SteamID в файлах сервера.
 */
export interface OnlinePlayer {
  /** Что передаётся в команды кика и бана: userid, SteamID или ник. */
  id: string;
  name: string;
  details?: string;
}

export type PlayerCommand = "kick" | "ban" | "unban" | "say";

export interface GamePlayersInfo {
  mode: "rcon" | "console" | "lists";
  online: OnlinePlayer[] | null;
  /** Действия, которые есть у этой игры. */
  actions: PlayerCommand[];
  /** Для «unban»: чем указывать игрока. */
  unbanBy?: "SteamID" | "name";
  lists?: Record<ValheimList, string[]>;
  notice?: string;
}

const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });
const quote = (text: string) => text.replace(/["\\\r\n]/g, "").slice(0, 200);
const STEAM_ID = /^7656\d{13}$/;

async function nodeOf(server: Server) {
  const node = await storage.getNode(server.nodeId);
  if (!node) throw fail("Node not found", 404);
  return node;
}

/** Команда RCON игры: адрес — опубликованный порт RCON на ноде, пароль — внутренний пароль панели. */
async function rcon(server: Server, command: string): Promise<string> {
  if (server.status !== "running") throw fail("Start the server to manage players", 409);
  const password = String((server.config as Record<string, any> | null)?.rconPassword ?? "");
  if (!password) throw fail("Restart the server once to turn on player management", 409);
  const host = rconHost(await nodeOf(server));
  switch (server.gameType) {
    case "rust":
      return rustWebRcon(host, server.port + 2, password, command);
    case "ark":
      return sourceRcon(host, server.port + 3, password, command);
    default:
      return sourceRcon(host, server.port, password, command);
  }
}

/** Команда в консоль процесса (stdin) и её вывод из журнала контейнера. */
async function consoleCommand(server: Server, command: string): Promise<string> {
  if (server.status !== "running" || !server.containerId) throw fail("Start the server to manage players", 409);
  const since = Math.floor(Date.now() / 1000) - 1;
  await logStreamer.sendCommand(server, command);
  await new Promise((r) => setTimeout(r, 1200));
  const container = await dockerManager.getContainer(await nodeOf(server), server.containerId);
  const raw = (await container.logs({ stdout: true, stderr: true, since, follow: false })) as unknown as Buffer;
  const text = demuxBuffer(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw))).stdout.toString("utf8");
  const at = text.lastIndexOf(command);
  return (at >= 0 ? text.slice(at + command.length) : text).replace(/\r/g, "").trim();
}

/* Разбор списков игроков */

/** CS2 `status`: строки вида «  2  03:20  54  0  active 786432 1.2.3.4:27005 'Name'». */
export function parseCs2Status(output: string): OnlinePlayer[] {
  const players: OnlinePlayer[] = [];
  for (const line of output.split("\n")) {
    const m = line.match(/^\s*(\d+)\s+(\S+)\s+(\d+)\s+(\d+)\s+(\w+)\s+(\d+)\s+(\S+)\s+'(.*)'\s*$/);
    if (m && m[5] !== "challenging" && m[7] !== "loopback") players.push({ id: m[1], name: m[8], details: `ping ${m[3]}, ${m[2]}` });
  }
  return players;
}

/** Garry's Mod (Source) `status`: «#  2 "Name" STEAM_0:1:123 05:12 50 0 active 1.2.3.4:27005». */
export function parseSourceStatus(output: string): OnlinePlayer[] {
  const players: OnlinePlayer[] = [];
  for (const line of output.split("\n")) {
    const m = line.match(/^#\s*(\d+)\s+(?:\d+\s+)?"(.*)"\s+(STEAM_\S+|BOT)\s+(\S+)\s+(\d+)/);
    if (m && m[3] !== "BOT") players.push({ id: m[3], name: m[2], details: `${m[4]}, ping ${m[5]}` });
  }
  return players;
}

/** ARK `ListPlayers`: «0. Name, 76561198000000000». */
export function parseArkPlayers(output: string): OnlinePlayer[] {
  const players: OnlinePlayer[] = [];
  for (const line of output.split("\n")) {
    const m = line.match(/^\s*\d+\.\s+(.+),\s+(\d{17}|[0-9a-f]{32})\s*$/i);
    if (m) players.push({ id: m[2], name: m[1] });
  }
  return players;
}

/** Rust `playerlist` — JSON-массив с SteamID, DisplayName, Ping, ConnectedSeconds. */
export function parseRustPlayers(output: string): OnlinePlayer[] {
  try {
    const list = JSON.parse(output);
    if (!Array.isArray(list)) return [];
    return list.map((p: any) => ({ id: String(p.SteamID), name: String(p.DisplayName), details: `ping ${p.Ping}, ${Math.round((p.ConnectedSeconds ?? 0) / 60)} min` }));
  } catch {
    return [];
  }
}

/** Terraria `playing`: «Name (1.2.3.4:5678)» на строку, либо «No players connected.». */
export function parseTerrariaPlaying(output: string): OnlinePlayer[] {
  const players: OnlinePlayer[] = [];
  for (const line of output.split("\n")) {
    const m = line.replace(/^[:>\s]+/, "").match(/^(.+?)\s+\((\d{1,3}(?:\.\d{1,3}){3}):\d+\)\s*$/);
    if (m) players.push({ id: m[1], name: m[1], details: m[2] });
  }
  return players;
}

/* Valheim: списки SteamID в файлах сервера */

export type ValheimList = "admins" | "banned" | "permitted";
const VALHEIM_FILES: Record<ValheimList, string> = { admins: "/data/adminlist.txt", banned: "/data/bannedlist.txt", permitted: "/data/permittedlist.txt" };

async function readValheimList(server: Server, list: ValheimList): Promise<string[]> {
  const text = await readTextFile(server, VALHEIM_FILES[list]).catch(() => "");
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//"));
}

export async function updateValheimList(server: Server, list: ValheimList, steamId: string, add: boolean): Promise<string[]> {
  if (!STEAM_ID.test(steamId)) throw fail("Enter a SteamID64 — 17 digits starting with 7656");
  const current = await readValheimList(server, list);
  const next = add ? Array.from(new Set([...current, steamId])) : current.filter((id) => id !== steamId);
  await writeTextFile(server, VALHEIM_FILES[list], `// Managed by SparkPanel\n${next.join("\n")}\n`);
  return next;
}

/* Общий интерфейс */

export async function getGamePlayers(server: Server): Promise<GamePlayersInfo> {
  switch (server.gameType) {
    case "csgo":
      return {
        mode: "rcon",
        online: server.status === "running" ? parseCs2Status(await rcon(server, "status")) : null,
        actions: ["kick", "say"],
        notice: "Bans in CS2 need an admin plugin such as CounterStrikeSharp with an admin system.",
      };
    case "gmod":
      return { mode: "rcon", online: server.status === "running" ? parseSourceStatus(await rcon(server, "status")) : null, actions: ["kick", "ban", "unban", "say"], unbanBy: "SteamID" };
    case "ark":
      return { mode: "rcon", online: server.status === "running" ? parseArkPlayers(await rcon(server, "ListPlayers")) : null, actions: ["kick", "ban", "unban", "say"], unbanBy: "SteamID" };
    case "rust":
      return { mode: "rcon", online: server.status === "running" ? parseRustPlayers(await rcon(server, "playerlist")) : null, actions: ["kick", "ban", "unban", "say"], unbanBy: "SteamID" };
    case "terraria":
      return { mode: "console", online: server.status === "running" ? parseTerrariaPlaying(await consoleCommand(server, "playing")) : null, actions: ["kick", "ban", "say"] };
    case "valheim":
      return {
        mode: "lists",
        online: null,
        actions: [],
        lists: { admins: await readValheimList(server, "admins"), banned: await readValheimList(server, "banned"), permitted: await readValheimList(server, "permitted") },
        notice: "Valheim has no remote console. These lists are read when the server starts; if the allowed list is not empty, only players on it can join.",
      };
    default:
      throw fail("Player management is not available for this server type");
  }
}

export async function gamePlayerCommand(server: Server, command: PlayerCommand, target: string, reason = ""): Promise<string> {
  const who = quote(target.trim());
  const why = quote(reason.trim()) || "Removed by an administrator";
  if (command !== "say" && !who) throw fail("Choose a player");
  if (command === "say" && !quote(reason.trim())) throw fail("Type a message");
  const g = server.gameType;
  if (command === "unban" && g !== "terraria" && !STEAM_ID.test(who) && !/^STEAM_\d:\d:\d+$/.test(who)) throw fail("Enter the player's SteamID");

  const commands: Record<string, Partial<Record<PlayerCommand, string>>> = {
    csgo: { kick: `kickid ${who} "${why}"`, say: `say ${quote(reason)}` },
    gmod: { kick: `kickid ${who} ${why}`, ban: `banid 0 ${who} kick`, unban: `removeid ${who}`, say: `say ${quote(reason)}` },
    ark: { kick: `KickPlayer ${who}`, ban: `BanPlayer ${who}`, unban: `UnbanPlayer ${who}`, say: `ServerChat ${quote(reason)}` },
    rust: { kick: `kick ${who} "${why}"`, ban: `banid ${who} "" "${why}"`, unban: `unban ${who}`, say: `say ${quote(reason)}` },
    terraria: { kick: `kick ${who}`, ban: `ban ${who}`, say: `say ${quote(reason)}` },
  };
  const line = commands[g]?.[command];
  if (!line) throw fail("This action is not available for this game");
  if (g === "terraria") return consoleCommand(server, line);
  const output = await rcon(server, line);
  if (g === "gmod" && (command === "ban" || command === "unban")) await rcon(server, "writeid");
  return output;
}
