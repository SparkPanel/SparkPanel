/**
 * Профили игр: ядро (вариант сервера), настройки и порты каждой игры. Общий для панели и интерфейса:
 * форма создания и вкладка настроек строятся по этим описаниям, а сервер панели по ним собирает контейнер.
 *
 * Источники: README Docker-образов (joedwards32/cs2, didstopia/rust-server, hermsi/ark-server,
 * lloesche/valheim-server, ryshe/terraria, ceifa/garrysmod) и стандартные параметры движков
 * (Source: game_type/game_mode, +sv_password, +rcon_password; Terraria: ключи запуска выделенного сервера).
 */

export type GameFieldType = "text" | "number" | "select" | "password" | "boolean";

export interface GameField {
  key: string;
  label: string;
  type: GameFieldType;
  default: string | number | boolean;
  help?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  /** Обязательное поле с минимальной длиной (например, пароль Valheim от 5 символов). */
  minLength?: number;
  /** Значение не возвращается в API после сохранения (токены). */
  secret?: boolean;
  /** Поле показывается только для этих ядер. */
  variants?: string[];
}

export interface GameVariant {
  id: string;
  label: string;
  description: string;
}

export interface GamePort {
  /** Смещение от основного порта сервера. */
  offset: number;
  protocol: "tcp" | "udp";
  purpose: string;
}

export interface GameProfile {
  label: string;
  defaultPort: number;
  /** Ресурсы, которых хватает серверу игры (подставляются в форму создания): CPU — % ноды, диск — с учётом установки игры. */
  recommended: { ramGb: number; diskGb: number; cpuPercent: number };
  /** Подсказка игроку, как подключиться; {address} — адрес:порт сервера. */
  connect: string;
  /** Ссылка steam://connect открывает игру сразу на сервере (где игра это поддерживает). */
  steamConnect?: boolean;
  /** Смещение порта запросов Steam ({query} в подсказке) от основного порта. */
  queryOffset?: number;
  variants: GameVariant[];
  fields: GameField[];
  /** Порты контейнера; для части игр зависят от ядра. */
  ports: (variant: string) => GamePort[];
  /** Где лежат плагины или моды выбранного ядра (папка в файлах сервера), если ядро их поддерживает. */
  modsFolder?: (variant: string) => string | null;
}

const MAX_PLAYERS = (def: number, max: number): GameField => ({ key: "maxPlayers", label: "Max players", type: "number", default: def, min: 1, max });

/** Названия типов серверов для списков и карточек. */
export const GAME_LABELS: Record<string, string> = {
  minecraft: "Minecraft",
  csgo: "Counter-Strike 2",
  rust: "Rust",
  ark: "ARK",
  valheim: "Valheim",
  terraria: "Terraria",
  gmod: "Garry's Mod",
  custom: "Custom",
};

export const GAME_PROFILES: Record<"csgo" | "rust" | "ark" | "valheim" | "terraria" | "gmod", GameProfile> = {
  csgo: {
    label: "Counter-Strike 2",
    defaultPort: 27015,
    recommended: { ramGb: 4, diskGb: 70, cpuPercent: 50 },
    connect: "Open the game console (~) and type: connect {address}",
    steamConnect: true,
    variants: [{ id: "vanilla", label: "Counter-Strike 2", description: "Official dedicated server from Steam (app 730)." }],
    fields: [
      { key: "hostname", label: "Server name", type: "text", default: "", help: "Shown in the server list. Empty — the name of the server in the panel." },
      {
        key: "mode",
        label: "Game mode",
        type: "select",
        default: "competitive",
        options: [
          { value: "casual", label: "Casual" },
          { value: "competitive", label: "Competitive" },
          { value: "wingman", label: "Wingman" },
          { value: "deathmatch", label: "Deathmatch" },
          { value: "armsrace", label: "Arms Race" },
        ],
      },
      {
        key: "map",
        label: "Start map",
        type: "select",
        default: "de_dust2",
        options: ["de_dust2", "de_mirage", "de_inferno", "de_nuke", "de_ancient", "de_anubis", "de_overpass", "de_vertigo", "de_train", "cs_office", "cs_italy", "ar_baggage", "ar_shoots"].map((m) => ({ value: m, label: m })),
      },
      MAX_PLAYERS(10, 64),
      { key: "password", label: "Join password", type: "text", default: "", help: "Leave empty for an open server." },
      {
        key: "gslt",
        label: "Steam game server token (GSLT)",
        type: "password",
        default: "",
        secret: true,
        help: "Without a token the server is reachable only on the local network. Create one at steamcommunity.com/dev/managegameservers for app 730.",
      },
    ],
    ports: () => [
      { offset: 0, protocol: "udp", purpose: "game" },
      { offset: 0, protocol: "tcp", purpose: "RCON" },
    ],
    modsFolder: () => "game/csgo/addons",
  },
  rust: {
    label: "Rust",
    defaultPort: 28015,
    recommended: { ramGb: 10, diskGb: 25, cpuPercent: 75 },
    connect: "Press F1 in the game and type: client.connect {address}",
    variants: [
      { id: "vanilla", label: "Vanilla", description: "Rust without mods — as Facepunch ships it." },
      { id: "oxide", label: "Oxide (uMod)", description: "Rust with Oxide installed for uMod plugins; updated on every start." },
    ],
    fields: [
      { key: "hostname", label: "Server name", type: "text", default: "", help: "Shown in the server list. Empty — the name of the server in the panel." },
      { key: "description", label: "Description", type: "text", default: "" },
      MAX_PLAYERS(50, 500),
      { key: "worldSize", label: "Map size", type: "number", default: 3500, min: 1000, max: 6000, help: "1000–6000. Bigger maps need more memory: 3500 needs about 8 GB." },
      { key: "seed", label: "Map seed", type: "number", default: 12345, min: 1, max: 2147483647 },
      { key: "levelUrl", label: "Custom map URL", type: "text", default: "", help: "Direct link to a .map file. When set, size and seed are ignored." },
    ],
    ports: () => [
      { offset: 0, protocol: "udp", purpose: "game" },
      { offset: 1, protocol: "udp", purpose: "query (server list)" },
      { offset: 2, protocol: "tcp", purpose: "RCON (WebSocket)" },
    ],
    modsFolder: (v) => (v === "oxide" ? "oxide/plugins" : null),
  },
  ark: {
    label: "ARK: Survival Evolved",
    defaultPort: 7777,
    recommended: { ramGb: 8, diskGb: 30, cpuPercent: 50 },
    connect: "In Steam: View → Game Servers → Favorites → Add a server → {query}. Then join from the ARK server list.",
    queryOffset: 2,
    variants: [{ id: "vanilla", label: "ARK: Survival Evolved", description: "Official dedicated server; Steam Workshop mods by ID." }],
    fields: [
      { key: "sessionName", label: "Server name", type: "text", default: "", help: "Shown in the server list. Empty — the name of the server in the panel." },
      {
        key: "map",
        label: "Map",
        type: "select",
        default: "TheIsland",
        options: ["TheIsland", "TheCenter", "ScorchedEarth_P", "Ragnarok", "Aberration_P", "Extinction", "Valguero_P", "Genesis", "CrystalIsles", "Gen2", "LostIsland", "Fjordur"].map((m) => ({ value: m, label: m })),
      },
      MAX_PLAYERS(20, 200),
      { key: "password", label: "Join password", type: "text", default: "", help: "Leave empty for an open server." },
      { key: "modIds", label: "Workshop mod IDs", type: "text", default: "", help: "Comma-separated Steam Workshop IDs, for example 731604991,889745138." },
      { key: "crossplay", label: "Epic Games crossplay", type: "boolean", default: false },
      { key: "battleye", label: "BattlEye anti-cheat", type: "boolean", default: true },
    ],
    ports: () => [
      { offset: 0, protocol: "udp", purpose: "game" },
      { offset: 1, protocol: "udp", purpose: "raw UDP (game +1)" },
      { offset: 2, protocol: "udp", purpose: "query (server list)" },
      { offset: 3, protocol: "tcp", purpose: "RCON" },
    ],
    modsFolder: () => null,
  },
  valheim: {
    label: "Valheim",
    defaultPort: 2456,
    recommended: { ramGb: 4, diskGb: 5, cpuPercent: 50 },
    connect: "In Valheim: Start game → Join game → Add server → {address}. Or in Steam: View → Game Servers → Favorites → Add a server → {query}.",
    queryOffset: 1,
    variants: [
      { id: "vanilla", label: "Vanilla", description: "Valheim without mods." },
      { id: "bepinex", label: "BepInEx", description: "Mod loader for most Valheim mods (Thunderstore). Put mods into bepinex/plugins." },
      { id: "valheimplus", label: "Valheim Plus", description: "Popular all-in-one mod with its own config." },
    ],
    fields: [
      { key: "serverName", label: "Server name", type: "text", default: "", help: "Shown in the server list. Empty — the name of the server in the panel." },
      { key: "worldName", label: "World name", type: "text", default: "Dedicated" },
      { key: "password", label: "Join password", type: "text", default: "", minLength: 5, help: "Required by Valheim, at least 5 characters. Must not contain the server name." },
      { key: "public", label: "Show in the server list", type: "boolean", default: true },
      { key: "crossplay", label: "Crossplay (Xbox / Game Pass)", type: "boolean", default: false },
      { key: "admins", label: "Admin Steam IDs", type: "text", default: "", help: "SteamID64 of admins, separated by spaces." },
    ],
    ports: () => [
      { offset: 0, protocol: "udp", purpose: "game" },
      { offset: 1, protocol: "udp", purpose: "query (server list)" },
      { offset: 2, protocol: "udp", purpose: "crossplay and mod RPC" },
    ],
    modsFolder: (v) => (v === "bepinex" ? "bepinex/plugins" : v === "valheimplus" ? "valheimplus/plugins" : null),
  },
  terraria: {
    label: "Terraria",
    defaultPort: 7777,
    recommended: { ramGb: 2, diskGb: 2, cpuPercent: 25 },
    connect: "In Terraria: Multiplayer → Join via IP → enter the address and port.",
    variants: [
      { id: "vanilla", label: "Vanilla", description: "The official Terraria server." },
      { id: "tshock", label: "TShock", description: "Server mod with permissions, anti-grief and plugins. Plugins go into ServerPlugins." },
    ],
    fields: [
      { key: "worldName", label: "World name", type: "text", default: "world", help: "File name of the world. A new name creates a new world; the old one stays in the files." },
      {
        key: "worldSize",
        label: "World size",
        type: "select",
        default: "2",
        options: [
          { value: "1", label: "Small" },
          { value: "2", label: "Medium" },
          { value: "3", label: "Large" },
        ],
        help: "Used when the world is created. An existing world keeps its size.",
      },
      { key: "seed", label: "World seed", type: "text", default: "", help: "Optional. Used only when the world is created." },
      MAX_PLAYERS(8, 255),
      { key: "password", label: "Join password", type: "text", default: "" },
      { key: "motd", label: "Message of the day", type: "text", default: "" },
    ],
    ports: () => [
      { offset: 0, protocol: "tcp", purpose: "game" },
      { offset: 0, protocol: "udp", purpose: "game" },
    ],
    modsFolder: (v) => (v === "tshock" ? "ServerPlugins" : null),
  },
  gmod: {
    label: "Garry's Mod",
    defaultPort: 27015,
    recommended: { ramGb: 3, diskGb: 15, cpuPercent: 50 },
    connect: "Open the game console (~) and type: connect {address}",
    steamConnect: true,
    variants: [
      { id: "sandbox", label: "Sandbox", description: "Classic Garry's Mod building." },
      { id: "terrortown", label: "Trouble in Terrorist Town", description: "Built-in TTT game mode; needs TTT maps (ttt_*)." },
      { id: "custom", label: "Other game mode", description: "DarkRP, Murder and others: put the game mode into gamemodes or use a Workshop collection." },
    ],
    fields: [
      { key: "hostname", label: "Server name", type: "text", default: "", help: "Shown in the server list. Empty — the name of the server in the panel." },
      { key: "gamemode", label: "Game mode folder", type: "text", default: "darkrp", variants: ["custom"], help: "Folder name in garrysmod/gamemodes, for example darkrp." },
      { key: "map", label: "Start map", type: "text", default: "gm_construct", help: "For TTT use a ttt_ map, for example ttt_minecraft_b5 from the Workshop." },
      MAX_PLAYERS(16, 128),
      { key: "password", label: "Join password", type: "text", default: "" },
      { key: "workshopCollection", label: "Workshop collection ID", type: "text", default: "", help: "Numbers from the collection URL; players download its content when they join." },
      { key: "gslt", label: "Steam game server token (GSLT)", type: "password", default: "", secret: true, help: "Needed to show the server in the public list. Create one for app 4000." },
    ],
    ports: () => [
      { offset: 0, protocol: "udp", purpose: "game" },
      { offset: 0, protocol: "tcp", purpose: "RCON" },
    ],
    modsFolder: () => "addons",
  },
};

export type ProfiledGame = keyof typeof GAME_PROFILES;

export const isProfiledGame = (gameType: string): gameType is ProfiledGame => gameType in GAME_PROFILES;

export interface GameSettings {
  variant: string;
  values: Record<string, string | number | boolean>;
}

/** Настройки с подставленными значениями по умолчанию. */
export function resolveGameSettings(gameType: ProfiledGame, stored: Partial<GameSettings> | null | undefined): GameSettings {
  const profile = GAME_PROFILES[gameType];
  const variant = profile.variants.some((v) => v.id === stored?.variant) ? stored!.variant! : profile.variants[0].id;
  const values: GameSettings["values"] = {};
  for (const field of profile.fields) {
    const value = stored?.values?.[field.key];
    values[field.key] = value === undefined || value === null ? field.default : value;
  }
  return { variant, values };
}

/** Проверяет и приводит настройки к типам профиля. Возвращает текст ошибки или нормализованные настройки. */
export function validateGameSettings(gameType: ProfiledGame, input: Partial<GameSettings>): { error: string } | { settings: GameSettings } {
  const profile = GAME_PROFILES[gameType];
  const settings = resolveGameSettings(gameType, input);
  for (const field of profile.fields) {
    if (field.variants && !field.variants.includes(settings.variant)) continue;
    let value = settings.values[field.key];
    if (field.type === "number") {
      value = Number(value);
      if (!Number.isFinite(value) || !Number.isInteger(value)) return { error: `${field.label}: enter a whole number` };
      if (field.min !== undefined && value < field.min) return { error: `${field.label}: at least ${field.min}` };
      if (field.max !== undefined && value > field.max) return { error: `${field.label}: at most ${field.max}` };
    } else if (field.type === "boolean") {
      value = value === true || value === "true";
    } else {
      value = String(value ?? "").trim();
      if (value.length > 300) return { error: `${field.label}: too long` };
      if (/[\r\n"`\\]/.test(value)) return { error: `${field.label}: quotes, backslashes and line breaks are not allowed` };
      if (field.type === "select" && field.options && !field.options.some((o) => o.value === value)) return { error: `${field.label}: choose a value from the list` };
      if (field.minLength && value.length < field.minLength) return { error: `${field.label}: at least ${field.minLength} characters` };
    }
    settings.values[field.key] = value;
  }
  if (gameType === "valheim") {
    const name = String(settings.values.serverName ?? "").toLowerCase();
    if (name && String(settings.values.password).toLowerCase().includes(name)) return { error: "Join password: Valheim does not allow the server name inside the password" };
  }
  return { settings };
}
