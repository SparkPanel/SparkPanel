import Docker, { type Container, type ContainerCreateOptions } from "dockerode";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { Node } from "@shared/schema";
import { dataPath } from "./data-dir";

export interface DockerConnection {
  client: Docker;
  node: Node;
  lastChecked: Date;
  isConnected: boolean;
}

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "local", "unix"]);

export function isLocalNode(node: Pick<Node, "ip">): boolean {
  return LOCAL_HOSTS.has(node.ip.trim().toLowerCase());
}

/**
 * TLS-сертификаты для удалённых нод на порту 2376 берутся из DOCKER_CERT_PATH
 * (ca.pem, cert.pem, key.pem) — тот же формат, что использует docker CLI.
 * Без DOCKER_CERT_PATH — из DATA_DIR/docker-certs, куда их кладёт установка нод скриптом.
 */
function loadTlsOptions(): { ca?: Buffer; cert?: Buffer; key?: Buffer } {
  const certPath = process.env.DOCKER_CERT_PATH || dataPath("docker-certs");
  const read = (name: string) => {
    const file = join(certPath, name);
    return existsSync(file) ? readFileSync(file) : undefined;
  };
  return { ca: read("ca.pem"), cert: read("cert.pem"), key: read("key.pem") };
}

export class DockerManager {
  private connections: Map<string, DockerConnection> = new Map();
  private localDocker: Docker;

  constructor() {
    this.localDocker = new Docker();
  }

  getDockerClient(node?: Node): Docker {
    if (!node || isLocalNode(node)) {
      return this.localDocker;
    }

    const connection = this.connections.get(node.id);
    if (connection && connection.node.ip === node.ip && connection.node.port === node.port) {
      return connection.client;
    }

    return this.createRemoteConnection(node);
  }

  private createRemoteConnection(node: Node): Docker {
    const useTls = node.port === 2376;
    const client = new Docker({
      host: node.ip,
      port: node.port,
      protocol: useTls ? "https" : "http",
      ...(useTls ? loadTlsOptions() : {}),
      timeout: 15000,
    });

    this.connections.set(node.id, {
      client,
      node,
      lastChecked: new Date(),
      isConnected: false,
    });

    return client;
  }

  async checkNodeConnection(node: Node): Promise<boolean> {
    const client = this.getDockerClient(node);
    let ok = false;
    try {
      await Promise.race([
        client.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("ping timeout")), 10000)),
      ]);
      ok = true;
    } catch (error) {
      console.error(`Failed to connect to node ${node.name} (${node.ip}:${node.port}):`, (error as Error).message);
    }

    const connection = this.connections.get(node.id);
    if (connection) {
      connection.isConnected = ok;
      connection.lastChecked = new Date();
    }
    return ok;
  }

  async checkAllNodes(nodes: Node[]): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    await Promise.all(
      nodes.map(async (node) => {
        results.set(node.id, await this.checkNodeConnection(node));
      }),
    );
    return results;
  }

  async getContainer(node: Node, containerId: string): Promise<Container> {
    return this.getDockerClient(node).getContainer(containerId);
  }

  async createContainer(node: Node, options: ContainerCreateOptions): Promise<Container> {
    const client = this.getDockerClient(node);
    try {
      await client.ping();
    } catch (error) {
      throw new Error(`Cannot connect to node ${node.name}: ${(error as Error).message}`);
    }
    return client.createContainer(options);
  }

  removeConnection(nodeId: string): void {
    this.connections.delete(nodeId);
  }

  getLocalDocker(): Docker {
    return this.localDocker;
  }
}

export const dockerManager = new DockerManager();
