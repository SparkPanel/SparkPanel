import { settingsStore } from "./data-dir";
import { storage } from "./storage";

/** Диапазон портов, из которого серверам ноды выдаются порты. Без диапазона порт выбирается вручную. */
export interface PortPool {
  start: number;
  end: number;
}

const KEY = "port-pools";
const MAX_POOL_SIZE = 20000;

const allPools = () => settingsStore.get<Record<string, PortPool>>(KEY, {});

export function getPortPool(nodeId: string): PortPool | null {
  return allPools()[nodeId] ?? null;
}

export async function setPortPool(nodeId: string, pool: PortPool | null): Promise<void> {
  const pools = { ...allPools() };
  if (pool) {
    if (!Number.isInteger(pool.start) || !Number.isInteger(pool.end) || pool.start < 1024 || pool.end > 65535 || pool.start > pool.end) {
      throw Object.assign(new Error("Use a range between 1024 and 65535, start not above end"), { status: 400 });
    }
    if (pool.end - pool.start + 1 > MAX_POOL_SIZE) throw Object.assign(new Error(`A range can hold at most ${MAX_POOL_SIZE} ports`), { status: 400 });
    pools[nodeId] = { start: pool.start, end: pool.end };
  } else {
    delete pools[nodeId];
  }
  await settingsStore.set(KEY, pools);
}

/** Порт обязан входить в диапазон ноды, если диапазон задан. */
export function assertPortInPool(nodeId: string, port: number): void {
  const pool = getPortPool(nodeId);
  if (pool && (port < pool.start || port > pool.end)) {
    throw Object.assign(new Error(`Ports on this node are given out from ${pool.start}–${pool.end}`), { status: 400 });
  }
}

/** Первый свободный порт диапазона (ни у сервера, ни у его дополнительных портов). */
export async function findFreePort(nodeId: string, excludeServerId?: string): Promise<number | null> {
  const pool = getPortPool(nodeId);
  if (!pool) return null;
  for (let port = pool.start; port <= pool.end; port += 1) {
    if (await storage.checkPortAvailable(port, excludeServerId)) return port;
  }
  return null;
}

/** Порт для нового сервера: 0 означает «выдать из диапазона ноды». */
export async function resolveServerPort(nodeId: string, requested: number): Promise<number> {
  if (requested !== 0) {
    assertPortInPool(nodeId, requested);
    return requested;
  }
  if (!getPortPool(nodeId)) throw Object.assign(new Error("Set a port range for this node or enter a port"), { status: 400 });
  const port = await findFreePort(nodeId);
  if (port === null) throw Object.assign(new Error("All ports in this node's range are taken"), { status: 409 });
  return port;
}

export async function portPoolUsage(nodeId: string): Promise<{ pool: PortPool | null; used: number; nextFree: number | null }> {
  const pool = getPortPool(nodeId);
  if (!pool) return { pool: null, used: 0, nextFree: null };
  const servers = (await storage.getAllServers()).filter((s) => s.nodeId === nodeId && s.port >= pool.start && s.port <= pool.end);
  return { pool, used: servers.length, nextFree: await findFreePort(nodeId) };
}
