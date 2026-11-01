import { dockerManager } from "./docker-manager";
import { storage } from "./storage";
import { logStreamer } from "./log-streamer";
import { getVolumeUsage } from "./game-server";
import type { Server, Node, ServerStats, NodeStats } from "@shared/schema";
import { statsHistory } from "./stats-history";
import { notify } from "./notifier";
import { getCrashRestart } from "./game-templates";

const STATS_CONCURRENCY = 8;

/** Выполняет задачи над списком, не больше limit одновременно. */
async function mapWithLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

const GB = 1024 * 1024 * 1024;
const DISK_REFRESH_MS = 60_000;

/**
 * Собирает реальную статистику Docker и синхронизирует статус серверов с фактическим состоянием контейнеров
 * (например, если игровой сервер упал или был остановлен вне панели).
 */
export class StatsCollector {
  private diskCache = new Map<string, { bytes: number; at: number }>();
  private diskPending = new Set<string>();
  private nodeInfoCache = new Map<string, { cpus: number; memGb: number; at: number }>();
  /** Последний виденный счётчик перезапусков Docker — по его росту видно, что сервер упал и поднят снова. */
  private restartCounts = new Map<string, number>();

  /** Последнее известное занятое место на диске сервера (ГБ). */
  getDiskUsageGb(serverId: string): number {
    return (this.diskCache.get(serverId)?.bytes ?? 0) / GB;
  }

  private refreshDiskUsage(server: Server): void {
    const cached = this.diskCache.get(server.id);
    if ((cached && Date.now() - cached.at < DISK_REFRESH_MS) || this.diskPending.has(server.id)) return;
    this.diskPending.add(server.id);
    getVolumeUsage(server)
      .then((bytes) => this.diskCache.set(server.id, { bytes, at: Date.now() }))
      .catch((error) => console.debug(`Disk usage for ${server.id} unavailable:`, error.message))
      .finally(() => this.diskPending.delete(server.id));
  }

  /** Сверяет статус сервера в БД с состоянием контейнера. Возвращает актуальный сервер. */
  private async reconcileStatus(server: Server, node: Node): Promise<{ server: Server; running: boolean }> {
    if (!server.containerId) return { server, running: false };
    let running = false;
    let nextStatus = server.status;
    try {
      const info = await dockerManager.getDockerClient(node).getContainer(server.containerId).inspect();
      running = Boolean(info.State?.Running);
      this.trackCrashRestarts(server, info.RestartCount ?? 0);
      if (info.State?.Restarting) nextStatus = "starting";
      else if (running) nextStatus = "running";
      else if (info.State?.OOMKilled || (info.State?.ExitCode ?? 0) !== 0) nextStatus = server.status === "stopped" ? "stopped" : "error";
      else nextStatus = "stopped";
    } catch (error: any) {
      if (error?.statusCode === 404) {
        if (server.status === "starting" || server.status === "stopping") return { server, running: false };
        const updated = await storage.updateServer(server.id, { containerId: null, status: "stopped" });
        return { server: updated ?? server, running: false };
      }
      throw error;
    }

    if (nextStatus !== server.status && server.status !== "starting" && server.status !== "stopping") {
      const updated = (await storage.updateServer(server.id, { status: nextStatus })) ?? server;
      await logStreamer.notifyStatus(updated, `Server status changed: ${server.status} → ${nextStatus}`);
      if (nextStatus === "error") {
        const crash = getCrashRestart(server);
        notify(
          "server_crash",
          `${server.name} crashed`,
          crash.enabled
            ? `The server stopped with an error and was not brought back after ${crash.maxAttempts} automatic restarts. Check its console.`
            : "The server stopped with an error. Check its console, or turn on automatic restart in its settings.",
          server.id,
          60_000,
        );
        void storage.addActivity({ type: "security_event", title: "Server Crashed", description: `Server '${server.name}' stopped with an error`, timestamp: new Date() });
      }
      return { server: updated, running };
    }
    if (running && logStreamer.hasSubscribers(server.id) && !logStreamer.isAttached(server.id)) {
      await logStreamer.attach(server).catch(() => {});
    }
    return { server, running };
  }

  private trackCrashRestarts(server: Server, restartCount: number): void {
    const previous = this.restartCounts.get(server.id);
    this.restartCounts.set(server.id, restartCount);
    if (previous === undefined || restartCount <= previous) return;
    const crash = getCrashRestart(server);
    const attempt = `${restartCount} of ${crash.maxAttempts}`;
    void logStreamer.notifyStatus(server, `The server crashed and was restarted automatically (attempt ${attempt})`);
    void storage.addActivity({ type: "server_restart", title: "Restarted After Crash", description: `Server '${server.name}' crashed and was restarted (attempt ${attempt})`, timestamp: new Date() });
    notify("server_recovered", `${server.name} was restarted after a crash`, `Automatic restart, attempt ${attempt}.`);
  }

  async collectServerStats(server: Server, node: Node): Promise<ServerStats | null> {
    if (!server.containerId) return null;
    const container = await dockerManager.getContainer(node, server.containerId);
    const [stats, info] = await Promise.all([container.stats({ stream: false }), container.inspect()]);

    const cpuDelta = (stats.cpu_stats?.cpu_usage?.total_usage ?? 0) - (stats.precpu_stats?.cpu_usage?.total_usage ?? 0);
    const systemDelta = (stats.cpu_stats?.system_cpu_usage ?? 0) - (stats.precpu_stats?.system_cpu_usage ?? 0);
    const cpuPercentOfNode = systemDelta > 0 && cpuDelta > 0 ? (cpuDelta / systemDelta) * 100 : 0;

    const memStats = stats.memory_stats ?? ({} as any);
    const cache = memStats.stats?.inactive_file ?? memStats.stats?.total_inactive_file ?? memStats.stats?.cache ?? 0;
    const memUsage = Math.max((memStats.usage ?? 0) - cache, 0);

    const networks = Object.values(stats.networks ?? {}) as { rx_bytes?: number; tx_bytes?: number }[];
    const networkRx = networks.reduce((sum, net) => sum + (net.rx_bytes ?? 0), 0);
    const networkTx = networks.reduce((sum, net) => sum + (net.tx_bytes ?? 0), 0);

    const startedAt = info.State?.StartedAt ? new Date(info.State.StartedAt).getTime() : 0;
    const uptime = info.State?.Running && startedAt > 0 ? Math.floor((Date.now() - startedAt) / 1000) : 0;

    this.refreshDiskUsage(server);
    const diskGb = this.getDiskUsageGb(server.id);
    if (server.diskLimit > 0 && diskGb >= server.diskLimit * 0.9) {
      notify(
        "disk_almost_full",
        `${server.name} is almost out of disk space`,
        `${diskGb.toFixed(1)} of ${server.diskLimit} GB used. Delete old files or backups, or raise the disk limit.`,
        server.id,
        6 * 60 * 60_000,
      );
    }

    return {
      serverId: server.id,
      cpuUsage: Math.round(cpuPercentOfNode * 10) / 10,
      ramUsage: memUsage / GB,
      diskUsage: this.getDiskUsageGb(server.id),
      networkRx,
      networkTx,
      uptime,
      timestamp: Date.now(),
    };
  }

  async updateAllServerStats(): Promise<void> {
    const [servers, nodes] = await Promise.all([storage.getAllServers(), storage.getAllNodes()]);
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    /* Docker одной ноды опрашивается не больше чем по STATS_CONCURRENCY серверов одновременно: при сотнях серверов
       одновременные запросы stats перегружают сам Docker. Ноды опрашиваются параллельно друг другу. */
    const byNode = new Map<string, Server[]>();
    for (const server of servers) byNode.set(server.nodeId, [...(byNode.get(server.nodeId) ?? []), server]);
    await Promise.all(
      Array.from(byNode.values()).map((list) =>
        mapWithLimit(list, STATS_CONCURRENCY, async (original) => {
        const node = nodeMap.get(original.nodeId);
        if (!node || node.status === "offline") return;
        try {
          const { server, running } = await this.reconcileStatus(original, node);
          if (!running) {
            storage.deleteServerStats(server.id);
            return;
          }
          const stats = await this.collectServerStats(server, node);
          if (stats) {
            storage.setServerStats(server.id, stats);
            statsHistory.record(`server:${server.id}`, { cpu: stats.cpuUsage, ram: stats.ramUsage, disk: stats.diskUsage });
          }
        } catch (error) {
          console.debug(`Failed to collect stats for server ${original.id}:`, (error as Error).message);
        }
        }),
      ),
    );
  }

  private async nodeInfo(node: Node): Promise<{ cpus: number; memGb: number }> {
    const cached = this.nodeInfoCache.get(node.id);
    if (cached && Date.now() - cached.at < 5 * 60_000) return cached;
    const info = await dockerManager.getDockerClient(node).info();
    const result = { cpus: info.NCPU || node.cpuCores, memGb: Math.round((info.MemTotal || 0) / GB) || node.ramTotal, at: Date.now() };
    this.nodeInfoCache.set(node.id, result);
    return result;
  }

  /** Статистика ноды агрегируется из статистики её серверов; ядра и RAM берутся из docker info. */
  async updateAllNodeStats(): Promise<void> {
    const [nodes, servers] = await Promise.all([storage.getAllNodes(), storage.getAllServers()]);
    for (const node of nodes) {
      if (node.status === "offline") continue;
      try {
        const { cpus, memGb } = await this.nodeInfo(node);
        if (cpus !== node.cpuCores || memGb !== node.ramTotal) {
          await storage.updateNode(node.id, { cpuCores: cpus, ramTotal: memGb });
        }
        const onNode = servers.filter((s) => s.nodeId === node.id);
        let cpu = 0;
        let ram = 0;
        let disk = 0;
        let running = 0;
        for (const server of onNode) {
          disk += this.getDiskUsageGb(server.id);
          const stats = storage.getServerStats(server.id);
          if (stats) {
            cpu += stats.cpuUsage;
            ram += stats.ramUsage;
            running += 1;
          }
        }
        const stats: NodeStats = {
          nodeId: node.id,
          cpuUsage: Math.min(cpu, 100),
          ramUsage: ram,
          diskUsage: disk,
          serversCount: running,
          timestamp: Date.now(),
        };
        storage.setNodeStats(node.id, stats);
        statsHistory.record(`node:${node.id}`, { cpu: stats.cpuUsage, ram: stats.ramUsage, disk: stats.diskUsage });
      } catch (error) {
        console.debug(`Failed to collect stats for node ${node.id}:`, (error as Error).message);
      }
    }
  }
}

export const statsCollector = new StatsCollector();
