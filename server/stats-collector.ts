import { dockerManager } from "./docker-manager";
import { storage } from "./storage";
import type { Server, Node, ServerStats, NodeStats } from "@shared/schema";

/**
 * Собирает реальную статистику из Docker контейнеров
 */
export class StatsCollector {
  /**
   * Собрать статистику для сервера из Docker контейнера
   */
  async collectServerStats(server: Server, node: Node): Promise<ServerStats | null> {
    if (!server.containerId || server.status !== "running") {
      return null;
    }

    try {
      const container = await dockerManager.getContainer(node, server.containerId);
      const stats = await container.stats({ stream: false });
      
      // Docker stats API возвращает данные в специальном формате
      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
      const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
      const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * 100 : 0;

      const memUsage = stats.memory_stats.usage || 0;
      const memLimit = stats.memory_stats.limit || (server.ramLimit * 1024 * 1024 * 1024);
      const memUsageGB = memUsage / (1024 * 1024 * 1024); // Convert to GB

      const networkRx = stats.networks ? 
        Object.values(stats.networks).reduce((sum: number, net: any) => sum + (net.rx_bytes || 0), 0) : 0;
      const networkTx = stats.networks ? 
        Object.values(stats.networks).reduce((sum: number, net: any) => sum + (net.tx_bytes || 0), 0) : 0;

      // Uptime в секундах (время работы контейнера)
      let uptime = 0;
      try {
        const containerInfo = await container.inspect();
        if (containerInfo.State && containerInfo.State.StartedAt && containerInfo.State.Status === "running") {
          const startTime = new Date(containerInfo.State.StartedAt).getTime();
          uptime = Math.floor((Date.now() - startTime) / 1000);
        }
      } catch (error) {
        console.debug(`Could not calculate uptime for server ${server.id}:`, error);
      }

      // Вычисляем CPU usage с учетом лимита сервера
      const cpuUsagePercent = Math.min((cpuPercent / 100) * server.cpuLimit, server.cpuLimit);
      
      // Получаем disk usage через exec в контейнере
      let diskUsageGB = 0;
      try {
        const exec = await container.exec({
          Cmd: ["/bin/sh", "-c", "df -BG /data 2>/dev/null | tail -1 | awk '{print $3}' | sed 's/G//'"],
          AttachStdout: true,
          AttachStderr: true,
        });
        const stream = await exec.start({ hijack: true, stdin: false });
        
        let diskOutput = "";
        stream.on("data", (chunk: Buffer) => {
          diskOutput += chunk.toString();
        });
        
        await new Promise<void>((resolve) => {
          stream.on("end", resolve);
          stream.on("error", () => resolve()); // Игнорируем ошибки
        });
        
        const parsedDisk = parseFloat(diskOutput.trim());
        if (!isNaN(parsedDisk)) {
          diskUsageGB = parsedDisk;
        }
      } catch (error) {
        // Если не удалось получить disk usage, используем 0
        console.debug(`Could not get disk usage for server ${server.id}:`, error);
      }
      
      const serverStats: ServerStats = {
        serverId: server.id,
        cpuUsage: cpuUsagePercent,
        ramUsage: Math.min(memUsageGB, server.ramLimit), // Ограничиваем лимитом
        diskUsage: Math.min(diskUsageGB, server.diskLimit), // Ограничиваем лимитом
        networkRx: networkRx,
        networkTx: networkTx,
        uptime: Math.max(uptime, 0),
        timestamp: Date.now(),
      };

      return serverStats;
    } catch (error) {
      console.error(`Failed to collect stats for server ${server.id}:`, error);
      return null;
    }
  }

  /**
   * Собрать статистику для ноды
   */
  async collectNodeStats(node: Node): Promise<NodeStats | null> {
    try {
      const docker = dockerManager.getDockerClient(node);
      
      // Получаем список контейнеров на ноде
      const containers = await docker.listContainers({ all: true });
      const runningContainers = containers.filter(c => c.State === "running");

      // Подсчитываем реальное использование ресурсов по всем серверам на ноде
      const servers = await storage.getAllServers();
      const serversOnNode = servers.filter(s => s.nodeId === node.id && s.status === "running");
      
      let totalCpuUsage = 0;
      let totalRamUsage = 0;
      
      // Суммируем использование ресурсов всех работающих серверов
      for (const server of serversOnNode) {
        if (server.containerId) {
          const serverStats = await this.collectServerStats(server, node);
          if (serverStats) {
            totalCpuUsage += serverStats.cpuUsage;
            totalRamUsage += serverStats.ramUsage;
          }
        }
      }

      // Пытаемся получить disk usage для ноды через Docker API (суммируем размеры всех контейнеров)
      let diskUsageGB = 0;
      try {
        const docker = dockerManager.getDockerClient(node);
        // Получаем информацию о всех контейнерах на ноде
        for (const containerInfo of containers) {
          try {
            const container = docker.getContainer(containerInfo.Id);
            const inspect = await container.inspect() as {
              SizeRootFs?: number;
              SizeRw?: number;
            };

            const sizeRootFs = inspect.SizeRootFs ?? 0;
            const sizeRw = inspect.SizeRw ?? 0;
            if (sizeRootFs || sizeRw) {
              const containerSize = (sizeRootFs + sizeRw) / (1024 * 1024 * 1024); // Convert to GB
              diskUsageGB += containerSize;
            }
          } catch (error) {
            // Игнорируем ошибки отдельных контейнеров
            console.debug(`Could not get size for container ${containerInfo.Id}:`, error);
          }
        }
      } catch (error) {
        // Если не удалось получить disk usage через Docker API, используем 0
        // Для получения реального disk usage хоста требуется SSH или агент на ноде
        console.debug(`Could not get disk usage for node ${node.id}:`, error);
      }

      const stats: NodeStats = {
        nodeId: node.id,
        cpuUsage: Math.min(totalCpuUsage, 100), // CPU как процент от всех ядер
        ramUsage: Math.min(totalRamUsage, node.ramTotal), // RAM в GB
        diskUsage: Math.min(diskUsageGB, node.diskTotal), // Disk usage из Docker API (размер контейнеров)
        serversCount: runningContainers.length, // Реальное количество работающих контейнеров
        timestamp: Date.now(),
      };

      return stats;
    } catch (error) {
      console.error(`Failed to collect stats for node ${node.id}:`, error);
      return null;
    }
  }

  /**
   * Обновить статистику для всех серверов
   */
  async updateAllServerStats(): Promise<void> {
    const servers = await storage.getAllServers();
    
    for (const server of servers) {
      if (server.status === "running" && server.containerId) {
        const node = await storage.getNode(server.nodeId);
        if (node) {
          const stats = await this.collectServerStats(server, node);
          if (stats) {
            storage.setServerStats(server.id, stats);
          }
        }
      }
    }
  }

  /**
   * Обновить статистику для всех нод
   */
  async updateAllNodeStats(): Promise<void> {
    const nodes = await storage.getAllNodes();
    
    for (const node of nodes) {
      const stats = await this.collectNodeStats(node);
      if (stats) {
        // Обновляем количество серверов реальным значением
        const servers = await storage.getAllServers();
        stats.serversCount = servers.filter(s => s.nodeId === node.id).length;
        storage.setNodeStats(node.id, stats);
      }
    }
  }
}

export const statsCollector = new StatsCollector();

