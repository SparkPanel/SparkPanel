/**
 * Типы для системы плагинов
 */

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
}

export interface PluginInstance {
  type: string;
  manifest: PluginManifest;
  enabled: boolean;
}

