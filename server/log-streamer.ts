import { WebSocketServer, WebSocket } from "ws";
import { dockerManager } from "./docker-manager";
import { storage } from "./storage";
import type { ConsoleLog } from "@shared/schema";
import type { Readable, Duplex } from "stream";


export class LogStreamer {
  private logStreams: Map<string, Readable> = new Map();
  private commandStreams: Map<string, Duplex> = new Map(); 
  private subscribers: Map<string, Set<WebSocket>> = new Map(); 

  
  async startStreaming(serverId: string, ws: WebSocket, userId?: string): Promise<void> {
    try {
      
      const server = await storage.getServer(serverId);
      if (!server || !server.containerId) {
        
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

      
      if (userId) {
        const user = await storage.getUser(userId);
        if (!user) {
          return;
        }
        
        
        if (!user.permissions.includes("servers.view")) {
          return;
        }
        
        
        if (user.allowedServerIds !== null) {
          if (!user.allowedServerIds || !user.allowedServerIds.includes(serverId)) {
            return;
          }
        }
        
      }

      
      if (!this.subscribers.has(serverId)) {
        this.subscribers.set(serverId, new Set());
      }
      this.subscribers.get(serverId)!.add(ws);

      
      if (this.logStreams.has(serverId)) {
        return;
      }

      
      if (server.status !== "running") {
        return;
      }

      const node = await storage.getNode(server.nodeId);
      if (!node) {
        return;
      }

      const container = await dockerManager.getContainer(node, server.containerId);
      
      
      const logStream = await container.attach({
        stream: true,
        stdout: true,
        stderr: true,
        logs: false, 
      }) as unknown as Readable;

      
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

            
            this.broadcastLog(serverId, logEntry);
          }
        });
      };

      const errorHandler = (error: Error) => {
        console.error(`Log stream error for server ${serverId}:`, error);
        
        logStream.removeAllListeners();
        this.stopStreaming(serverId);
      };

      const endHandler = () => {
        console.log(`Log stream ended for server ${serverId}`);
        // Clean up the log stream, but keep the subscriber set so that
        // reconnecting clients (or stats code that starts a new stream)
        // can rejoin without losing their registration.
        logStream.removeAllListeners();
        this.logStreams.delete(serverId);
      };

      logStream.on("data", dataHandler);
      logStream.on("error", errorHandler);
      logStream.on("end", endHandler);

      this.logStreams.set(serverId, logStream);
    } catch (error) {
      console.error(`Failed to start log streaming for server ${serverId}:`, error);
    }
  }

  
  stopStreaming(serverId: string, ws?: WebSocket): void {
    
    if (ws) {
      const subscribers = this.subscribers.get(serverId);
      if (subscribers) {
        subscribers.delete(ws);
        
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
      
      const stream = this.logStreams.get(serverId);
      if (stream) {
        stream.destroy();
        this.logStreams.delete(serverId);
      }
      this.subscribers.delete(serverId);
    }
  }

  
  async sendCommand(serverId: string, command: string, userId?: string): Promise<void> {
    try {
      const server = await storage.getServer(serverId);
      if (!server || !server.containerId) {
        throw new Error("Server not found");
      }

      
      if (!userId) {
        throw new Error("User ID is required");
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        throw new Error("User not found");
      }
      
      
      if (!user.permissions.includes("servers.console")) {
        throw new Error("Access denied - no console permission");
      }
      
      
      if (user.allowedServerIds !== null) {
        if (!user.allowedServerIds || !user.allowedServerIds.includes(serverId)) {
          throw new Error("Access denied - server not in allowed list");
        }
      }
      

      if (server.status !== "running") {
        throw new Error("Server is not running");
      }

      const node = await storage.getNode(server.nodeId);
      if (!node) {
        throw new Error("Node not found");
      }

      const container = await dockerManager.getContainer(node, server.containerId);
      
      
      let commandStream = this.commandStreams.get(serverId);
      
      if (!commandStream) {
        
        const newCommandStream = await container.attach({
          stream: true,
          stdin: true,
          stdout: true,
          stderr: true,
        }) as unknown as Duplex;
        
        this.commandStreams.set(serverId, newCommandStream);
        
        
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

  
  private broadcastLog(serverId: string, log: ConsoleLog): void {
    this.broadcastLogToClients(serverId, log);
  }

  
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

  
  setWebSocketServer(wss: WebSocketServer): void {
    this.wss = wss;
  }

  private wss?: WebSocketServer;

  
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

