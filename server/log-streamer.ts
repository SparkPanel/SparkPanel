import { WebSocket } from "ws";
import type { Duplex } from "stream";
import type { ConsoleLog, Server } from "@shared/schema";
import { dockerManager } from "./docker-manager";
import { storage } from "./storage";
import { DockerStreamDemuxer, demuxBuffer } from "./container-utils";

const HISTORY_LINES = 300;
const CONTROL_PATTERN = /\x1b\[[0-9;?]*[ -/]*[@-ln-~]|\x1b\][^\x07]*\x07|\r/g;
const SGR_PATTERN = /\x1b\[[0-9;]*m/g;

interface ServerStream {
  stream: Duplex;
  partial: { stdout: string; stderr: string };
}

/**
 * Транслирует вывод игрового контейнера подписанным WebSocket-клиентам и передаёт команды в stdin.
 * На каждый сервер открывается одно attach-соединение (stdin+stdout+stderr).
 */
export class LogStreamer {
  private streams = new Map<string, ServerStream>();
  private connecting = new Map<string, Promise<ServerStream | null>>();
  private subscribers = new Map<string, Set<WebSocket>>();

  hasSubscribers(serverId: string): boolean {
    return (this.subscribers.get(serverId)?.size ?? 0) > 0;
  }

  isAttached(serverId: string): boolean {
    return this.streams.has(serverId);
  }

  subscribedServerIds(): string[] {
    return Array.from(this.subscribers.keys());
  }

  /** Подписывает клиента: отправляет историю логов и подключается к живому потоку. */
  async subscribe(server: Server, ws: WebSocket): Promise<void> {
    if (!this.subscribers.has(server.id)) this.subscribers.set(server.id, new Set());
    this.subscribers.get(server.id)!.add(ws);

    await this.sendHistory(server, ws);
    if (server.status === "running") {
      await this.attach(server);
    }
  }

  unsubscribe(serverId: string, ws: WebSocket): void {
    const set = this.subscribers.get(serverId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) {
      this.subscribers.delete(serverId);
      this.detach(serverId);
    }
  }

  unsubscribeAll(ws: WebSocket): void {
    for (const serverId of Array.from(this.subscribers.keys())) {
      this.unsubscribe(serverId, ws);
    }
  }

  private async sendHistory(server: Server, ws: WebSocket): Promise<void> {
    if (!server.containerId) return;
    try {
      const node = await storage.getNode(server.nodeId);
      if (!node) return;
      const container = await dockerManager.getContainer(node, server.containerId);
      const raw = (await container.logs({ stdout: true, stderr: true, tail: HISTORY_LINES, follow: false })) as unknown as Buffer;
      const { stdout, stderr } = demuxBuffer(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw)));
      const lines = [...this.toLines(stdout.toString("utf-8"), false), ...this.toLines(stderr.toString("utf-8"), true)];
      if (lines.length && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "history", serverId: server.id, logs: lines }));
      }
    } catch (error: any) {
      if (error?.statusCode !== 404) console.error(`Failed to load log history for ${server.id}:`, error?.message || error);
    }
  }

  private toLines(text: string, isStderr: boolean): ConsoleLog[] {
    const now = Date.now();
    return text
      .replace(CONTROL_PATTERN, "")
      .split("\n")
      .filter((line) => line.replace(SGR_PATTERN, "").trim())
      .map((line) => ({ timestamp: now, message: line, type: isStderr ? "error" : this.detectLogType(line.replace(SGR_PATTERN, "")) }));
  }

  /** Подключается к контейнеру, если ещё нет соединения. */
  async attach(server: Server): Promise<ServerStream | null> {
    const existing = this.streams.get(server.id);
    if (existing) return existing;
    const pending = this.connecting.get(server.id);
    if (pending) return pending;

    const task = this.openStream(server).finally(() => this.connecting.delete(server.id));
    this.connecting.set(server.id, task);
    return task;
  }

  private async openStream(server: Server): Promise<ServerStream | null> {
    if (!server.containerId) return null;
    const node = await storage.getNode(server.nodeId);
    if (!node) return null;
    const container = await dockerManager.getContainer(node, server.containerId);
    const stream = (await container.attach({ stream: true, stdin: true, stdout: true, stderr: true, logs: false, hijack: true })) as unknown as Duplex;

    const entry: ServerStream = { stream, partial: { stdout: "", stderr: "" } };
    const demuxer = new DockerStreamDemuxer((type, payload) => {
      const text = entry.partial[type] + payload.toString("utf-8");
      const parts = text.split("\n");
      entry.partial[type] = parts.pop() ?? "";
      for (const line of parts) {
        const clean = line.replace(CONTROL_PATTERN, "");
        const plain = clean.replace(SGR_PATTERN, "");
        if (!plain.trim()) continue;
        this.broadcast(server.id, {
          timestamp: Date.now(),
          message: clean,
          type: type === "stderr" ? "error" : this.detectLogType(plain),
        });
      }
    });

    const cleanup = () => {
      stream.removeAllListeners();
      if (this.streams.get(server.id) === entry) this.streams.delete(server.id);
    };
    stream.on("data", (chunk: Buffer) => demuxer.push(chunk));
    stream.on("end", cleanup);
    stream.on("close", cleanup);
    stream.on("error", (error: Error) => {
      console.error(`Console stream error for server ${server.id}:`, error.message);
      cleanup();
    });

    this.streams.set(server.id, entry);
    return entry;
  }

  detach(serverId: string): void {
    const entry = this.streams.get(serverId);
    if (entry) {
      entry.stream.removeAllListeners();
      entry.stream.destroy();
      this.streams.delete(serverId);
    }
  }

  /** Сообщает подписчикам о смене состояния и переподключает поток к (возможно, новому) контейнеру. */
  async notifyStatus(server: Server, message: string): Promise<void> {
    this.detach(server.id);
    if (server.status === "running" && this.hasSubscribers(server.id)) {
      await this.attach(server).catch((err) => console.error(`Reattach failed for ${server.id}:`, err.message));
      for (const ws of Array.from(this.subscribers.get(server.id) ?? [])) {
        await this.sendHistory(server, ws);
      }
    }
    this.broadcast(server.id, { timestamp: Date.now(), message: `[SparkPanel] ${message}`, type: "system" });
    this.broadcastStatus(server.id, server.status);
  }

  /** Пишет команду в stdin процесса игрового сервера. */
  async sendCommand(server: Server, command: string): Promise<void> {
    if (server.status !== "running") throw new Error("Server is not running");
    const entry = await this.attach(server);
    if (!entry || !entry.stream.writable) throw new Error("Console is not available");
    await new Promise<void>((resolve, reject) => {
      entry.stream.write(command + "\n", (err) => (err ? reject(err) : resolve()));
    });
    if (!this.hasSubscribers(server.id)) this.detach(server.id);
  }

  private detectLogType(message: string): ConsoleLog["type"] {
    const lower = message.toLowerCase();
    if (/\b(error|exception|fatal|severe)\b/.test(lower)) return "error";
    if (/\bwarn(ing)?\b/.test(lower)) return "warn";
    if (lower.includes("[sparkpanel]")) return "system";
    return "info";
  }

  broadcastStatus(serverId: string, status: string): void {
    this.send(serverId, { type: "status", serverId, status });
  }

  private broadcast(serverId: string, log: ConsoleLog): void {
    this.send(serverId, { type: "log", serverId, log });
  }

  private send(serverId: string, message: unknown): void {
    const set = this.subscribers.get(serverId);
    if (!set) return;
    const payload = JSON.stringify(message);
    set.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    });
  }
}

export const logStreamer = new LogStreamer();
