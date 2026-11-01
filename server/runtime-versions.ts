import { findRuntime, type RuntimeVersion, type RuntimeVersionSource } from "@shared/runtimes";

const CACHE_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

const cache = new Map<string, { at: number; versions: RuntimeVersion[] }>();

async function getJson(url: string, headers: Record<string, string> = {}): Promise<{ body: any; next: string | null }> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const link = res.headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
  return { body: await res.json(), next: link ? new URL(link, url).href : null };
}

/** Все теги репозитория через Registry API (Docker Hub — с анонимным токеном, MCR — без него). */
async function listTags(source: RuntimeVersionSource): Promise<string[]> {
  let url: string | null;
  const headers: Record<string, string> = {};
  if (source.registry === "mcr") {
    url = `https://mcr.microsoft.com/v2/${source.repository}/tags/list`;
  } else {
    const auth = await getJson(`https://auth.docker.io/token?service=registry.docker.io&scope=repository:${source.repository}:pull`);
    headers.Authorization = `Bearer ${auth.body.token}`;
    url = `https://registry-1.docker.io/v2/${source.repository}/tags/list?n=10000`;
  }
  const tags: string[] = [];
  for (let page = 0; url && page < 20; page += 1) {
    const { body, next } = await getJson(url, headers);
    tags.push(...(body.tags ?? []));
    url = next;
  }
  return tags;
}

/** Сравнение номеров версий по убыванию: 3.14 > 3.9 > 2.7. */
function compareVersionsDesc(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * У .NET тег вида "11.0" появляется уже на стадии RC — какие каналы ещё не вышли, видно только
 * из официального индекса релизов (support-phase "preview" или "go-live").
 */
async function dotnetPrereleaseChannels(): Promise<Set<string>> {
  const { body } = await getJson("https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json");
  return new Set(
    (body["releases-index"] ?? [])
      .filter((r: any) => r["support-phase"] === "preview" || r["support-phase"] === "go-live")
      .map((r: any) => String(r["channel-version"])),
  );
}

async function versionsFrom(source: RuntimeVersionSource): Promise<RuntimeVersion[]> {
  const pattern = new RegExp(source.tagPattern);
  const found = new Map<string, string>();
  for (const tag of await listTags(source)) {
    const version = tag.match(pattern)?.[1];
    if (version) found.set(version, tag);
  }
  const prerelease = source.repository.startsWith("dotnet/") ? await dotnetPrereleaseChannels().catch(() => new Set<string>()) : new Set<string>();
  return Array.from(found.keys())
    .sort(compareVersionsDesc)
    .map((v) => ({
      label: source.label.replace("{v}", v) + (prerelease.has(v) ? " (preview)" : ""),
      image: source.image.replace("{tag}", found.get(v)!),
      ...(prerelease.has(v) ? { prerelease: true } : {}),
    }));
}

/**
 * Версии среды из реестра образов: первая — самая новая. Список кэшируется на 6 часов;
 * если реестр недоступен, возвращается встроенный список из каталога.
 */
export async function getRuntimeVersions(runtimeId: string): Promise<{ versions: RuntimeVersion[]; live: boolean }> {
  const runtime = findRuntime(runtimeId);
  if (!runtime) throw Object.assign(new Error("Unknown runtime"), { status: 404 });

  const cached = cache.get(runtime.id);
  if (cached && Date.now() - cached.at < CACHE_MS) return { versions: cached.versions, live: true };

  try {
    const versions = (await Promise.all(runtime.sources.map(versionsFrom))).flat();
    if (versions.length === 0) throw new Error("no matching tags");
    cache.set(runtime.id, { at: Date.now(), versions });
    return { versions, live: true };
  } catch (error) {
    console.warn(`Failed to load versions for runtime ${runtime.id}:`, (error as Error).message);
    return { versions: cached?.versions ?? runtime.versions, live: false };
  }
}
