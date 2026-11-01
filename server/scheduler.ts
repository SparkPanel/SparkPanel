import { randomBytes } from "crypto";
import { settingsStore } from "./data-dir";
import { storage } from "./storage";
import { createServerBackup } from "./backup-manager";
import { restartGameServer, startGameServer, stopGameServer } from "./game-server";
import { logStreamer } from "./log-streamer";

export type ScheduledTaskType = "server_backup" | "server_restart" | "server_start" | "server_stop" | "server_command";

export interface ScheduledTask {
  id: string;
  name: string;
  type: ScheduledTaskType;
  serverId: string;
  cron: string;
  command?: string;
  enabled: boolean;
  createdAt: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
}

const invalidCron = () => Object.assign(new Error("Invalid cron expression"), { status: 400 });

export const TASK_TYPES: ScheduledTaskType[] = ["server_backup", "server_restart", "server_start", "server_stop", "server_command"];

const FIELD_RANGES: [number, number][] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
];

/** Разбирает поле cron: *, числа, списки, диапазоны a-b и шаги (*\/n, a-b/n). */
function parseField(expr: string, [min, max]: [number, number]): Set<number> | null {
  const values = new Set<number>();
  for (const part of expr.split(",")) {
    const [rangeExpr, stepExpr] = part.split("/");
    const step = stepExpr === undefined ? 1 : Number(stepExpr);
    if (!Number.isInteger(step) || step < 1) return null;
    let from: number;
    let to: number;
    if (rangeExpr === "*") {
      from = min;
      to = max;
    } else if (rangeExpr.includes("-")) {
      [from, to] = rangeExpr.split("-").map(Number);
    } else {
      from = Number(rangeExpr);
      to = stepExpr === undefined ? from : max;
    }
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < min || to > max || from > to) return null;
    for (let v = from; v <= to; v += step) values.add(v);
  }
  return values;
}

interface ParsedCron {
  minutes: Set<number>;
  hours: Set<number>;
  days: Set<number>;
  months: Set<number>;
  weekdays: Set<number>;
  dayRestricted: boolean;
  weekdayRestricted: boolean;
}

export function parseCron(cron: string): ParsedCron | null {
  const parts = String(cron).trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const fields = parts.map((p, i) => parseField(p, FIELD_RANGES[i]));
  if (fields.some((f) => !f)) return null;
  const weekdays = fields[4]!;
  if (weekdays.has(7)) weekdays.add(0);
  return {
    minutes: fields[0]!,
    hours: fields[1]!,
    days: fields[2]!,
    months: fields[3]!,
    weekdays,
    dayRestricted: parts[2] !== "*",
    weekdayRestricted: parts[4] !== "*",
  };
}

function matches(cron: ParsedCron, date: Date): boolean {
  if (!cron.minutes.has(date.getMinutes()) || !cron.hours.has(date.getHours()) || !cron.months.has(date.getMonth() + 1)) return false;
  const dayOk = cron.days.has(date.getDate());
  const weekdayOk = cron.weekdays.has(date.getDay());
  if (cron.dayRestricted && cron.weekdayRestricted) return dayOk || weekdayOk;
  return dayOk && weekdayOk;
}

export function computeNextRun(cron: string, from: Date = new Date()): Date | null {
  const parsed = parseCron(cron);
  if (!parsed) return null;
  const cursor = new Date(from.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);
  const limit = 366 * 24 * 60;
  for (let i = 0; i < limit; i += 1) {
    if (matches(parsed, cursor)) return cursor;
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return null;
}

class Scheduler {
  private tasks = new Map<string, ScheduledTask>();
  private timer: NodeJS.Timeout | null = null;
  private running = new Set<string>();

  constructor() {
    for (const task of settingsStore.get<ScheduledTask[]>("scheduledTasks", [])) {
      this.tasks.set(task.id, task);
    }
  }

  private save(): Promise<void> {
    return settingsStore.set("scheduledTasks", Array.from(this.tasks.values()));
  }

  list(): ScheduledTask[] {
    return Array.from(this.tasks.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  get(id: string): ScheduledTask | undefined {
    return this.tasks.get(id);
  }

  async create(input: Pick<ScheduledTask, "name" | "type" | "serverId" | "cron" | "command" | "enabled">): Promise<ScheduledTask> {
    const next = computeNextRun(input.cron);
    if (!next) throw invalidCron();
    const task: ScheduledTask = {
      ...input,
      id: randomBytes(12).toString("hex"),
      createdAt: new Date().toISOString(),
      nextRunAt: next.toISOString(),
      lastRunAt: null,
      lastError: null,
    };
    this.tasks.set(task.id, task);
    await this.save();
    return task;
  }

  async update(id: string, updates: Partial<Pick<ScheduledTask, "name" | "cron" | "enabled" | "command">>): Promise<ScheduledTask | undefined> {
    const task = this.tasks.get(id);
    if (!task) return undefined;
    if (updates.cron !== undefined && !computeNextRun(updates.cron)) throw invalidCron();
    Object.assign(task, updates);
    task.nextRunAt = computeNextRun(task.cron)?.toISOString() ?? null;
    await this.save();
    return task;
  }

  async remove(id: string): Promise<boolean> {
    const removed = this.tasks.delete(id);
    if (removed) await this.save();
    return removed;
  }

  async removeForServer(serverId: string): Promise<void> {
    let changed = false;
    for (const [id, task] of this.tasks) {
      if (task.serverId === serverId) {
        this.tasks.delete(id);
        changed = true;
      }
    }
    if (changed) await this.save();
  }

  async run(task: ScheduledTask): Promise<void> {
    if (this.running.has(task.id)) throw new Error("Task is already running");
    this.running.add(task.id);
    try {
      const server = await storage.getServer(task.serverId);
      if (!server) throw new Error("Server not found");
      let description = "";
      switch (task.type) {
        case "server_backup": {
          const backup = await createServerBackup(server, {
            name: `Scheduled ${new Date().toISOString().replace("T", " ").slice(0, 19)}`,
            description: `Created by scheduled task '${task.name}'`,
          });
          description = `Backup '${backup.name}' created for '${server.name}'`;
          break;
        }
        case "server_restart":
          await restartGameServer(server);
          await logStreamer.notifyStatus((await storage.getServer(server.id))!, "Server restarted by scheduler");
          description = `Server '${server.name}' restarted`;
          break;
        case "server_start":
          await startGameServer(server);
          await logStreamer.notifyStatus((await storage.getServer(server.id))!, "Server started by scheduler");
          description = `Server '${server.name}' started`;
          break;
        case "server_stop":
          await stopGameServer(server);
          await logStreamer.notifyStatus((await storage.getServer(server.id))!, "Server stopped by scheduler");
          description = `Server '${server.name}' stopped`;
          break;
        case "server_command":
          if (!task.command) throw new Error("Command is not set");
          await logStreamer.sendCommand(server, task.command);
          description = `Command sent to '${server.name}'`;
          break;
      }
      task.lastError = null;
      await storage
        .addActivity({ type: "settings_update", title: `Scheduled task: ${task.name}`, description, timestamp: new Date() })
        .catch(() => {});
    } catch (error: any) {
      task.lastError = error?.message || "Task failed";
      throw error;
    } finally {
      task.lastRunAt = new Date().toISOString();
      task.nextRunAt = computeNextRun(task.cron)?.toISOString() ?? null;
      this.running.delete(task.id);
      await this.save();
    }
  }

  /** Проверяет задачи раз в 15 секунд и запускает те, у которых подошло время. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const now = Date.now();
      for (const task of this.tasks.values()) {
        if (!task.enabled || !task.nextRunAt || new Date(task.nextRunAt).getTime() > now) continue;
        this.run(task).catch((error) => console.error(`Scheduled task '${task.name}' failed:`, error.message));
      }
    }, 15_000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export const scheduler = new Scheduler();
