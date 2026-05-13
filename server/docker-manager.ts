import Docker, { type Container, type ContainerCreateOptions } from "dockerode";
import type { Node, Server } from "@shared/schema";

export interface DockerConnection {
  client: Docker;
  node: Node;
  lastChecked: Date;
  isConnected: boolean;
}


export class DockerManager {
  private connections: Map<string, DockerConnection> = new Map();
  private localDocker: Docker;

  constructor() {
    
    this.localDocker = new Docker({ socketPath: "/var/run/docker.sock" });
  }

  
  getDockerClient(node?: Node): Docker {
    
    if (!node) {
      return this.localDocker;
    }

    
    if (node.ip === "127.0.0.1" || node.ip === "localhost" || node.ip === "::1") {
      return this.localDocker;
    }

    
    const connection = this.connections.get(node.id);
    if (connection && connection.isConnected) {
      return connection.client;
    }

    
    return this.createRemoteConnection(node);
  }

  
  private createRemoteConnection(node: Node): Docker {
    
    
    let dockerOptions: Docker.DockerOptions;

    if (node.port === 2375) {
      
      dockerOptions = {
        host: node.ip,
        port: node.port,
        protocol: "http",
      };
    } else if (node.port === 2376) {
      
      dockerOptions = {
        host: node.ip,
        port: node.port,
        protocol: "https",
        
      };
    } else {
      
      dockerOptions = {
        socketPath: "/var/run/docker.sock",
      };
    }

    const client = new Docker(dockerOptions);

    
    this.connections.set(node.id, {
      client,
      node,
      lastChecked: new Date(),
      isConnected: false, 
    });

    return client;
  }

  
  async checkNodeConnection(node: Node): Promise<boolean> {
    try {
      const client = this.getDockerClient(node);
      await client.ping();
      
      
      const connection = this.connections.get(node.id);
      if (connection) {
        connection.isConnected = true;
        connection.lastChecked = new Date();
      }

      return true;
    } catch (error) {
      console.error(`Failed to connect to node ${node.name} (${node.ip}:${node.port}):`, error);
      
      
      const connection = this.connections.get(node.id);
      if (connection) {
        connection.isConnected = false;
        connection.lastChecked = new Date();
      }

      return false;
    }
  }

  
  async checkAllNodes(nodes: Node[]): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    
    await Promise.all(
      nodes.map(async (node) => {
        const isConnected = await this.checkNodeConnection(node);
        results.set(node.id, isConnected);
      })
    );

    return results;
  }

  
  async getContainer(node: Node, containerId: string): Promise<Container> {
    const client = this.getDockerClient(node);
    return client.getContainer(containerId);
  }

  
  async createContainer(
    node: Node,
    options: ContainerCreateOptions
  ): Promise<Container> {
    const client = this.getDockerClient(node);
    
    
    try {
      await client.ping();
    } catch (error) {
      throw new Error(`Cannot connect to node ${node.name}: ${error}`);
    }

    return await client.createContainer(options);
  }

  
  removeConnection(nodeId: string): void {
    this.connections.delete(nodeId);
  }

  
  getLocalDocker(): Docker {
    return this.localDocker;
  }
}

export const dockerManager = new DockerManager();

