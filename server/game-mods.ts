import { Readable } from "stream";
import type { Server } from "@shared/schema";
import { APP_VERSION } from "@shared/version";
import { resolveGameSettings } from "@shared/game-profiles";
import { extractArchive, listFiles, removePath, writeFileStream } from "./game-server";

/**
 * Каталоги модов для игр, у которых есть открытый источник:
 *  - Rust с ядром Oxide — плагины uMod (umod.org), файл .cs кладётся в oxide/plugins и подхватывается без перезапуска;
 *  - Valheim с ядром BepInEx — моды Thunderstore, архив распаковывается в bepinex/plugins вместе с зависимостями.
 */
const HEADERS = { "User-Agent": `SparkPanel/${APP_VERSION} (github.com/SparkPanel/SparkPanel)` };
const MAX_DOWNLOAD = 100 * 1024 * 1024;
const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });

export interface ModItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  downloads: number;
  iconUrl: string | null;
  url: string;
  installed: boolean;
  tags?: string[];
}

async function download(url: string, allowedHost: RegExp): Promise<Buffer> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !allowedHost.test(parsed.hostname)) throw fail("Unexpected download address", 502);
  const res = await fetch(parsed, { headers: HEADERS, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw fail(`Download failed: ${res.status}`, 502);
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_DOWNLOAD) throw fail("The file is too large", 413);
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > MAX_DOWNLOAD) throw fail("The file is too large", 413);
  return data;
}

async function existingNames(server: Server, dir: string): Promise<Set<string>> {
  return new Set((await listFiles(server, dir).catch(() => [])).map((f) => f.name.toLowerCase()));
}

/* uMod (Rust + Oxide) */

const OXIDE_DIR = "/data/oxide/plugins";

export function requireVariant(server: Server, game: "rust" | "valheim", variant: string, coreName: string) {
  const settings = resolveGameSettings(game, (server.config as Record<string, any> | null)?.gameSettings);
  if (settings.variant !== variant) throw fail(`Plugins need the ${coreName} core. Switch the core in Settings and restart the server.`);
}

export async function searchUmod(server: Server, query: string, offset: number) {
  requireVariant(server, "rust", "oxide", "Oxide (uMod)");
  const page = Math.floor(Math.max(0, offset) / 20) + 1;
  const params = new URLSearchParams({ query: query.slice(0, 100), page: String(page), sort: query ? "title" : "downloads", sortdir: query ? "asc" : "desc" });
  params.append("categories[]", "rust");
  params.append("categories[]", "universal");
  const res = await fetch(`https://umod.org/plugins/search.json?${params}`, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw fail(`uMod answered ${res.status}`, 502);
  const json = (await res.json()) as { data: any[]; total: number; per_page: number };
  const installed = await existingNames(server, OXIDE_DIR);
  const items: ModItem[] = json.data.map((p) => ({
    id: String(p.name),
    slug: p.slug,
    title: p.title,
    description: p.description,
    author: p.author || "",
    downloads: Number(p.downloads) || 0,
    iconUrl: p.icon_url || null,
    url: p.url,
    installed: installed.has(`${String(p.name).toLowerCase()}.cs`),
    tags: String(p.tags_all || "")
      .split(",")
      .filter((t) => t && !["rust", "imported", "universal"].includes(t))
      .slice(0, 4),
  }));
  return { items, total: Number(json.total) || items.length, source: "uMod", folder: "oxide/plugins" };
}

export async function installUmod(server: Server, name: string) {
  requireVariant(server, "rust", "oxide", "Oxide (uMod)");
  if (!/^[A-Za-z0-9_]{2,64}$/.test(name)) throw fail("Invalid plugin");
  const code = await download(`https://umod.org/plugins/${name}.cs`, /(^|\.)umod\.org$/);
  if (!/class\s+\w+\s*:\s*(RustPlugin|CovalencePlugin)/.test(code.toString("utf8"))) throw fail("The download is not an Oxide plugin", 502);
  const path = await writeFileStream(server, OXIDE_DIR, `${name}.cs`, Readable.from(code));
  return { file: `${name}.cs`, path, note: "Oxide loads the plugin within a few seconds; its config appears in oxide/config." };
}

/* Thunderstore (Valheim + BepInEx) */

interface TsPackage {
  full_name: string;
  name: string;
  owner: string;
  package_url: string;
  is_deprecated: boolean;
  has_nsfw_content: boolean;
  rating_score: number;
  categories: string[];
  versions: { version_number: string; description: string; icon: string; download_url: string; downloads: number; dependencies: string[]; file_size: number }[];
}

const BEPINEX_DIR = "/data/bepinex/plugins";
const PROVIDED = /^denikson-BepInExPack_Valheim$/i;
let tsCache: { at: number; packages: TsPackage[]; byName: Map<string, TsPackage> } | null = null;

/** Список пакетов Valheim (~15 МБ) кешируется на час: Thunderstore не даёт серверного поиска. */
async function thunderstorePackages() {
  if (tsCache && Date.now() - tsCache.at < 3600_000) return tsCache;
  const res = await fetch("https://thunderstore.io/c/valheim/api/v1/package/", { headers: HEADERS, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw fail(`Thunderstore answered ${res.status}`, 502);
  const packages = ((await res.json()) as TsPackage[]).filter(
    (p) => !p.is_deprecated && !p.has_nsfw_content && p.versions?.length && !/mod[\s_-]?manager|r2modman/i.test(p.full_name) && (p.versions[0].file_size ?? 0) <= MAX_DOWNLOAD,
  );
  tsCache = { at: Date.now(), packages, byName: new Map(packages.map((p) => [p.full_name.toLowerCase(), p])) };
  return tsCache;
}

const totalDownloads = (p: TsPackage) => p.versions.reduce((sum, v) => sum + (v.downloads || 0), 0);

export async function searchThunderstore(server: Server, query: string, offset: number) {
  requireVariant(server, "valheim", "bepinex", "BepInEx");
  const { packages } = await thunderstorePackages();
  const q = query.trim().toLowerCase();
  const compact = q.replace(/[\s_-]+/g, "");
  const nameOf = (p: TsPackage) => p.name.toLowerCase().replace(/[\s_-]+/g, "");
  const matches = packages
    .filter((p) => !PROVIDED.test(p.full_name))
    .filter((p) => !q || nameOf(p).includes(compact) || p.owner.toLowerCase().includes(q) || p.versions[0].description.toLowerCase().includes(q))
    .sort((a, b) => Number(nameOf(b).includes(compact)) - Number(nameOf(a).includes(compact)) || totalDownloads(b) - totalDownloads(a));
  const installed = await existingNames(server, BEPINEX_DIR);
  const items: ModItem[] = matches.slice(Math.max(0, offset), Math.max(0, offset) + 20).map((p) => ({
    id: p.full_name,
    slug: p.full_name,
    title: p.name.replace(/_/g, " "),
    description: p.versions[0].description,
    author: p.owner,
    downloads: totalDownloads(p),
    iconUrl: p.versions[0].icon || null,
    url: p.package_url,
    installed: installed.has(p.full_name.toLowerCase()),
    tags: p.categories.slice(0, 4),
  }));
  return { items, total: matches.length, source: "Thunderstore", folder: "bepinex/plugins" };
}

/** Ставит мод и его зависимости (кроме BepInEx, который уже есть в образе). Каждый — в свою папку. */
export async function installThunderstore(server: Server, fullName: string) {
  requireVariant(server, "valheim", "bepinex", "BepInEx");
  const { byName } = await thunderstorePackages();
  const root = byName.get(fullName.toLowerCase());
  if (!root) throw fail("Mod not found on Thunderstore", 404);
  const installed: string[] = [];
  const visit = async (pkg: TsPackage, seen: Set<string>) => {
    if (seen.has(pkg.full_name) || PROVIDED.test(pkg.full_name)) return;
    seen.add(pkg.full_name);
    const latest = pkg.versions[0];
    for (const dep of latest.dependencies) {
      const depName = dep.replace(/-\d+\.\d+\.\d+$/, "");
      const depPkg = byName.get(depName.toLowerCase());
      if (depPkg) await visit(depPkg, seen);
    }
    const zip = await download(latest.download_url, /(^|\.)thunderstore\.io$/);
    const dir = `${BEPINEX_DIR}/${pkg.full_name}`;
    await removePath(server, dir).catch(() => {});
    const archive = await writeFileStream(server, dir, "package.zip", Readable.from(zip));
    await extractArchive(server, archive);
    await removePath(server, archive);
    installed.push(`${pkg.name} ${latest.version_number}`);
  };
  await visit(root, new Set());
  return { file: installed.join(", "), path: `${BEPINEX_DIR}/${root.full_name}`, note: "Restart the server to load the mods. Players need the same mods if a mod is not server-only." };
}
