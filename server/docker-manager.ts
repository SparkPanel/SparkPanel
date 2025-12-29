import Docker, { type Container, type ContainerCreateOptions } from "dockerode";
import type { Node, Server } from "@shared/schema";

export interface DockerConnection {
  client: Docker;
  node: Node;
  lastChecked: Date;
  isConnected: boolean;
}

/**
 * Docker Manager - управляет подключениями к Docker на разных нодах
 */
export class DockerManager {
  private connections: Map<string, DockerConnection> = new Map();
  private localDocker: Docker;

  constructor() {
    // Локальный Docker клиент (для текущей машины)
    this.localDocker = new Docker({ socketPath: "/var/run/docker.sock" });
  }

  /**
   * Получить Docker клиент для ноды
   * Если нода не указана или это локальная нода - возвращает локальный Docker
   */
  getDockerClient(node?: Node): Docker {
    // Если нода не указана, используем локальный Docker
    if (!node) {
      return this.localDocker;
    }

    // Для локальной ноды (127.0.0.1 или localhost) используем локальный Docker
    if (node.ip === "127.0.0.1" || node.ip === "localhost" || node.ip === "::1") {
      return this.localDocker;
    }

    // Для удаленных нод создаем или получаем существующий клиент
    const connection = this.connections.get(node.id);
    if (connection && connection.isConnected) {
      return connection.client;
    }

    // Создаем новое подключение к удаленной ноде
    return this.createRemoteConnection(node);
  }

  /**
   * Создать подключение к удаленной Docker ноде
   */
  private createRemoteConnection(node: Node): Docker {
    // Docker API может быть доступен через HTTP/HTTPS на удаленной машине
    // Для этого нужно настроить Docker daemon на удаленной ноде
    
    let dockerOptions: Docker.DockerOptions;

    if (node.port === 2375) {
      // HTTP подключение (небезопасно, только для внутренних сетей)
      dockerOptions = {
        host: node.ip,
        port: node.port,
        protocol: "http",
      };
    } else if (node.port === 2376) {
      // HTTPS подключение (рекомендуется)
      dockerOptions = {
        host: node.ip,
        port: node.port,
        protocol: "https",
        // Для HTTPS может потребоваться TLS сертификат
        // ca: fs.readFileSync('/path/to/ca.pem'),
        // cert: fs.readFileSync('/path/to/cert.pem'),
        // key: fs.readFileSync('/path/to/key.pem'),
      };
    } else {
      // Для Unix socket используем стандартный путь
      // Обычно используется только для локальных подключений
      dockerOptions = {
        socketPath: "/var/run/docker.sock",
      };
    }

    const client = new Docker(dockerOptions);

    // Сохраняем подключение
    this.connections.set(node.id, {
      client,
      node,
      lastChecked: new Date(),
      isConnected: false, // Будет обновлено при проверке
    });

    return client;
  }

  /**
   * Проверить подключение к Docker ноде
   */
  async checkNodeConnection(node: Node): Promise<boolean> {
    try {
      const client = this.getDockerClient(node);
      await client.ping();
      
      // Обновляем статус подключения
      const connection = this.connections.get(node.id);
      if (connection) {
        connection.isConnected = true;
        connection.lastChecked = new Date();
      }

      return true;
    } catch (error) {
      console.error(`Failed to connect to node ${node.name} (${node.ip}:${node.port}):`, error);
      
      // Обновляем статус подключения
      const connection = this.connections.get(node.id);
      if (connection) {
        connection.isConnected = false;
        connection.lastChecked = new Date();
      }

      return false;
    }
  }

  /**
   * Проверить все ноды
   */
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

  /**
   * Получить информацию о контейнере на ноде
   */
  async getContainer(node: Node, containerId: string): Promise<Container> {
    const client = this.getDockerClient(node);
    return client.getContainer(containerId);
  }

  /**
   * Создать контейнер на указанной ноде
   */
  async createContainer(
    node: Node,
    options: ContainerCreateOptions
  ): Promise<Container> {
    const client = this.getDockerClient(node);
    
    // Проверяем подключение перед созданием контейнера
    try {
      await client.ping();
    } catch (error) {
      throw new Error(`Cannot connect to node ${node.name}: ${error}`);
    }

    return await client.createContainer(options);
  }

  /**
   * Удалить подключение к ноде
   */
  removeConnection(nodeId: string): void {
    this.connections.delete(nodeId);
  }

  /**
   * Получить локальный Docker клиент
   */
  getLocalDocker(): Docker {
    return this.localDocker;
  }
}

// Экспортируем единственный экземпляр
export const dockerManager = new DockerManager();

