import { createHash, createHmac } from "crypto";
import http from "http";
import https from "https";
import type { Readable } from "stream";
import { settingsStore } from "./data-dir";

/**
 * Внешнее хранилище бэкапов: любой S3-совместимый сервис (AWS S3, Cloudflare R2, Backblaze B2, Wasabi, MinIO).
 * Запросы подписываются AWS Signature V4 вручную — без SDK.
 */
export interface BackupStorageSettings {
  enabled: boolean;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
  /** Адрес вида endpoint/bucket/key (MinIO, большинство самостоятельных установок) вместо bucket.endpoint/key. */
  pathStyle: boolean;
  /** Оставлять копию архива на диске панели после загрузки. */
  keepLocal: boolean;
}

const KEY = "backup-storage";
const DEFAULTS: BackupStorageSettings = { enabled: false, endpoint: "", region: "us-east-1", bucket: "", accessKeyId: "", secretAccessKey: "", prefix: "sparkpanel", pathStyle: true, keepLocal: true };

/** S3 разрешает загрузку одним запросом до 5 ГБ. */
export const SINGLE_PUT_LIMIT = 5 * 1024 ** 3;

export function getBackupStorage(): BackupStorageSettings {
  return { ...DEFAULTS, ...settingsStore.get<Partial<BackupStorageSettings>>(KEY, {}) };
}

/** Для ответа API: секретный ключ не возвращается. */
export function publicBackupStorage() {
  const { secretAccessKey, ...rest } = getBackupStorage();
  return { ...rest, hasSecret: Boolean(secretAccessKey) };
}

export async function saveBackupStorage(input: Partial<BackupStorageSettings>): Promise<BackupStorageSettings> {
  const current = getBackupStorage();
  const next: BackupStorageSettings = {
    ...current,
    ...input,
    secretAccessKey: input.secretAccessKey ? input.secretAccessKey : current.secretAccessKey,
    endpoint: (input.endpoint ?? current.endpoint).trim().replace(/\/+$/, ""),
    prefix: (input.prefix ?? current.prefix).trim().replace(/^\/+|\/+$/g, ""),
  };
  if (next.enabled) {
    if (!/^https?:\/\/[^\s/]+/.test(next.endpoint)) throw Object.assign(new Error("Enter the storage address, for example https://s3.eu-central-1.amazonaws.com"), { status: 400 });
    if (!/^[a-z0-9][a-z0-9.\-]{1,61}[a-z0-9]$/.test(next.bucket)) throw Object.assign(new Error("Enter a valid bucket name"), { status: 400 });
    if (!next.accessKeyId || !next.secretAccessKey) throw Object.assign(new Error("Enter the access key and secret key"), { status: 400 });
    if (!next.region) throw Object.assign(new Error("Enter the region (use us-east-1 if the provider has none)"), { status: 400 });
  }
  await settingsStore.set(KEY, next);
  return next;
}

const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();
const encodeKey = (key: string) =>
  key
    .split("/")
    .map((part) => encodeURIComponent(part).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");

interface S3Request {
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  key: string;
  body?: Readable | Buffer;
  length?: number;
}

function objectUrl(s: BackupStorageSettings, key: string): URL {
  const base = new URL(s.endpoint);
  const path = encodeKey(key);
  if (s.pathStyle) return new URL(`${base.origin}${base.pathname.replace(/\/$/, "")}/${s.bucket}/${path}`);
  return new URL(`${base.protocol}//${s.bucket}.${base.host}/${path}`);
}

/** Выполняет подписанный запрос и возвращает ответ (тело ответа читает вызывающий). */
function send(s: BackupStorageSettings, req: S3Request): Promise<http.IncomingMessage> {
  const url = objectUrl(s, req.key);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const payloadHash = Buffer.isBuffer(req.body) ? sha256(req.body) : req.body ? "UNSIGNED-PAYLOAD" : sha256("");
  const headers: Record<string, string> = { host: url.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  const signed = Object.keys(headers).sort();
  const canonicalHeaders = signed.map((h) => `${h}:${headers[h]}\n`).join("");
  const canonical = [req.method, url.pathname, "", canonicalHeaders, signed.join(";"), payloadHash].join("\n");
  const scope = `${day}/${s.region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${s.secretAccessKey}`, day), s.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(toSign).digest("hex");
  const outHeaders: Record<string, string | number> = {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${s.accessKeyId}/${scope}, SignedHeaders=${signed.join(";")}, Signature=${signature}`,
  };
  const length = Buffer.isBuffer(req.body) ? req.body.length : req.length;
  if (req.body !== undefined) outHeaders["content-length"] = length ?? 0;

  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const request = client.request(url, { method: req.method, headers: outHeaders, timeout: 60_000 }, resolve);
    request.on("error", reject);
    request.on("timeout", () => request.destroy(new Error("The storage did not answer in time")));
    if (Buffer.isBuffer(req.body)) request.end(req.body);
    else if (req.body) {
      req.body.on("error", (err) => request.destroy(err));
      req.body.pipe(request);
    } else request.end();
  });
}

async function readBody(res: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of res) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8");
}

async function expectOk(res: http.IncomingMessage, what: string): Promise<void> {
  if (res.statusCode && res.statusCode < 300) {
    res.resume();
    return;
  }
  const text = await readBody(res);
  const code = text.match(/<Code>([^<]+)<\/Code>/)?.[1];
  const message = text.match(/<Message>([^<]+)<\/Message>/)?.[1];
  throw new Error(`${what} failed: ${[code, message].filter(Boolean).join(" — ") || `HTTP ${res.statusCode}`}`);
}

export const remoteBackupKey = (s: BackupStorageSettings, serverId: string, backupId: string) => `${s.prefix ? `${s.prefix}/` : ""}${serverId}/${backupId}.tar.gz`;

export async function uploadObject(s: BackupStorageSettings, key: string, body: Readable, length: number): Promise<void> {
  if (length > SINGLE_PUT_LIMIT) throw new Error("Backups larger than 5 GB cannot be sent to S3 storage");
  await expectOk(await send(s, { method: "PUT", key, body, length }), "Upload to backup storage");
}

export async function downloadObject(s: BackupStorageSettings, key: string): Promise<Readable> {
  const res = await send(s, { method: "GET", key });
  if (res.statusCode === 404) {
    res.resume();
    throw new Error("The backup archive is not in the backup storage");
  }
  if (res.statusCode && res.statusCode >= 300) await expectOk(res, "Download from backup storage");
  return res;
}

export async function objectExists(s: BackupStorageSettings, key: string): Promise<boolean> {
  const res = await send(s, { method: "HEAD", key });
  res.resume();
  return res.statusCode === 200;
}

export async function deleteObject(s: BackupStorageSettings, key: string): Promise<void> {
  const res = await send(s, { method: "DELETE", key });
  if (res.statusCode === 404) return void res.resume();
  await expectOk(res, "Delete from backup storage");
}

/** Проверка настроек: записывает, читает и удаляет небольшой файл. */
export async function testBackupStorage(s: BackupStorageSettings): Promise<void> {
  const key = `${s.prefix ? `${s.prefix}/` : ""}.sparkpanel-check`;
  const content = Buffer.from(`SparkPanel storage check ${new Date().toISOString()}`);
  await expectOk(await send(s, { method: "PUT", key, body: content }), "Writing a test file");
  const back = await readBody(await downloadObject(s, key));
  if (back !== content.toString()) throw new Error("The test file read back does not match what was written");
  await deleteObject(s, key);
}
