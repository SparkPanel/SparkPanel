import { createHash } from "crypto";
import { Readable } from "stream";
import type { Server } from "@shared/schema";
import { APP_VERSION } from "@shared/version";
import { getStartupSettings } from "./game-templates";
import { listFiles, writeFileStream } from "./game-server";

/**
 * Каталог плагинов и модов Modrinth (api.modrinth.com, без ключа). Загрузчик и версия игры берутся из настроек
 * сервера, поэтому в поиске только совместимые проекты, а файл проверяется по SHA-512 перед установкой.
 */
const API = "https://api.modrinth.com/v2";
const HEADERS = { "User-Agent": `SparkPanel/${APP_VERSION} (github.com/SparkPanel/SparkPanel)` };
const MAX_FILE = 200 * 1024 * 1024;

interface Platform {
  loaders: string[];
  folder: "plugins" | "mods";
  projectType: "plugin" | "mod";
}

/** Ядро сервера → загрузчики Modrinth и папка установки. */
const PLATFORMS: Record<string, Platform> = {
  PAPER: { loaders: ["paper", "spigot", "bukkit"], folder: "plugins", projectType: "plugin" },
  PURPUR: { loaders: ["purpur", "paper", "spigot", "bukkit"], folder: "plugins", projectType: "plugin" },
  FOLIA: { loaders: ["folia"], folder: "plugins", projectType: "plugin" },
  SPIGOT: { loaders: ["spigot", "bukkit"], folder: "plugins", projectType: "plugin" },
  BUKKIT: { loaders: ["bukkit"], folder: "plugins", projectType: "plugin" },
  FABRIC: { loaders: ["fabric"], folder: "mods", projectType: "mod" },
  QUILT: { loaders: ["quilt", "fabric"], folder: "mods", projectType: "mod" },
  FORGE: { loaders: ["forge"], folder: "mods", projectType: "mod" },
  NEOFORGE: { loaders: ["neoforge"], folder: "mods", projectType: "mod" },
  VELOCITY: { loaders: ["velocity"], folder: "plugins", projectType: "plugin" },
  BUNGEECORD: { loaders: ["bungeecord", "waterfall"], folder: "plugins", projectType: "plugin" },
  WATERFALL: { loaders: ["waterfall", "bungeecord"], folder: "plugins", projectType: "plugin" },
};

const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });

async function modrinth<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  if (res.status === 404) throw fail("Not found on Modrinth", 404);
  if (!res.ok) throw fail(`Modrinth answered ${res.status}`, 502);
  return (await res.json()) as T;
}

let latestRelease: { at: number; version: string } | null = null;

/** Версия игры сервера; для LATEST — текущий релиз из манифеста Mojang (кешируется на час). */
async function gameVersion(server: Server): Promise<string> {
  const version = (getStartupSettings(server).version || "LATEST").trim();
  if (version.toUpperCase() !== "LATEST") return version;
  if (latestRelease && Date.now() - latestRelease.at < 3600_000) return latestRelease.version;
  const res = await fetch("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json", { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw fail("Could not find the latest Minecraft version", 502);
  const manifest = (await res.json()) as { latest: { release: string } };
  latestRelease = { at: Date.now(), version: manifest.latest.release };
  return latestRelease.version;
}

export function platformFor(server: Server): Platform & { serverType: string } {
  if (server.gameType !== "minecraft") throw fail("The catalog is available for Minecraft servers");
  const serverType = (getStartupSettings(server).serverType || "VANILLA").toUpperCase();
  const platform = PLATFORMS[serverType];
  if (!platform) throw fail(`${serverType} servers do not load plugins or mods. Switch the server type to Paper, Purpur, Fabric, Forge or NeoForge in Settings.`);
  return { ...platform, serverType };
}

export interface CatalogItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  downloads: number;
  iconUrl: string | null;
  installed: boolean;
}

/** Имена установленных файлов — чтобы отметить уже стоящие проекты. */
async function installedFiles(server: Server, folder: string): Promise<string[]> {
  return (await listFiles(server, `/data/${folder}`).catch(() => [])).filter((f) => f.type === "file").map((f) => f.name.toLowerCase());
}

const looksInstalled = (files: string[], slug: string) => {
  const key = slug.toLowerCase().replace(/[^a-z0-9]/g, "");
  return files.some((f) => f.replace(/[^a-z0-9]/g, "").startsWith(key));
};

export async function searchCatalog(server: Server, query: string, offset = 0) {
  const platform = platformFor(server);
  const version = await gameVersion(server);
  const facets = JSON.stringify([[`project_type:${platform.projectType}`], platform.loaders.map((l) => `categories:${l}`), [`versions:${version}`]]);
  const params = new URLSearchParams({ query: query.slice(0, 100), facets, limit: "20", offset: String(Math.max(0, offset)), index: query ? "relevance" : "downloads" });
  const [result, files] = await Promise.all([
    modrinth<{ hits: any[]; total_hits: number }>(`/search?${params}`),
    installedFiles(server, platform.folder),
  ]);
  const items: CatalogItem[] = result.hits.map((hit) => ({
    id: hit.project_id,
    slug: hit.slug,
    title: hit.title,
    description: hit.description,
    author: hit.author,
    downloads: hit.downloads,
    iconUrl: hit.icon_url || null,
    installed: looksInstalled(files, hit.slug),
  }));
  return { items, total: result.total_hits, gameVersion: version, serverType: platform.serverType, folder: platform.folder };
}

/** Скачивает подходящую версию проекта в plugins/ или mods/ сервера. */
export async function installFromCatalog(server: Server, projectId: string): Promise<{ file: string; version: string; path: string }> {
  if (!/^[A-Za-z0-9]{6,12}$/.test(projectId)) throw fail("Invalid project");
  const platform = platformFor(server);
  const gv = await gameVersion(server);
  const params = new URLSearchParams({ loaders: JSON.stringify(platform.loaders), game_versions: JSON.stringify([gv]) });
  const versions = await modrinth<any[]>(`/project/${projectId}/version?${params}`);
  const release = versions.find((v) => v.version_type === "release") ?? versions[0];
  if (!release) throw fail(`No version of this project supports ${platform.serverType} ${gv}`, 409);
  const file = release.files.find((f: any) => f.primary) ?? release.files[0];
  if (!file || !/\.jar$/i.test(file.filename)) throw fail("This version has no .jar file to install", 409);
  if (file.size > MAX_FILE) throw fail("The file is too large", 413);
  const url = new URL(file.url);
  if (url.protocol !== "https:" || !/(^|\.)modrinth\.com$/.test(url.hostname)) throw fail("Unexpected download address", 502);

  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw fail(`Download failed: ${res.status}`, 502);
  const data = Buffer.from(await res.arrayBuffer());
  const sha512 = createHash("sha512").update(data).digest("hex");
  if (file.hashes?.sha512 && sha512 !== file.hashes.sha512) throw fail("The downloaded file does not match its checksum", 502);

  const name = String(file.filename).replace(/[\/\\\0]/g, "_");
  const path = await writeFileStream(server, `/data/${platform.folder}`, name, Readable.from(data));
  return { file: name, version: release.version_number, path };
}
