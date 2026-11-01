/**
 * Система управления плагинами для SparkPanel
 */

import { readdir, readFile, writeFile, mkdir, rm } from "fs/promises";
import { join, resolve } from "path";
import { existsSync } from "fs";
import { spawn, type ChildProcess } from "child_process";
import { createRequire } from "module";
import { pathToFileURL } from "url";
import { createInterface } from "readline";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  type: "javascript" | "typescript" | "python" | "jar";
  enabled: boolean;
  main: string;
  hooks?: string[];
  /** Последняя ошибка загрузки (не сохраняется в manifest.json). */
  error?: string;
}

type HookCallback = (...args: any[]) => Promise<any> | any;

interface RegisteredHook {
  pluginId: string;
  callback: HookCallback;
}

/** API, которое получает плагин в initialize(). Хуки автоматически привязываются к плагину. */
export interface PluginContext {
  pluginId: string;
  registerHook(hookName: string, callback: HookCallback): void;
  log(...args: unknown[]): void;
}

const PLUGIN_ID_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/;

export class PluginManager {
  private pluginsDir: string;
  private manifests = new Map<string, PluginManifest>();
  private active = new Set<string>();
  private modules = new Map<string, any>();
  private hooks = new Map<string, RegisteredHook[]>();
  private processes = new Map<string, ChildProcess>();

  constructor(pluginsDir = process.env.PLUGINS_DIR || "./plugins") {
    this.pluginsDir = resolve(pluginsDir);
  }

  getPluginsDir(): string {
    return this.pluginsDir;
  }

  async initialize(): Promise<void> {
    await mkdir(this.pluginsDir, { recursive: true });
    const entries = await readdir(this.pluginsDir, { withFileTypes: true });
    for (const entry of entries.filter((e) => e.isDirectory())) {
      try {
        await this.loadPlugin(entry.name);
      } catch (error) {
        console.error(`Failed to load plugin ${entry.name}:`, (error as Error).message);
      }
    }
  }

  private pluginPath(pluginId: string): string {
    if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error("Invalid plugin ID");
    return join(this.pluginsDir, pluginId);
  }

  /** Читает manifest.json и, если плагин отмечен как включённый, запускает его. */
  async loadPlugin(pluginId: string): Promise<void> {
    const manifestPath = join(this.pluginPath(pluginId), "manifest.json");
    if (!existsSync(manifestPath)) throw new Error(`Manifest not found for plugin ${pluginId}`);
    const manifest: PluginManifest = JSON.parse(await readFile(manifestPath, "utf-8"));
    manifest.id = pluginId;
    delete manifest.error;

    if (this.active.has(pluginId)) await this.stopPlugin(pluginId);
    this.manifests.set(pluginId, manifest);

    if (manifest.enabled) {
      try {
        await this.startPlugin(manifest);
      } catch (error) {
        manifest.error = (error as Error).message;
        console.error(`Failed to start plugin ${pluginId}:`, manifest.error);
      }
    }
  }

  private context(pluginId: string): PluginContext {
    return {
      pluginId,
      registerHook: (hookName, callback) => this.registerHook(hookName, callback, pluginId),
      log: (...args) => console.log(`[plugin:${pluginId}]`, ...args),
    };
  }

  private async startPlugin(manifest: PluginManifest): Promise<void> {
    const mainFile = join(this.pluginPath(manifest.id), manifest.main);
    if (!resolve(mainFile).startsWith(this.pluginPath(manifest.id))) throw new Error("Invalid main file path");
    if (!existsSync(mainFile)) throw new Error(`Main file not found: ${manifest.main}`);

    switch (manifest.type) {
      case "javascript":
      case "typescript":
        await this.startJsPlugin(manifest.id, mainFile);
        break;
      case "python":
        this.startProcessPlugin(manifest.id, process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3"), [mainFile]);
        break;
      case "jar":
        this.startProcessPlugin(manifest.id, process.env.JAVA_BIN || "java", ["-jar", mainFile]);
        break;
      default:
        throw new Error(`Unsupported plugin type: ${manifest.type}`);
    }
    this.active.add(manifest.id);
    console.log(`Plugin ${manifest.id} started`);
  }

  private async startJsPlugin(pluginId: string, mainFile: string): Promise<void> {
    let mod: any;
    if (mainFile.endsWith(".cjs")) {
      mod = createRequire(import.meta.url)(mainFile);
    } else {
      mod = await import(`${pathToFileURL(mainFile).href}?v=${Date.now()}`);
    }
    const instance = mod?.default ?? mod;
    const initialize = instance?.initialize ?? mod?.initialize;
    if (typeof initialize === "function") {
      await initialize.call(instance, this.context(pluginId));
    }
    this.modules.set(pluginId, instance);
  }

  /**
   * Python и JAR плагины работают отдельным процессом. События хуков передаются в stdin
   * по одному JSON на строку: {"hook": "...", "args": [...]}. Плагин может писать в stdout
   * строки JSON {"log": "..."} — они попадают в журнал панели.
   */
  private startProcessPlugin(pluginId: string, command: string, args: string[]): void {
    const child = spawn(command, args, { cwd: this.pluginPath(pluginId), stdio: ["pipe", "pipe", "pipe"] });
    child.on("error", (error) => {
      const manifest = this.manifests.get(pluginId);
      if (manifest) manifest.error = error.message;
      console.error(`Plugin ${pluginId} process error:`, error.message);
    });
    child.on("exit", (code) => {
      this.processes.delete(pluginId);
      this.active.delete(pluginId);
      if (code !== 0 && code !== null) {
        const manifest = this.manifests.get(pluginId);
        if (manifest) manifest.error = `Process exited with code ${code}`;
      }
    });
    createInterface({ input: child.stdout! }).on("line", (line) => {
      try {
        const message = JSON.parse(line);
        if (message?.log) console.log(`[plugin:${pluginId}]`, message.log);
      } catch {
        console.log(`[plugin:${pluginId}]`, line);
      }
    });
    child.stderr!.on("data", (data) => console.error(`[plugin:${pluginId}]`, data.toString().trim()));
    child.stdin!.on("error", () => {});
    this.processes.set(pluginId, child);
  }

  private async stopPlugin(pluginId: string): Promise<void> {
    const instance = this.modules.get(pluginId);
    if (instance && typeof instance.shutdown === "function") {
      await Promise.resolve(instance.shutdown()).catch((err: Error) => console.error(`Plugin ${pluginId} shutdown error:`, err.message));
    }
    const child = this.processes.get(pluginId);
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise<void>((done) => child.once("exit", () => done()));
      child.kill();
      await Promise.race([exited, new Promise((done) => setTimeout(done, 5000))]);
    }
    this.processes.delete(pluginId);
    this.modules.delete(pluginId);
    for (const [hookName, list] of this.hooks) {
      this.hooks.set(hookName, list.filter((h) => h.pluginId !== pluginId));
    }
    this.active.delete(pluginId);
  }

  async enablePlugin(pluginId: string): Promise<void> {
    const manifest = this.manifests.get(pluginId);
    if (!manifest) throw new Error(`Plugin ${pluginId} not found`);
    if (this.active.has(pluginId)) return;
    delete manifest.error;
    await this.startPlugin(manifest);
    manifest.enabled = true;
    await this.saveManifest(manifest);
  }

  async disablePlugin(pluginId: string): Promise<void> {
    const manifest = this.manifests.get(pluginId);
    if (!manifest) throw new Error(`Plugin ${pluginId} not found`);
    await this.stopPlugin(pluginId);
    manifest.enabled = false;
    delete manifest.error;
    await this.saveManifest(manifest);
  }

  private async saveManifest(manifest: PluginManifest): Promise<void> {
    const { error: _error, ...persisted } = manifest;
    await writeFile(join(this.pluginPath(manifest.id), "manifest.json"), JSON.stringify(persisted, null, 2), "utf-8");
  }

  registerHook(hookName: string, callback: HookCallback, pluginId = "core"): void {
    if (!this.hooks.has(hookName)) this.hooks.set(hookName, []);
    this.hooks.get(hookName)!.push({ pluginId, callback });
  }

  /** Вызывает хук во всех активных плагинах. Ошибки плагинов не влияют на работу панели. */
  async callHook(hookName: string, ...args: any[]): Promise<any[]> {
    const results: any[] = [];
    for (const hook of this.hooks.get(hookName) ?? []) {
      try {
        results.push(await hook.callback(...args));
      } catch (error) {
        console.error(`Error in hook ${hookName} from plugin ${hook.pluginId}:`, error);
      }
    }
    if (this.processes.size > 0) {
      const line = JSON.stringify({ hook: hookName, args }) + "\n";
      for (const child of this.processes.values()) {
        if (child.stdin?.writable) child.stdin.write(line);
      }
    }
    return results;
  }

  async getAllPlugins(): Promise<(PluginManifest & { running: boolean })[]> {
    return Array.from(this.manifests.values()).map((m) => ({ ...m, running: this.active.has(m.id) }));
  }

  getPlugin(pluginId: string): PluginManifest | undefined {
    return this.manifests.get(pluginId);
  }

  async deletePlugin(pluginId: string): Promise<void> {
    const pluginPath = this.pluginPath(pluginId);
    await this.stopPlugin(pluginId);
    await rm(pluginPath, { recursive: true, force: true });
    this.manifests.delete(pluginId);
  }

  isPluginEnabled(pluginId: string): boolean {
    return this.active.has(pluginId);
  }

  async shutdown(): Promise<void> {
    for (const pluginId of Array.from(this.active)) {
      await this.stopPlugin(pluginId);
    }
  }
}

export const pluginManager = new PluginManager();
