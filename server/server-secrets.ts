import { randomBytes, randomInt } from "crypto";
import type { Server } from "@shared/schema";
import { isProfiledGame, resolveGameSettings } from "@shared/game-profiles";
import { storage } from "./storage";

/** Игры, которыми панель управляет через RCON: им нужен внутренний пароль администратора. */
const RCON_GAMES = new Set(["minecraft", "csgo", "rust", "ark", "gmod"]);

/** Пароль, который легко продиктовать игрокам: без похожих символов (0/O, 1/l). */
function readablePassword(length = 8): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join("");
}

/**
 * Выдаёт серверу секреты, без которых образы подставляют свои общеизвестные значения по умолчанию
 * (RCON «changeme» / «docker», пароль ARK «YouShallNotPass», пароль Valheim «secret»):
 *  - внутренний пароль RCON — знает только панель;
 *  - пароль входа Valheim — игра требует его, владелец видит его в настройках.
 * Сохраняется один раз и применяется при следующем запуске контейнера.
 */
export async function ensureServerSecrets(server: Server): Promise<Server> {
  const config = { ...((server.config as Record<string, any>) || {}) };
  let changed = false;
  if (RCON_GAMES.has(server.gameType) && !(typeof config.rconPassword === "string" && config.rconPassword)) {
    config.rconPassword = randomBytes(18).toString("base64url");
    changed = true;
  }
  if (server.gameType === "valheim") {
    const settings = resolveGameSettings("valheim", config.gameSettings);
    if (String(settings.values.password).length < 5) {
      settings.values.password = readablePassword();
      config.gameSettings = settings;
      changed = true;
    }
  }
  if (isProfiledGame(server.gameType) && !config.gameSettings) {
    config.gameSettings = resolveGameSettings(server.gameType, null);
    changed = true;
  }
  return changed ? (await storage.updateServer(server.id, { config }))! : server;
}
