import { spawn, ChildProcess } from "child_process";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { logSecurityEvent } from "./security-logger";


import iconv from "iconv-lite";


export class VdsTerminal {
  private terminalProcesses: Map<string, ChildProcess> = new Map(); 
  private terminalSubscribers: Map<string, Set<WebSocket>> = new Map();

  
  async connect(userId: string, ws: WebSocket): Promise<void> {
    try {
      const user = await storage.getUser(userId);
      if (!user) {
        ws.send(JSON.stringify({
          type: "vds_terminal_error",
          message: "User not found",
        }));
        return;
      }

      
      if (!user.permissions.includes("kvm.access")) {
        ws.send(JSON.stringify({
          type: "vds_terminal_error",
          message: "Access denied. You don't have permission to use VDS terminal.",
        }));
        return;
      }

      
      if (!this.terminalSubscribers.has(userId)) {
        this.terminalSubscribers.set(userId, new Set());
      }
      this.terminalSubscribers.get(userId)!.add(ws);

      
      if (this.terminalProcesses.has(userId)) {
        ws.send(JSON.stringify({
          type: "vds_terminal_connected",
          message: "Terminal session connected",
        }));
        return;
      }

      
      const shell = process.platform === "win32" ? "cmd.exe" : "/bin/bash";
      const shellArgs = process.platform === "win32" ? ["/K", "chcp 65001 >nul"] : ["-i"]; // Устанавливаем UTF-8 для Windows
      const terminalProcess = spawn(shell, shellArgs, {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...(process.platform === "win32" ? { CHCP: "65001" } : {}) },
        cwd: process.cwd(),
        shell: false,
      });

      
      terminalProcess.stdout.on("data", (data: Buffer) => {
        let output: string;
        if (process.platform === "win32") {
          
          try {
            output = (iconv as any).decode(data, "cp866");
          } catch (e) {
            
            try {
              output = data.toString("utf8");
            } catch (e2) {
              
              output = data.toString("latin1");
            }
          }
        } else {
          output = data.toString("utf8");
        }
        this.broadcastOutput(userId, output);
      });

      terminalProcess.stderr.on("data", (data: Buffer) => {
        let output: string;
        if (process.platform === "win32") {
          
          try {
            output = (iconv as any).decode(data, "cp866");
          } catch (e) {
            try {
              output = data.toString("utf8");
            } catch (e2) {
              output = data.toString("latin1");
            }
          }
        } else {
          output = data.toString("utf8");
        }
        this.broadcastOutput(userId, output);
      });

      
      terminalProcess.on("exit", (code) => {
        this.broadcastOutput(userId, `\n[Process exited with code ${code}]\n`);
        this.terminalProcesses.delete(userId);
        this.broadcastOutput(userId, "[Terminal session ended]\n");
      });

      
      terminalProcess.on("error", (error) => {
        console.error(`Terminal process error for user ${userId}:`, error);
        this.broadcastError(userId, `Terminal error: ${error.message}`);
        this.terminalProcesses.delete(userId);
      });

      this.terminalProcesses.set(userId, terminalProcess);

      
      ws.send(JSON.stringify({
        type: "vds_terminal_connected",
        message: "Terminal session started",
      }));

      
      await storage.addActivity({
        type: "security_event",
        title: "VDS Terminal Access",
        description: `User ${user.username} connected to VDS terminal`,
        timestamp: new Date(),
        userId: user.id,
      }).catch(() => {});

    } catch (error: any) {
      console.error(`Failed to connect VDS terminal for user ${userId}:`, error);
      ws.send(JSON.stringify({
        type: "vds_terminal_error",
        message: error.message || "Failed to connect to terminal",
      }));
    }
  }

  
  async executeCommand(userId: string, command: string, ws: WebSocket): Promise<void> {
    try {
      const user = await storage.getUser(userId);
      if (!user) {
        ws.send(JSON.stringify({
          type: "vds_terminal_error",
          message: "User not found",
        }));
        return;
      }

      
      if (!user.permissions.includes("kvm.access")) {
        ws.send(JSON.stringify({
          type: "vds_terminal_error",
          message: "Access denied. You don't have permission to execute commands.",
        }));
        return;
      }

      const terminalProcess = this.terminalProcesses.get(userId);
      if (!terminalProcess) {
        ws.send(JSON.stringify({
          type: "vds_terminal_error",
          message: "Terminal session not active. Please connect first.",
        }));
        return;
      }

      
      if (terminalProcess.killed || terminalProcess.exitCode !== null) {
        ws.send(JSON.stringify({
          type: "vds_terminal_error",
          message: "Terminal process has ended. Please reconnect.",
        }));
        this.terminalProcesses.delete(userId);
        return;
      }

      
      await storage.addActivity({
        type: "server_command",
        title: "VDS Terminal Command",
        description: `Command executed: ${command.substring(0, 100)}`,
        timestamp: new Date(),
        userId: user.id,
      }).catch(() => {});

      
      if (process.platform === "win32") {
        try {
          
          const encoded = (iconv as any).encode(command + "\n", "cp866");
          terminalProcess.stdin?.write(encoded);
        } catch (e) {
          
          terminalProcess.stdin?.write(command + "\n", "utf8");
        }
      } else {
        terminalProcess.stdin?.write(command + "\n", "utf8");
      }

    } catch (error: any) {
      console.error(`Failed to execute command for user ${userId}:`, error);
      ws.send(JSON.stringify({
        type: "vds_terminal_error",
        message: error.message || "Failed to execute command",
      }));
    }
  }

  
  disconnect(userId: string, ws: WebSocket): void {
    
    const subscribers = this.terminalSubscribers.get(userId);
    if (subscribers) {
      subscribers.delete(ws);
      
      
      if (subscribers.size === 0) {
        const terminalProcess = this.terminalProcesses.get(userId);
        if (terminalProcess) {
          terminalProcess.kill();
          this.terminalProcesses.delete(userId);
        }
        this.terminalSubscribers.delete(userId);
      }
    }
  }

  
  private broadcastOutput(userId: string, output: string): void {
    const subscribers = this.terminalSubscribers.get(userId);
    if (!subscribers) return;

    subscribers.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "vds_terminal_output",
          output: output,
        }));
      }
    });
  }

  
  private broadcastError(userId: string, message: string): void {
    const subscribers = this.terminalSubscribers.get(userId);
    if (!subscribers) return;

    subscribers.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "vds_terminal_error",
          message: message,
        }));
      }
    });
  }
}

export const vdsTerminal = new VdsTerminal();

