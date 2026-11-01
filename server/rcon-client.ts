import { existsSync } from "fs";
import { Socket } from "net";
import { WebSocket } from "ws";
import type { Node } from "@shared/schema";
import { isLocalNode } from "./docker-manager";

/**
 * Клиенты RCON для игровых серверов. Порт RCON опубликован на ноде, поэтому панель подключается к нему
 * по адресу ноды. Для локальной ноды — к самой машине: 127.0.0.1, а если панель работает в контейнере
 * (Docker Compose) — к host.docker.internal.
 */
export function rconHost(node: Node): string {
  if (!isLocalNode(node)) return node.ip;
  return existsSync("/.dockerenv") ? "host.docker.internal" : "127.0.0.1";
}

const fail = (message: string, status = 502) => Object.assign(new Error(message), { status });

/**
 * Source RCON (Valve): CS2, Garry's Mod, ARK, Minecraft. Пакет: размер (int32 LE), id, тип, тело, два нуля.
 * Тип 3 — авторизация, 2 — команда, 0 — ответ. Длинные ответы приходят несколькими пакетами — собираем их,
 * пока сервер не замолчит.
 */
export function sourceRcon(host: string, port: number, password: string, command: string, timeoutMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let buffer = Buffer.alloc(0);
    let authed = false;
    let body = "";
    let idleTimer: NodeJS.Timeout | null = null;
    const overall = setTimeout(() => finish(body ? null : fail("The game server did not answer RCON in time")), timeoutMs);

    const finish = (error: Error | null) => {
      clearTimeout(overall);
      if (idleTimer) clearTimeout(idleTimer);
      socket.destroy();
      error ? reject(error) : resolve(body.trim());
    };
    const packet = (id: number, type: number, text: string) => {
      const payload = Buffer.from(text, "utf8");
      const out = Buffer.alloc(14 + payload.length);
      out.writeInt32LE(10 + payload.length, 0);
      out.writeInt32LE(id, 4);
      out.writeInt32LE(type, 8);
      payload.copy(out, 12);
      return out;
    };

    socket.setTimeout(timeoutMs);
    socket.on("timeout", () => finish(fail("The game server did not answer RCON in time")));
    socket.on("error", (err) => finish(fail(`Cannot reach RCON: ${err.message}`)));
    socket.connect(port, host, () => socket.write(packet(1, 3, password)));
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const size = buffer.readInt32LE(0);
        if (buffer.length < size + 4) return;
        const id = buffer.readInt32LE(4);
        const type = buffer.readInt32LE(8);
        const text = buffer.toString("utf8", 12, 4 + size - 2);
        buffer = buffer.subarray(size + 4);
        if (!authed) {
          if (type !== 2) continue;
          if (id === -1) return finish(fail("RCON password rejected", 502));
          authed = true;
          socket.write(packet(2, 2, command));
          continue;
        }
        if (id === 2) {
          body += text;
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => finish(null), 300);
        }
      }
    });
  });
}

/** WebRCON Rust: WebSocket ws://адрес:порт/пароль, команды и ответы — JSON с полем Identifier. */
export function rustWebRcon(host: string, port: number, password: string, command: string, timeoutMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    const identifier = 1000 + Math.floor(Math.random() * 100000);
    const ws = new WebSocket(`ws://${host}:${port}/${encodeURIComponent(password)}`);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(fail("The game server did not answer RCON in time"));
    }, timeoutMs);
    ws.on("open", () => ws.send(JSON.stringify({ Identifier: identifier, Message: command, Name: "SparkPanel" })));
    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.Identifier !== identifier) return;
        clearTimeout(timer);
        ws.close();
        resolve(String(message.Message ?? "").trim());
      } catch {
      }
    });
    ws.on("unexpected-response", (_req, res) => {
      clearTimeout(timer);
      reject(fail(res.statusCode === 401 ? "RCON password rejected" : `RCON answered HTTP ${res.statusCode}`));
    });
    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(fail(`Cannot reach RCON: ${err.message}`));
    });
  });
}
