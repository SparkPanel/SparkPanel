import Docker, { ContainerCreateOptions } from 'dockerode';
import { config } from '../config.js';
import fs from 'fs/promises';
import path from 'path';

const docker = new Docker();

export interface CreateServerOptions {
  id: string;
  name: string;
  image: string; // e.g., itzg/minecraft-server
  version: string;
  type: string; // VANILLA, PAPER, etc
  cpuLimit?: number; // cores
  memoryLimitMb?: number;
  port: number;
}

export function serverDataPath(serverId: string) {
  return path.join(config.filesRoot, serverId);
}

export async function ensureServerDir(serverId: string) {
  const dir = serverDataPath(serverId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function pullImage(image: string) {
  return new Promise<void>((resolve, reject) => {
    docker.pull(image, (err, stream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (err2) => (err2 ? reject(err2) : resolve()));
    });
  });
}

export async function createOrStartContainer(opts: CreateServerOptions) {
  const name = `spark_mc_${opts.id}`;
  const dir = await ensureServerDir(opts.id);

  const hostConfig: ContainerCreateOptions['HostConfig'] = {
    Binds: [`${dir}:/data`],
    PortBindings: {
      '25565/tcp': [{ HostPort: String(opts.port) }],
    },
    Memory: opts.memoryLimitMb ? opts.memoryLimitMb * 1024 * 1024 : undefined,
    NanoCPUs: opts.cpuLimit ? Math.floor(opts.cpuLimit * 1e9) : undefined,
    RestartPolicy: { Name: 'unless-stopped' },
  };

  const env = [
    'EULA=TRUE',
    `VERSION=${opts.version}`,
    `TYPE=${opts.type}`,
    'UID=1000',
    'GID=1000',
    'USE_AIKAR_FLAGS=true',
  ];

  // ensure image exists
  await pullImage(opts.image).catch(() => {});

  // try to find existing
  const containers = await docker.listContainers({ all: true, filters: { name: [name] } as any });
  let container = containers.length ? docker.getContainer(containers[0].Id) : null;

  if (!container) {
    container = await docker.createContainer({
      name,
      Image: opts.image,
      Env: env,
      ExposedPorts: { '25565/tcp': {} },
      HostConfig: hostConfig,
      Labels: { 'sparkpanel.serverId': opts.id },
    });
  }

  // start if not running
  const inspect = await container.inspect();
  if (!inspect.State.Running) {
    await container.start();
  }
  return container;
}

export async function stopContainer(serverId: string) {
  const name = `spark_mc_${serverId}`;
  const containers = await docker.listContainers({ all: true, filters: { name: [name] } as any });
  if (!containers.length) return;
  const container = docker.getContainer(containers[0].Id);
  const inspect = await container.inspect();
  if (inspect.State.Running) {
    await container.stop();
  }
}

export async function removeContainer(serverId: string) {
  const name = `spark_mc_${serverId}`;
  const containers = await docker.listContainers({ all: true, filters: { name: [name] } as any });
  if (!containers.length) return;
  const container = docker.getContainer(containers[0].Id);
  const inspect = await container.inspect();
  if (inspect.State.Running) {
    await container.stop();
  }
  await container.remove({ force: true });
}

export async function getStats(serverId: string) {
  const name = `spark_mc_${serverId}`;
  const containers = await docker.listContainers({ all: true, filters: { name: [name] } as any });
  if (!containers.length) return null;
  const container = docker.getContainer(containers[0].Id);
  const stream = await container.stats({ stream: false });
  const cpuDelta = stream.cpu_stats.cpu_usage.total_usage - stream.precpu_stats.cpu_usage.total_usage;
  const systemDelta = stream.cpu_stats.system_cpu_usage - stream.precpu_stats.system_cpu_usage;
  const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * (stream.cpu_stats.online_cpus || 1) * 100.0 : 0;
  const memoryUsage = stream.memory_stats.usage || 0;
  const memoryLimit = stream.memory_stats.limit || 0;
  const netAgg = stream.networks ? Object.values(stream.networks as any).reduce((acc: any, n: any) => ({
    rx_bytes: acc.rx_bytes + (n.rx_bytes || 0),
    tx_bytes: acc.tx_bytes + (n.tx_bytes || 0),
  }), { rx_bytes: 0, tx_bytes: 0 }) : { rx_bytes: 0, tx_bytes: 0 };
  return { cpuPercent, memoryUsage, memoryLimit, netIO: netAgg };
} 