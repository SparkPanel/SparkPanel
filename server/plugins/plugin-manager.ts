/**
 * Система управления плагинами для SparkPanel
 */

import { readdir, readFile, writeFile, mkdir, rm } from "fs/promises";
import { join, extname, basename } from "path";
import { existsSync } from "fs";
import { spawn, ChildProcess } from "child_process";
import { createRequire } from "module";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  type: "javascript" | "typescript" | "python" | "jar";
  enabled: boolean;
  main: string; // Имя основного файла
  hooks?: string[]; // Хуки, которые использует плагин
}

export interface PluginHook {
  name: string; // Название хука
  callback: (...args: any[]) => Promise<any> | any; // Функция обработки
}

/**
 * Менеджер плагинов для загрузки и управления плагинами
 */
export class PluginManager {
  private pluginsDir: string;
  private loadedPlugins: Map<string, any> = new Map();
  private pluginManifests: Map<string, PluginManifest> = new Map();
  private hooks: Map<string, PluginHook[]> = new Map();
  private processes: Map<string, ChildProcess> = new Map();

  constructor(pluginsDir: string = "./plugins") {
    this.pluginsDir = pluginsDir;
    // Создаем директорию плагинов, если не существует
    if (!existsSync(this.pluginsDir)) {
      mkdir(this.pluginsDir, { recursive: true }).catch(() => {});
    }
  }

  /**
   * Инициализация - загрузка всех плагинов
   */
  async initialize(): Promise<void> {
    try {
      await this.loadAllPlugins();
    } catch (error) {
      console.error("Failed to initialize plugins:", error);
    }
  }

  /**
   * Загрузить все плагины из директории
   */
  async loadAllPlugins(): Promise<void> {
    if (!existsSync(this.pluginsDir)) {
      return;
    }

    const entries = await readdir(this.pluginsDir, { withFileTypes: true });
    const pluginDirs = entries.filter(entry => entry.isDirectory());

    for (const pluginDir of pluginDirs) {
      try {
        await this.loadPlugin(pluginDir.name);
      } catch (error) {
        console.error(`Failed to load plugin ${pluginDir.name}:`, error);
      }
    }
  }

  /**
   * Загрузить конкретный плагин
   */
  async loadPlugin(pluginId: string): Promise<void> {
    const pluginPath = join(this.pluginsDir, pluginId);
    const manifestPath = join(pluginPath, "manifest.json");

    if (!existsSync(manifestPath)) {
      throw new Error(`Manifest not found for plugin ${pluginId}`);
    }

    const manifestContent = await readFile(manifestPath, "utf-8");
    const manifest: PluginManifest = JSON.parse(manifestContent);
    manifest.id = pluginId;

    this.pluginManifests.set(pluginId, manifest);

    // Загружаем плагин только если он включен
    if (manifest.enabled) {
      await this.enablePlugin(pluginId);
    }
  }

  /**
   * Включить плагин
   */
  async enablePlugin(pluginId: string): Promise<void> {
    const manifest = this.pluginManifests.get(pluginId);
    if (!manifest) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (manifest.enabled) {
      return; // Уже включен
    }

    const pluginPath = join(this.pluginsDir, pluginId);
    const mainFile = join(pluginPath, manifest.main);

    if (!existsSync(mainFile)) {
      throw new Error(`Main file not found: ${mainFile}`);
    }

    try {
      switch (manifest.type) {
        case "javascript":
        case "typescript":
          await this.loadJavaScriptPlugin(pluginId, mainFile, manifest);
          break;
        case "python":
          await this.loadPythonPlugin(pluginId, mainFile, manifest);
          break;
        case "jar":
          await this.loadJarPlugin(pluginId, mainFile, manifest);
          break;
        default:
          throw new Error(`Unsupported plugin type: ${manifest.type}`);
      }

      manifest.enabled = true;
      await this.saveManifest(pluginId, manifest);
      console.log(`Plugin ${pluginId} enabled`);
    } catch (error) {
      console.error(`Failed to enable plugin ${pluginId}:`, error);
      throw error;
    }
  }

  /**
   * Отключить плагин
   */
  async disablePlugin(pluginId: string): Promise<void> {
    const manifest = this.pluginManifests.get(pluginId);
    if (!manifest) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (!manifest.enabled) {
      return; // Уже отключен
    }

    // Останавливаем процесс, если есть
    const process = this.processes.get(pluginId);
    if (process) {
      process.kill();
      this.processes.delete(pluginId);
    }

    // Удаляем загруженный модуль
    this.loadedPlugins.delete(pluginId);

    // Удаляем хуки плагина
    if (manifest.hooks) {
      for (const hookName of manifest.hooks) {
        const hooks = this.hooks.get(hookName) || [];
        const filtered = hooks.filter(h => (h as any).pluginId !== pluginId);
        this.hooks.set(hookName, filtered);
      }
    }

    manifest.enabled = false;
    await this.saveManifest(pluginId, manifest);
    console.log(`Plugin ${pluginId} disabled`);
  }

  /**
   * Загрузить JavaScript/TypeScript плагин
   */
  private async loadJavaScriptPlugin(
    pluginId: string,
    mainFile: string,
    manifest: PluginManifest
  ): Promise<void> {
    // Для JS/TS плагинов используем динамический импорт
    try {
      // Поддерживаем как ES modules, так и CommonJS
      let pluginModule;
      try {
        // Пробуем ES modules импорт
        pluginModule = await import(mainFile);
      } catch (esmError) {
        // Если не получилось, пробуем CommonJS через require
        const require = createRequire(import.meta.url);
        pluginModule = require(mainFile);
      }

      const pluginInstance = pluginModule.default || pluginModule;

      if (typeof pluginInstance.initialize === "function") {
        await pluginInstance.initialize(this);
      } else if (typeof pluginModule.initialize === "function") {
        // Пробуем напрямую из модуля
        await pluginModule.initialize(this);
      }

      this.loadedPlugins.set(pluginId, pluginInstance);
    } catch (error) {
      console.error(`Failed to load JS plugin ${pluginId}:`, error);
      throw new Error(`Failed to load JS plugin: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Загрузить Python плагин
   */
  private async loadPythonPlugin(
    pluginId: string,
    mainFile: string,
    manifest: PluginManifest
  ): Promise<void> {
    // Для Python плагинов запускаем процесс
    const pythonProcess = spawn("python3", [mainFile], {
      cwd: join(this.pluginsDir, pluginId),
      stdio: ["pipe", "pipe", "pipe"],
    });

    pythonProcess.on("error", (error) => {
      console.error(`Python plugin ${pluginId} error:`, error);
    });

    pythonProcess.stderr.on("data", (data) => {
      console.error(`Python plugin ${pluginId} stderr:`, data.toString());
    });

    this.processes.set(pluginId, pythonProcess);
    this.loadedPlugins.set(pluginId, { type: "python", process: pythonProcess });
  }

  /**
   * Загрузить JAR плагин
   */
  private async loadJarPlugin(
    pluginId: string,
    mainFile: string,
    manifest: PluginManifest
  ): Promise<void> {
    // Для JAR плагинов запускаем Java процесс
    const jarProcess = spawn("java", ["-jar", mainFile], {
      cwd: join(this.pluginsDir, pluginId),
      stdio: ["pipe", "pipe", "pipe"],
    });

    jarProcess.on("error", (error) => {
      console.error(`JAR plugin ${pluginId} error:`, error);
    });

    jarProcess.stderr.on("data", (data) => {
      console.error(`JAR plugin ${pluginId} stderr:`, data.toString());
    });

    this.processes.set(pluginId, jarProcess);
    this.loadedPlugins.set(pluginId, { type: "jar", process: jarProcess });
  }

  /**
   * Сохранить манифест плагина
   */
  private async saveManifest(pluginId: string, manifest: PluginManifest): Promise<void> {
    const manifestPath = join(this.pluginsDir, pluginId, "manifest.json");
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  }

  /**
   * Зарегистрировать хук
   */
  registerHook(hookName: string, callback: (...args: any[]) => Promise<any> | any, pluginId?: string): void {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }

    const hooks = this.hooks.get(hookName)!;
    hooks.push({
      name: hookName,
      callback,
      ...(pluginId && { pluginId }),
    });
  }

  /**
   * Вызвать хук
   */
  async callHook(hookName: string, ...args: any[]): Promise<any[]> {
    const hooks = this.hooks.get(hookName) || [];
    const results: any[] = [];

    for (const hook of hooks) {
      try {
        const result = await hook.callback(...args);
        results.push(result);
      } catch (error) {
        console.error(`Error in hook ${hookName} from plugin:`, error);
      }
    }

    return results;
  }

  /**
   * Получить список всех плагинов
   */
  async getAllPlugins(): Promise<PluginManifest[]> {
    return Array.from(this.pluginManifests.values());
  }

  /**
   * Получить информацию о плагине
   */
  getPlugin(pluginId: string): PluginManifest | undefined {
    return this.pluginManifests.get(pluginId);
  }

  /**
   * Удалить плагин
   */
  async deletePlugin(pluginId: string): Promise<void> {
    const manifest = this.pluginManifests.get(pluginId);
    if (manifest && manifest.enabled) {
      await this.disablePlugin(pluginId);
    }

    const pluginPath = join(this.pluginsDir, pluginId);
    if (existsSync(pluginPath)) {
      try {
        await rm(pluginPath, { recursive: true, force: true });
      } catch (error) {
        console.error(`Failed to remove plugin directory ${pluginPath}:`, error);
        throw error;
      }
    }

    this.pluginManifests.delete(pluginId);
    this.loadedPlugins.delete(pluginId);
  }

  /**
   * Проверить, включен ли плагин
   */
  isPluginEnabled(pluginId: string): boolean {
    const manifest = this.pluginManifests.get(pluginId);
    return manifest?.enabled || false;
  }
}

// Глобальный экземпляр менеджера плагинов
export const pluginManager = new PluginManager("./plugins");

