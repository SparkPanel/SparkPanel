import { spawn, ChildProcess } from "child_process";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { logSecurityEvent } from "./security-logger";

/**
 * Управляет VDS терминалом через child_process
 */
export class VdsTerminal {
  private terminalProcesses: Map<string, ChildProcess> = new Map(); // userId -> process
  private terminalSubscribers: Map<string, Set<WebSocket>> = new Map(); // userId -> WebSocket clients

  /**
   * Подключиться к VDS терминалу
   */
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

      // Проверяем права доступа (требуется kvm.access)
      if (!user.permissions.includes("kvm.access")) {
        ws.send(JSON.stringify({
          type: "vds_terminal_error",
          message: "Access denied. You don't have permission to use VDS terminal.",
        }));
        return;
      }

      // Добавляем клиента в список подписчиков
      if (!this.terminalSubscribers.has(userId)) {
        this.terminalSubscribers.set(userId, new Set());
      }
      this.terminalSubscribers.get(userId)!.add(ws);

      // Если терминал уже запущен для этого пользователя, просто отправляем подтверждение
      if (this.terminalProcesses.has(userId)) {
        ws.send(JSON.stringify({
          type: "vds_terminal_connected",
          message: "Terminal session connected",
        }));
        return;
      }

      // Создаем новый терминальный процесс
      // Используем bash в интерактивном режиме для сохранения контекста
      const shell = process.platform === "win32" ? "cmd.exe" : "/bin/bash";
      const shellArgs = process.platform === "win32" ? [] : ["-i"]; // -i для интерактивного режима
      const terminalProcess = spawn(shell, shellArgs, {
        stdio: ["pipe", "pipe", "pipe"],
        env: process.env,
        cwd: process.cwd(),
        shell: false,
      });

      // Обрабатываем вывод команды
      terminalProcess.stdout.on("data", (data: Buffer) => {
        const output = data.toString();
        this.broadcastOutput(userId, output);
      });

      terminalProcess.stderr.on("data", (data: Buffer) => {
        const output = data.toString();
        this.broadcastOutput(userId, output);
      });

      // Обрабатываем завершение процесса
      terminalProcess.on("exit", (code) => {
        this.broadcastOutput(userId, `\n[Process exited with code ${code}]\n`);
        this.terminalProcesses.delete(userId);
        this.broadcastOutput(userId, "[Terminal session ended]\n");
      });

      // Обрабатываем ошибки
      terminalProcess.on("error", (error) => {
        console.error(`Terminal process error for user ${userId}:`, error);
        this.broadcastError(userId, `Terminal error: ${error.message}`);
        this.terminalProcesses.delete(userId);
      });

      this.terminalProcesses.set(userId, terminalProcess);

      // Отправляем подтверждение подключения
      ws.send(JSON.stringify({
        type: "vds_terminal_connected",
        message: "Terminal session started",
      }));

      // Логируем использование VDS терминала
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

  /**
   * Выполнить команду в VDS терминале
   */
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

      // Проверяем права доступа (требуется kvm.access)
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

      // Проверяем, что процесс еще жив
      if (terminalProcess.killed || terminalProcess.exitCode !== null) {
        ws.send(JSON.stringify({
          type: "vds_terminal_error",
          message: "Terminal process has ended. Please reconnect.",
        }));
        this.terminalProcesses.delete(userId);
        return;
      }

      // Логируем выполнение команды
      await storage.addActivity({
        type: "server_command",
        title: "VDS Terminal Command",
        description: `Command executed: ${command.substring(0, 100)}`,
        timestamp: new Date(),
        userId: user.id,
      }).catch(() => {});

      // Отправляем команду в stdin терминала
      terminalProcess.stdin?.write(command + "\n");

    } catch (error: any) {
      console.error(`Failed to execute command for user ${userId}:`, error);
      ws.send(JSON.stringify({
        type: "vds_terminal_error",
        message: error.message || "Failed to execute command",
      }));
    }
  }

  /**
   * Отключиться от VDS терминала
   */
  disconnect(userId: string, ws: WebSocket): void {
    // Удаляем клиента из подписчиков
    const subscribers = this.terminalSubscribers.get(userId);
    if (subscribers) {
      subscribers.delete(ws);
      
      // Если больше нет подписчиков, закрываем терминал
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

  /**
   * Отправить вывод всем подписанным клиентам
   */
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

  /**
   * Отправить ошибку всем подписанным клиентам
   */
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

