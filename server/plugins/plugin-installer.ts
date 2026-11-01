import AdmZip from "adm-zip";
import tar from "tar-stream";
import { createReadStream } from "fs";
import { mkdir, writeFile, rm, copyFile } from "fs/promises";
import { createGunzip } from "zlib";
import { posix, join, resolve, extname, basename, dirname } from "path";
import { pipeline } from "stream/promises";
import type { PluginManifest } from "./plugin-manager";

const PLUGIN_ID_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/;
const MAX_ARCHIVE_ENTRIES = 5000;
const MAX_EXTRACTED_BYTES = 500 * 1024 * 1024;

interface ArchiveEntry {
  name: string;
  data: Buffer;
}

async function readZip(file: string): Promise<ArchiveEntry[]> {
  const zip = new AdmZip(file);
  return zip
    .getEntries()
    .filter((entry) => !entry.isDirectory)
    .map((entry) => ({ name: entry.entryName, data: entry.getData() }));
}

async function readTarGz(file: string): Promise<ArchiveEntry[]> {
  const entries: ArchiveEntry[] = [];
  const extract = tar.extract();
  extract.on("entry", (header, stream, next) => {
    if (header.type !== "file") {
      stream.resume();
      stream.on("end", next);
      return;
    }
    const chunks: Buffer[] = [];
    stream.on("data", (c: unknown) => chunks.push(c as Buffer));
    stream.on("end", () => {
      entries.push({ name: header.name, data: Buffer.concat(chunks) });
      next();
    });
  });
  await pipeline(createReadStream(file), createGunzip(), extract);
  return entries;
}

function safeRelative(name: string): string | null {
  const normalized = posix.normalize(name.replace(/\\/g, "/")).replace(/^\/+/, "");
  if (!normalized || normalized.startsWith("..") || normalized.includes("/../")) return null;
  return normalized;
}

function detectType(fileName: string): PluginManifest["type"] {
  const ext = extname(fileName).toLowerCase();
  if (ext === ".py") return "python";
  if (ext === ".jar") return "jar";
  if (ext === ".ts") return "typescript";
  return "javascript";
}

export interface InstallMeta {
  pluginId?: string;
  name?: string;
  version?: string;
  description?: string;
  author?: string;
  type?: string;
}

function clean(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, max);
  return trimmed || undefined;
}

/**
 * Устанавливает плагин из загруженного файла: одиночный скрипт (.js/.ts/.py/.jar) или архив (.zip/.tar.gz)
 * с manifest.json (в корне или в единственной папке верхнего уровня). Возвращает итоговый манифест.
 */
export async function installPlugin(pluginsDir: string, uploadedFile: string, originalName: string, meta: InstallMeta): Promise<PluginManifest> {
  const lower = originalName.toLowerCase();
  const isZip = lower.endsWith(".zip");
  const isTarGz = lower.endsWith(".tar.gz") || lower.endsWith(".tgz");

  let files: ArchiveEntry[] = [];
  let archiveManifest: Partial<PluginManifest> = {};
  let mainFile: string;

  if (isZip || isTarGz) {
    const entries = isZip ? await readZip(uploadedFile) : await readTarGz(uploadedFile);
    if (entries.length > MAX_ARCHIVE_ENTRIES) throw new Error("Archive contains too many files");
    const manifestEntry = entries
      .filter((e) => basename(e.name) === "manifest.json")
      .sort((a, b) => a.name.split("/").length - b.name.split("/").length)[0];
    if (!manifestEntry) throw new Error("manifest.json not found in archive");
    const prefix = dirname(manifestEntry.name) === "." ? "" : `${dirname(manifestEntry.name)}/`;
    try {
      archiveManifest = JSON.parse(manifestEntry.data.toString("utf-8"));
    } catch {
      throw new Error("manifest.json is not valid JSON");
    }
    let total = 0;
    for (const entry of entries) {
      if (!entry.name.startsWith(prefix)) continue;
      const relative = safeRelative(entry.name.slice(prefix.length));
      if (!relative) throw new Error(`Unsafe path in archive: ${entry.name}`);
      total += entry.data.length;
      if (total > MAX_EXTRACTED_BYTES) throw new Error("Archive is too large when extracted");
      files.push({ name: relative, data: entry.data });
    }
    if (!archiveManifest.main) throw new Error("manifest.json must contain 'main'");
    mainFile = archiveManifest.main;
  } else {
    mainFile = basename(originalName);
  }

  const pluginId = clean(meta.pluginId, 100) || clean(archiveManifest.id, 100) || basename(originalName).replace(/(\.tar\.gz|\.tgz|\.[^.]+)$/i, "");
  if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error("Invalid plugin ID (allowed: letters, digits, . _ -)");

  const pluginPath = resolve(join(pluginsDir, pluginId));
  if (!files.some((f) => f.name === mainFile) && (isZip || isTarGz)) {
    throw new Error(`Main file '${mainFile}' not found in archive`);
  }

  await rm(pluginPath, { recursive: true, force: true });
  await mkdir(pluginPath, { recursive: true });
  if (isZip || isTarGz) {
    for (const file of files) {
      const target = resolve(join(pluginPath, file.name));
      if (!target.startsWith(pluginPath)) throw new Error(`Unsafe path in archive: ${file.name}`);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.data);
    }
  } else {
    await copyFile(uploadedFile, join(pluginPath, mainFile));
  }

  const allowedTypes = ["javascript", "typescript", "python", "jar"];
  const requestedType = clean(meta.type, 20);
  const manifest: PluginManifest = {
    id: pluginId,
    name: clean(meta.name, 100) || clean(archiveManifest.name, 100) || pluginId,
    version: clean(meta.version, 20) || clean(archiveManifest.version, 20) || "1.0.0",
    description: clean(meta.description, 500) || clean(archiveManifest.description, 500) || "",
    author: clean(meta.author, 100) || clean(archiveManifest.author, 100) || "Unknown",
    type: (requestedType && allowedTypes.includes(requestedType)
      ? requestedType
      : archiveManifest.type && allowedTypes.includes(archiveManifest.type)
        ? archiveManifest.type
        : detectType(mainFile)) as PluginManifest["type"],
    enabled: false,
    main: mainFile,
    hooks: Array.isArray(archiveManifest.hooks) ? archiveManifest.hooks.filter((h) => typeof h === "string") : undefined,
  };
  await writeFile(join(pluginPath, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");
  return manifest;
}
