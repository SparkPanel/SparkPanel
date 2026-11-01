import { createHash } from "crypto";
import { gzipSync } from "zlib";
import type { NextFunction, Request, Response } from "express";

/**
 * Кеш тяжёлых JSON-ответов (список серверов, журнал, графики). Вкладки панели опрашивают их каждые несколько
 * секунд, а данные меняются редко: ответ собирается и сжимается один раз, остальным клиентам отдаётся готовым,
 * а если у клиента он уже есть — только «304 Not Modified» без тела.
 * Любой изменяющий запрос (не GET) сбрасывает кеш сразу; фоновые изменения (статусы серверов) видны через ttl.
 */
interface Entry {
  revision: number;
  at: number;
  etag: string;
  body: Buffer;
  gzip: Buffer | null;
}

const MAX_ENTRIES = 500;
const GZIP_FROM = 1024;
const entries = new Map<string, Entry>();
let revision = 0;

export function invalidateResponseCache(): void {
  revision += 1;
}

/** Сбрасывает кеш в начале и в конце каждого изменяющего запроса к API. */
export function invalidateOnWrite(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS" || !req.path.startsWith("/api")) return next();
  invalidateResponseCache();
  res.on("finish", invalidateResponseCache);
  next();
}

/**
 * Сбрасывает кеш при любой записи в хранилище — и из запросов, и из фоновых задач (автомасштабирование,
 * планировщик, сбор статуса серверов). Методы статистики не учитываются: они меняются каждые несколько секунд.
 */
export function invalidateOnStorageWrites(target: object): void {
  const writes = /^(create|update|delete|add|remove|consume)[A-Z]/;
  const skip = new Set(["deleteServerStats"]);
  let proto = Object.getPrototypeOf(target);
  const names = new Set<string>();
  while (proto && proto !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(proto)) if (writes.test(name) && !skip.has(name)) names.add(name);
    proto = Object.getPrototypeOf(proto);
  }
  const instance = target as Record<string, unknown>;
  for (const name of Array.from(names)) {
    const original = instance[name];
    if (typeof original !== "function") continue;
    instance[name] = async function (this: unknown, ...args: unknown[]) {
      try {
        return await (original as (...a: unknown[]) => unknown).apply(target, args);
      } finally {
        invalidateResponseCache();
      }
    };
  }
}

export async function sendCachedJson(req: Request, res: Response, key: string, ttlMs: number, build: () => unknown | Promise<unknown>): Promise<void> {
  let entry = entries.get(key);
  if (!entry || entry.revision !== revision || Date.now() - entry.at > ttlMs) {
    const startRevision = revision;
    const body = Buffer.from(JSON.stringify(await build()));
    entry = {
      revision: startRevision,
      at: Date.now(),
      etag: `W/"${createHash("sha1").update(body).digest("base64url").slice(0, 27)}"`,
      body,
      gzip: body.length >= GZIP_FROM ? gzipSync(body, { level: 6 }) : null,
    };
    entries.delete(key);
    entries.set(key, entry);
    if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
  }

  res.setHeader("ETag", entry.etag);
  res.setHeader("Cache-Control", "private, no-cache");
  res.setHeader("Vary", "Accept-Encoding");
  if (req.headers["if-none-match"] === entry.etag) {
    res.status(304).end();
    return;
  }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (entry.gzip && /\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""))) {
    res.setHeader("Content-Encoding", "gzip");
    res.end(entry.gzip);
  } else {
    res.end(entry.body);
  }
}
