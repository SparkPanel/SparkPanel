import { dataPath, readJsonSync, writeJsonAtomic } from "./data-dir";

/** Точка истории: время начала интервала и средние значения за него. */
export interface HistoryPoint {
  t: number;
  cpu: number;
  ram: number;
  disk: number;
}

interface Bucket extends HistoryPoint {
  n: number;
}

/** Сутки с шагом 5 минут и неделя с шагом 30 минут — достаточно для графиков и не раздувает файл. */
const RANGES = {
  day: { step: 5 * 60_000, keep: 24 * 60 * 60_000 },
  week: { step: 30 * 60_000, keep: 7 * 24 * 60 * 60_000 },
} as const;

export type HistoryRange = keyof typeof RANGES;

const FILE = dataPath("stats-history.json");
const SAVE_EVERY_MS = 5 * 60_000;

/**
 * История нагрузки серверов и нод. Сбор статистики каждые 5 секунд добавляет замер,
 * замеры усредняются в интервалы. История переживает перезапуск панели (файл в DATA_DIR).
 */
class StatsHistory {
  private series: Record<string, Record<HistoryRange, Bucket[]>> = readJsonSync(FILE, {});
  private dirty = false;
  private timer = setInterval(() => void this.save(), SAVE_EVERY_MS).unref();

  record(key: string, sample: Omit<HistoryPoint, "t">, now = Date.now()): void {
    const entry = (this.series[key] ??= { day: [], week: [] });
    for (const range of Object.keys(RANGES) as HistoryRange[]) {
      const { step, keep } = RANGES[range];
      const list = entry[range];
      const start = Math.floor(now / step) * step;
      const last = list[list.length - 1];
      if (last && last.t === start) {
        last.n += 1;
        last.cpu += (sample.cpu - last.cpu) / last.n;
        last.ram += (sample.ram - last.ram) / last.n;
        last.disk += (sample.disk - last.disk) / last.n;
      } else {
        list.push({ t: start, ...sample, n: 1 });
        while (list.length && list[0].t < now - keep) list.shift();
      }
    }
    this.dirty = true;
  }

  /** Последние точки CPU за сутки без копирования всей истории — для графиков на главной. */
  tail(key: string, points: number): number[] {
    const day = this.series[key]?.day;
    if (!day) return [];
    return day.slice(-points).map((b) => Math.round(b.cpu * 10) / 10);
  }

  get(key: string, range: HistoryRange): HistoryPoint[] {
    return (this.series[key]?.[range] ?? []).map(({ t, cpu, ram, disk }) => ({
      t,
      cpu: Math.round(cpu * 10) / 10,
      ram: Math.round(ram * 1000) / 1000,
      disk: Math.round(disk * 1000) / 1000,
    }));
  }

  remove(key: string): void {
    if (this.series[key]) {
      delete this.series[key];
      this.dirty = true;
    }
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    await writeJsonAtomic(FILE, this.series).catch((error) => console.warn("Failed to save stats history:", error.message));
  }

  async close(): Promise<void> {
    clearInterval(this.timer);
    await this.save();
  }
}

export const statsHistory = new StatsHistory();
