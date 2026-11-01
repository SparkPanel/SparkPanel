import type { ActivityType, Server } from "@shared/schema";
import { storage } from "./storage";
import { dockerManager } from "./docker-manager";
import { killGameServer, restartGameServer, startGameServer, stopGameServer } from "./game-server";
import { logStreamer } from "./log-streamer";
import { pluginManager } from "./plugins/plugin-manager";
import { suspensionOf } from "./server-access";

export type PowerAction = "start" | "stop" | "restart" | "kill";

const inProgress = new Set<string>();

const TRANSITION: Record<PowerAction, string> = {
  start: "starting",
  stop: "stopping",
  restart: "starting",
  kill: "stopping",
};

const ACTIVITY: Record<PowerAction, { type: ActivityType; title: string; verb: string; hook: string }> = {
  start: { type: "server_start", title: "Server Started", verb: "started", hook: "server_start" },
  stop: { type: "server_stop", title: "Server Stopped", verb: "stopped", hook: "server_stop" },
  restart: { type: "server_restart", title: "Server Restarted", verb: "restarted", hook: "server_restart" },
  kill: { type: "server_stop", title: "Server Killed", verb: "killed", hook: "server_stop" },
};

export function isActionInProgress(serverId: string): boolean {
  return inProgress.has(serverId);
}

/**
 * Выполняет действие с питанием сервера. Сразу выставляет переходный статус (starting/stopping),
 * а итог (running/stopped/error) сообщает подписчикам консоли через WebSocket.
 * Возвращает промис завершения операции — вызывающий код может не ждать его (долгая загрузка образа).
 */
export async function beginServerAction(server: Server, action: PowerAction, userId?: string): Promise<{ done: Promise<void> }> {
  if (inProgress.has(server.id)) {
    throw Object.assign(new Error("Another operation is already in progress for this server"), { status: 409 });
  }
  const suspended = action !== "stop" && action !== "kill" ? suspensionOf(server.id) : null;
  if (suspended) throw Object.assign(new Error(`The server is suspended: ${suspended.reason}`), { status: 423 });
  const node = await storage.getNode(server.nodeId);
  if (!node) throw Object.assign(new Error("Node not found"), { status: 404 });
  if (action !== "stop" && action !== "kill" && !(await dockerManager.checkNodeConnection(node))) {
    await storage.updateNode(node.id, { status: "offline" });
    throw Object.assign(new Error(`Node '${node.name}' is offline`), { status: 503 });
  }

  inProgress.add(server.id);
  const transitional = (await storage.updateServer(server.id, { status: TRANSITION[action] })) ?? server;
  logStreamer.broadcastStatus(server.id, transitional.status);

  const done = (async () => {
    const meta = ACTIVITY[action];
    try {
      if (action === "start") await startGameServer(transitional);
      else if (action === "stop") await stopGameServer(transitional);
      else if (action === "restart") await restartGameServer(transitional);
      else await killGameServer(transitional);

      const fresh = (await storage.getServer(server.id)) ?? transitional;
      await logStreamer.notifyStatus(fresh, `Server ${meta.verb}`);
      await storage
        .addActivity({ type: meta.type, title: meta.title, description: `Server '${server.name}' was ${meta.verb}`, timestamp: new Date(), userId })
        .catch(() => {});
      await pluginManager
        .callHook(meta.hook, server.id, { id: server.id, name: server.name, gameType: server.gameType, nodeId: server.nodeId })
        .catch(() => {});
    } catch (error: any) {
      console.error(`Server ${action} failed for ${server.id}:`, error?.message || error);
      const failed = (await storage.updateServer(server.id, { status: action === "stop" || action === "kill" ? "running" : "error" })) ?? transitional;
      await logStreamer.notifyStatus(failed, `Failed to ${action} server: ${error?.message || error}`);
      await storage
        .addActivity({
          type: meta.type,
          title: `Server ${action} failed`,
          description: `Server '${server.name}': ${error?.message || error}`,
          timestamp: new Date(),
          userId,
        })
        .catch(() => {});
      throw error;
    } finally {
      inProgress.delete(server.id);
    }
  })();
  return { done };
}

/** Запускает серверы с включённым автозапуском после старта панели. */
export async function autoStartServers(): Promise<void> {
  const servers = await storage.getAllServers();
  for (const server of servers.filter((s) => s.autoStart)) {
    try {
      const node = await storage.getNode(server.nodeId);
      if (!node) continue;
      if (server.containerId) {
        try {
          const info = await dockerManager.getDockerClient(node).getContainer(server.containerId).inspect();
          if (info.State?.Running) {
            await storage.updateServer(server.id, { status: "running" });
            continue;
          }
        } catch {
        }
      }
      const { done } = await beginServerAction(server, "start");
      done.catch(() => {});
    } catch (error: any) {
      console.error(`Auto-start failed for server ${server.name}:`, error?.message || error);
    }
  }
}
