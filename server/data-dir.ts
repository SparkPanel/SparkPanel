import { mkdirSync, existsSync, readFileSync } from "fs";
import { writeFile, rename } from "fs/promises";
import { join, resolve } from "path";

/**
 * Корневой каталог постоянных данных панели (бэкапы, настройки, файловое хранилище).
 * В Docker-образе монтируется как том.
 */
export const DATA_DIR = resolve(process.env.DATA_DIR || join(process.cwd(), "data"));

export function ensureDir(dir: string): string {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

ensureDir(DATA_DIR);

export function dataPath(...parts: string[]): string {
  return join(DATA_DIR, ...parts);
}

export function readJsonSync<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

const writeQueues = new Map<string, Promise<void>>();

/**
 * Атомарная запись JSON (через временный файл) с сериализацией параллельных записей.
 */
export function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  const previous = writeQueues.get(file) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(async () => {
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
      await rename(tmp, file);
    });
  writeQueues.set(file, next);
  return next;
}

/**
 * Простое персистентное key-value хранилище настроек панели в DATA_DIR/settings.json.
 */
class SettingsStore {
  private file = dataPath("settings.json");
  private data: Record<string, unknown> = readJsonSync(this.file, {});

  get<T>(key: string, fallback: T): T {
    return (this.data[key] as T) ?? fallback;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data[key] = value;
    await writeJsonAtomic(this.file, this.data);
  }
}

export const settingsStore = new SettingsStore();
