import { isIP } from "net";
import type { Node } from "@shared/schema";
import { settingsStore } from "./data-dir";
import { isLocalNode } from "./docker-manager";

/**
 * Адрес, по которому игроки и клиенты подключаются к серверам ноды. Внутренний IP, по которому панель
 * ходит в Docker (127.0.0.1, адрес в VPN или локальной сети), часто не годится для игроков — поэтому
 * для ноды можно указать публичный IP или домен.
 */
const KEY = "node-public-addresses";
const HOSTNAME = /^(?=.{1,253}$)(?!-)([a-z0-9-]{1,63}(?<!-)\.)*[a-z0-9-]{1,63}$/i;

const all = () => settingsStore.get<Record<string, string>>(KEY, {});

export function getPublicAddress(nodeId: string): string | null {
  return all()[nodeId] ?? null;
}

export async function setPublicAddress(nodeId: string, address: string | null): Promise<void> {
  const next = { ...all() };
  const value = address?.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/\/.*$/, "") ?? "";
  if (value) {
    if (!isIP(value) && !HOSTNAME.test(value)) throw Object.assign(new Error("Enter an IP address or a domain, without a port"), { status: 400 });
    next[nodeId] = value;
  } else {
    delete next[nodeId];
  }
  await settingsStore.set(KEY, next);
}

/** Адрес для подключения к серверам ноды или null, если он неизвестен (локальная нода без публичного адреса). */
export function connectHost(node: Node): string | null {
  return getPublicAddress(node.id) ?? (isLocalNode(node) ? null : node.ip);
}
