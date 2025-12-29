import { WebSocketServer, WebSocket } from "ws";
import { dockerManager } from "./docker-manager";
import { storage } from "./storage";
import type { ConsoleLog } from "@shared/schema";
import type { Readable, Duplex } from "stream";

/**
 * Управляет потоковой передачей логов из Docker контейнеров через WebSocket
 */
export class LogStreamer {
  private logStreams: Map<string, Readable> = new Map();
  private commandStreams: Map<string, Duplex> = new Map(); // Потоки для отправки команд
  private subscribers: Map<string, Set<WebSocket>> = new Map(); // Отслеживаем подписчиков для каждого сервера

  /**
   * Начать стриминг логов для сервера
   */
  async startStreaming(serverId: string, ws: WebSocket, userId?: string): Promise<void> {
    try {
      // Проверяем существование сервера и права доступа
      const server = await storage.getServer(serverId);
      if (!server || !server.containerId) {
        // Логируем попытку доступа к несуществующему серверу
        if (userId) {
          await storage.addActivity({
            type: "security_event",
            title: "Unauthorized Access Attempt",
            description: `User attempted to access non-existent server: ${serverId}`,
            timestamp: new Date(),
            userId,
          }).catch(() => {});
        }
        return;
      }

      // Проверяем права доступа через storage (только если userId предоставлен)
      if (userId) {
        const user = await storage.getUser(userId);
        if (!user) {
          return;
        }
        
        // Проверяем право просмотра серверов
        if (!user.permissions.includes("servers.view")) {
          return;
        }
        
        // Если allowedServerIds не null, проверяем доступ к конкретному серверу
        if (user.allowedServerIds !== null) {
          if (!user.allowedServerIds || !user.allowedServerIds.includes(serverId)) {
            return;
          }
        }
        // Если allowedServerIds === null, пользователь имеет доступ ко всем серверам
      }

      // Добавляем клиента в список подписчиков
      if (!this.subscribers.has(serverId)) {
        this.subscribers.set(serverId, new Set());
      }
      this.subscribers.get(serverId)!.add(ws);

      // Если уже стримим для этого сервера, просто добавляем подписчика
      if (this.logStreams.has(serverId)) {
        return;
      }

      // Проверяем статус сервера перед началом стриминга
      if (server.status !== "running") {
        return;
      }

      const node = await storage.getNode(server.nodeId);
      if (!node) {
        return;
      }

      const container = await dockerManager.getContainer(node, server.containerId);
      
      // Получаем логи через attach API для реального стриминга
      const logStream = await container.attach({
        stream: true,
        stdout: true,
        stderr: true,
        logs: false, // Получаем только новые логи
      }) as unknown as Readable;

      // Обрабатываем поток данных
      const dataHandler = (chunk: Buffer) => {
        const message = chunk.toString();
        const lines = message.split("\n").filter(line => line.trim());

        lines.forEach(line => {
          if (line.trim()) {
            const logEntry: ConsoleLog = {
              timestamp: Date.now(),
              message: line.trim(),
              type: this.detectLogType(line),
            };

            // Отправляем лог всем подписанным клиентам
            this.broadcastLog(serverId, logEntry);
          }
        });
      };

      const errorHandler = (error: Error) => {
        console.error(`Log stream error for server ${serverId}:`, error);
        // Очищаем обработчики для предотвращения утечек памяти
        logStream.removeAllListeners();
        this.stopStreaming(serverId);
      };

      const endHandler = () => {
        console.log(`Log stream ended for server ${serverId}`);
        // Очищаем обработчики для предотвращения утечек памяти
        logStream.removeAllListeners();
        this.logStreams.delete(serverId);
        // Очищаем подписчиков
        this.subscribers.delete(serverId);
      };

      logStream.on("data", dataHandler);
      logStream.on("error", errorHandler);
      logStream.on("end", endHandler);

      this.logStreams.set(serverId, logStream);
    } catch (error) {
      console.error(`Failed to start log streaming for server ${serverId}:`, error);
    }
  }

  /**
   * Остановить стриминг логов для сервера
   */
  stopStreaming(serverId: string, ws?: WebSocket): void {
    // Удаляем клиента из списка подписчиков
    if (ws) {
      const subscribers = this.subscribers.get(serverId);
      if (subscribers) {
        subscribers.delete(ws);
        // Если больше нет подписчиков, останавливаем стриминг
        if (subscribers.size === 0) {
          const stream = this.logStreams.get(serverId);
          if (stream) {
            stream.destroy();
            this.logStreams.delete(serverId);
          }
          this.subscribers.delete(serverId);
        }
      }
    } else {
      // Если клиент не указан, останавливаем для всех
      const stream = this.logStreams.get(serverId);
      if (stream) {
        stream.destroy();
        this.logStreams.delete(serverId);
      }
      this.subscribers.delete(serverId);
    }
  }

  /**
   * Отправить команду в контейнер сервера
   * Использует attach API для отправки команд в реальную консоль контейнера
   */
  async sendCommand(serverId: string, command: string, userId?: string): Promise<void> {
    try {
      const server = await storage.getServer(serverId);
      if (!server || !server.containerId) {
        throw new Error("Server not found");
      }

      // Проверяем права доступа через storage (только если userId предоставлен)
      if (!userId) {
        throw new Error("User ID is required");
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        throw new Error("User not found");
      }
      
      // Проверяем право управления серверами (для отправки команд)
      if (!user.permissions.includes("servers.console")) {
        throw new Error("Access denied - no console permission");
      }
      
      // Проверяем доступ к конкретному серверу
      if (user.allowedServerIds !== null) {
        if (!user.allowedServerIds || !user.allowedServerIds.includes(serverId)) {
          throw new Error("Access denied - server not in allowed list");
        }
      }
      // Если allowedServerIds === null, пользователь имеет доступ ко всем серверам

      if (server.status !== "running") {
        throw new Error("Server is not running");
      }

      const node = await storage.getNode(server.nodeId);
      if (!node) {
        throw new Error("Node not found");
      }

      const container = await dockerManager.getContainer(node, server.containerId);
      
      // Используем attach API с stdin для отправки команд в реальную консоль
      // Если поток для команд уже существует, используем его
      let commandStream = this.commandStreams.get(serverId);
      
      if (!commandStream) {
        // Создаем новый attach поток для отправки команд
        const newCommandStream = await container.attach({
          stream: true,
          stdin: true,
          stdout: true,
          stderr: true,
        }) as unknown as Duplex;
        
        this.commandStreams.set(serverId, newCommandStream);
        
        // Обрабатываем ответы от контейнера
        const commandDataHandler = (chunk: Buffer) => {
          const message = chunk.toString();
          const lines = message.split("\n").filter(line => line.trim());
          
          lines.forEach(line => {
            if (line.trim()) {
              const logEntry: ConsoleLog = {
                timestamp: Date.now(),
                message: line.trim(),
                type: this.detectLogType(line),
              };
              
              // Отправляем ответ всем подписанным клиентам
              this.broadcastLog(serverId, logEntry);
            }
          });
        };
        
        const cleanupStream = () => {
          newCommandStream.removeAllListeners();
          this.commandStreams.delete(serverId);
        };

        newCommandStream.on("data", commandDataHandler);
        newCommandStream.on("error", (error: Error) => {
          console.error(`Command stream error for server ${serverId}:`, error);
          cleanupStream();
        });
        newCommandStream.on("end", () => {
          console.log(`Command stream ended for server ${serverId}`);
          cleanupStream();
        });

        commandStream = newCommandStream;
      }

      if (!commandStream) {
        throw new Error("Command stream could not be initialized");
      }
      
      // Отправляем команду в stdin контейнера
      if (commandStream && commandStream.writable) {
        commandStream.write(command + "\n");
      } else {
        throw new Error("Command stream is not writable");
      }
    } catch (error) {
      console.error(`Failed to send command to server ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * Отправить лог всем подписанным клиентам
   */
  private broadcastLog(serverId: string, log: ConsoleLog): void {
    this.broadcastLogToClients(serverId, log);
  }

  /**
   * Определить тип лога по содержимому
   */
  private detectLogType(message: string): "info" | "error" | "warn" | "system" {
    const lower = message.toLowerCase();
    if (lower.includes("error") || lower.includes("exception") || lower.includes("fatal")) {
      return "error";
    }
    if (lower.includes("warn") || lower.includes("warning")) {
      return "warn";
    }
    if (lower.includes("[system]") || lower.includes("[server]")) {
      return "system";
    }
    return "info";
  }

  /**
   * Установить WebSocket server для трансляции логов
   */
  setWebSocketServer(wss: WebSocketServer): void {
    this.wss = wss;
  }

  private wss?: WebSocketServer;

  /**
   * Отправить лог всем клиентам, подписанным на сервер
   */
  broadcastLogToClients(serverId: string, log: ConsoleLog): void {
    if (!this.wss) return;

    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        const subscribedServers = (client as any).subscribedServers as Set<string>;
        if (subscribedServers && subscribedServers.has(serverId)) {
          client.send(
            JSON.stringify({
              type: "log",
              serverId,
              log,
            })
          );
        }
      }
    });
  }
}

export const logStreamer = new LogStreamer();

