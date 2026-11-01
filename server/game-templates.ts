import type { Server, Node } from "@shared/schema";
import { findRuntime } from "@shared/runtimes";
import { GAME_PROFILES, resolveGameSettings, type ProfiledGame } from "@shared/game-profiles";

export interface StartupSettings {
  /** Среда для серверов типа custom (каталог shared/runtimes.ts); без неё — Java. */
  runtime?: string;
  dockerImage?: string;
  serverType?: string;
  version?: string;
  jarFile?: string;
  javaVersion?: string;
  garbageCollector?: string;
  timeZone?: string;
  memoryPercent?: number;
  minMemory?: string;
  additionalArgs?: string;
  startupCommand?: string;
}

/** Переменная окружения сервера. secret — значение не показывается в интерфейсе и API после сохранения. */
export interface EnvVar {
  key: string;
  value: string;
  secret?: boolean;
}

export const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

/** Переменные, которые панель задаёт сама: их нельзя переопределить, иначе сломается запуск. */
export const RESERVED_ENV_KEYS = new Set(["SERVER_PORT", "EULA", "MEMORY", "INIT_MEMORY", "CREATE_CONSOLE_IN_PIPE", "ENABLE_RCON", "RCON_PASSWORD", "RCON_PORT", "DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD", "DATABASE_URL"]);

export function getEnvVars(server: Server): EnvVar[] {
  const vars = (server.config as Record<string, any> | null)?.envVars;
  return Array.isArray(vars) ? vars.filter((v) => v && typeof v.key === "string" && typeof v.value === "string") : [];
}

/** Автоперезапуск при падении: сколько раз Docker поднимает упавший сервер подряд. */
export interface CrashRestart {
  enabled: boolean;
  maxAttempts: number;
}

export function getCrashRestart(server: Server): CrashRestart {
  const value = (server.config as Record<string, any> | null)?.crashRestart;
  const attempts = Number(value?.maxAttempts);
  return { enabled: Boolean(value?.enabled), maxAttempts: Number.isInteger(attempts) && attempts >= 1 && attempts <= 20 ? attempts : 3 };
}

export interface PortSpec {
  port: number;
  protocol: "tcp" | "udp";
}

export interface GameContainerSpec {
  image: string;
  dataDir: string;
  /** UID владельца файлов в томе (для SFTP и файлового менеджера). */
  dataUid: number;
  env: string[];
  cmd?: string[];
  entrypoint?: string[];
  workingDir?: string;
  ports: PortSpec[];
}

export function getStartupSettings(server: Server): StartupSettings {
  const config = (server.config as Record<string, any>) || {};
  return (config.startupSettings as StartupSettings) || {};
}

const JAVA_TAGS: Record<string, string> = {
  "Java 8": "java8",
  "Java 11": "java11",
  "Java 17": "java17",
  "Java 21": "java21",
  "Java 25": "java25",
};

const TEMURIN_TAGS: Record<string, string> = {
  "Java 8": "8-jre",
  "Java 11": "11-jre",
  "Java 17": "17-jre",
  "Java 21": "21-jre",
  "Java 25": "25-jre",
};

/**
 * Версия Java, которую требует версия Minecraft: 26.x и новее — Java 25, 1.20.5–1.21.x — Java 21,
 * 1.17–1.20.4 — Java 17, более старые (и моды под них) — Java 8. LATEST/SNAPSHOT — самая новая.
 */
export function javaForMinecraft(version?: string): string {
  const v = (version || "LATEST").trim().toUpperCase();
  const match = v.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return "Java 25";
  const [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3] || 0)];
  if (major > 1) return "Java 25";
  if (minor > 20 || (minor === 20 && patch >= 5)) return "Java 21";
  if (minor >= 17) return "Java 17";
  return "Java 8";
}

function splitArgs(value?: string): string[] {
  return (value || "").trim().split(/\s+/).filter(Boolean);
}

/** Максимальный heap JVM в мегабайтах с учётом процента от лимита RAM контейнера (ramLimit — в ГБ). */
export function jvmMaxMemoryMb(server: Server, settings: StartupSettings): number {
  const percent = Math.min(Math.max(Number(settings.memoryPercent) || 85, 10), 100);
  return Math.max(256, Math.floor((server.ramLimit * 1024 * percent) / 100));
}

function both(port: number): PortSpec[] {
  return [
    { port, protocol: "tcp" },
    { port, protocol: "udp" },
  ];
}

const text = (value: unknown) => String(value ?? "").trim();

/** Порты контейнера по профилю игры (смещения от основного порта сервера). */
function portsFromProfile(gameType: ProfiledGame, variant: string, base: number): PortSpec[] {
  return GAME_PROFILES[gameType].ports(variant).map((p) => ({ port: base + p.offset, protocol: p.protocol }));
}

/**
 * Описание Docker-контейнера для каждого типа игры. Образ можно переопределить в настройках запуска.
 */
export function buildGameSpec(server: Server): GameContainerSpec {
  const s = getStartupSettings(server);
  const tz = s.timeZone || "UTC";
  const extraArgs = splitArgs(s.additionalArgs);
  const port = server.port;
  let spec: GameContainerSpec;
  const game = (type: ProfiledGame) => resolveGameSettings(type, (server.config as Record<string, any> | null)?.gameSettings);
  const gamePorts = (type: ProfiledGame, variant: string) => portsFromProfile(type, variant, port);
  const rcon = text((server.config as Record<string, any> | null)?.rconPassword);

  switch (server.gameType) {
    case "minecraft": {
      const java = JAVA_TAGS[s.javaVersion || ""] ? s.javaVersion! : javaForMinecraft(s.version);
      const javaTag = JAVA_TAGS[java];
      const serverType = (s.serverType || "VANILLA").toUpperCase();
      const env = [
        "EULA=TRUE",
        `TYPE=${serverType}`,
        `VERSION=${s.version || "LATEST"}`,
        `MEMORY=${jvmMaxMemoryMb(server, s)}M`,
        `INIT_MEMORY=${s.minMemory || "512M"}`,
        `SERVER_PORT=${port}`,
        `TZ=${tz}`,
        "CREATE_CONSOLE_IN_PIPE=true",
      ];
      const rconPassword = (server.config as Record<string, any> | null)?.rconPassword;
      env.push(...(typeof rconPassword === "string" && rconPassword ? ["ENABLE_RCON=true", `RCON_PASSWORD=${rconPassword}`, "RCON_PORT=25575"] : ["ENABLE_RCON=false"]));
      if (s.garbageCollector) env.push(`JVM_XX_OPTS=-XX:+${s.garbageCollector.replace(/^-?XX:\+?/, "")}`);
      if (extraArgs.length) env.push(`JVM_OPTS=${extraArgs.join(" ")}`);
      if (serverType === "CUSTOM") env.push(`CUSTOM_SERVER=/data/${s.jarFile || "server.jar"}`);
      spec = {
        image: `itzg/minecraft-server:${javaTag}`,
        dataDir: "/data",
        dataUid: 1000,
        env,
        ports: [{ port, protocol: "tcp" }],
      };
      break;
    }
    case "csgo": {
      const g = game("csgo");
      const MODES: Record<string, [number, number]> = { casual: [0, 0], competitive: [0, 1], wingman: [0, 2], armsrace: [1, 0], deathmatch: [1, 2] };
      const [gameType, gameMode] = MODES[String(g.values.mode)] ?? MODES.competitive;
      spec = {
        image: "joedwards32/cs2:latest",
        dataDir: "/home/steam/cs2-dedicated",
        dataUid: 1000,
        env: [
          `CS2_PORT=${port}`,
          `CS2_SERVERNAME=${text(g.values.hostname) || server.name}`,
          `CS2_PW=${text(g.values.password)}`,
          `CS2_RCONPW=${rcon}`,
          `CS2_MAXPLAYERS=${g.values.maxPlayers}`,
          `CS2_STARTMAP=${g.values.map}`,
          "CS2_GAMEALIAS=",
          `CS2_GAMETYPE=${gameType}`,
          `CS2_GAMEMODE=${gameMode}`,
          `SRCDS_TOKEN=${text(g.values.gslt)}`,
          "CS2_LAN=0",
          `TZ=${tz}`,
          ...(extraArgs.length ? [`CS2_ADDITIONAL_ARGS=${extraArgs.join(" ")}`] : []),
        ],
        ports: gamePorts("csgo", g.variant),
      };
      break;
    }
    case "rust": {
      const g = game("rust");
      spec = {
        image: "didstopia/rust-server:latest",
        dataDir: "/steamcmd/rust",
        dataUid: 0,
        env: [
          `RUST_SERVER_PORT=${port}`,
          `RUST_SERVER_QUERYPORT=${port + 1}`,
          "RUST_RCON_WEB=1",
          `RUST_RCON_PORT=${port + 2}`,
          `RUST_RCON_PASSWORD=${rcon}`,
          `RUST_SERVER_NAME=${text(g.values.hostname) || server.name}`,
          `RUST_SERVER_DESCRIPTION=${text(g.values.description)}`,
          `RUST_SERVER_MAXPLAYERS=${g.values.maxPlayers}`,
          `RUST_SERVER_WORLDSIZE=${g.values.worldSize}`,
          `RUST_SERVER_SEED=${g.values.seed}`,
          ...(text(g.values.levelUrl) ? [`RUST_SERVER_LEVELURL=${text(g.values.levelUrl)}`] : []),
          `RUST_OXIDE_ENABLED=${g.variant === "oxide" ? 1 : 0}`,
          `TZ=${tz}`,
          ...(extraArgs.length ? [`RUST_SERVER_STARTUP_ARGUMENTS=-batchmode -load -nographics +server.secure 1 ${extraArgs.join(" ")}`] : []),
        ],
        ports: gamePorts("rust", g.variant),
      };
      break;
    }
    case "ark": {
      const g = game("ark");
      spec = {
        image: "hermsi/ark-server:latest",
        dataDir: "/app",
        dataUid: 1000,
        env: [
          `GAME_CLIENT_PORT=${port}`,
          `UDP_SOCKET_PORT=${port + 1}`,
          `SERVER_LIST_PORT=${port + 2}`,
          `RCON_PORT=${port + 3}`,
          `SESSION_NAME=${text(g.values.sessionName) || server.name}`,
          `SERVER_MAP=${g.values.map}`,
          `SERVER_PASSWORD=${text(g.values.password)}`,
          `ADMIN_PASSWORD=${rcon}`,
          `MAX_PLAYERS=${g.values.maxPlayers}`,
          ...(text(g.values.modIds) ? [`GAME_MOD_IDS=${text(g.values.modIds).replace(/\s+/g, "")}`] : []),
          `ENABLE_CROSSPLAY=${g.values.crossplay ? "true" : "false"}`,
          `DISABLE_BATTLEYE=${g.values.battleye ? "false" : "true"}`,
          `TZ=${tz}`,
        ],
        ports: gamePorts("ark", g.variant),
      };
      break;
    }
    case "valheim": {
      const g = game("valheim");
      spec = {
        image: "lloesche/valheim-server:latest",
        dataDir: "/config",
        dataUid: 0,
        env: [
          `SERVER_PORT=${port}`,
          `SERVER_NAME=${text(g.values.serverName) || server.name}`,
          `WORLD_NAME=${text(g.values.worldName) || "Dedicated"}`,
          `SERVER_PASS=${text(g.values.password)}`,
          `SERVER_PUBLIC=${g.values.public ? "true" : "false"}`,
          `CROSSPLAY=${g.values.crossplay ? "true" : "false"}`,
          ...(text(g.values.admins) ? [`ADMINLIST_IDS=${text(g.values.admins)}`] : []),
          `BEPINEX=${g.variant === "bepinex" ? "true" : "false"}`,
          `VALHEIM_PLUS=${g.variant === "valheimplus" ? "true" : "false"}`,
          `TZ=${tz}`,
          ...(extraArgs.length ? [`SERVER_ARGS=${extraArgs.join(" ")}`] : []),
        ],
        ports: gamePorts("valheim", g.variant),
      };
      break;
    }
    case "terraria": {
      const g = game("terraria");
      const worldDir = "/root/.local/share/Terraria/Worlds";
      const worldName = text(g.values.worldName).replace(/\s+/g, "_").replace(/[^\w-]/g, "") || "world";
      spec = {
        image: g.variant === "tshock" ? "ryshe/terraria:latest" : "ryshe/terraria:vanilla-latest",
        dataDir: worldDir,
        dataUid: 0,
        env: [`TZ=${tz}`],
        cmd: [
          "-port", String(port),
          "-maxplayers", String(g.values.maxPlayers),
          "-world", `${worldDir}/${worldName}.wld`,
          "-autocreate", String(g.values.worldSize),
          "-worldname", worldName,
          ...(text(g.values.seed) ? ["-seed", text(g.values.seed)] : []),
          ...(text(g.values.password) ? ["-password", text(g.values.password)] : []),
          ...(text(g.values.motd) ? ["-motd", text(g.values.motd)] : []),
          ...extraArgs,
        ],
        ports: gamePorts("terraria", g.variant),
      };
      break;
    }
    case "gmod": {
      const g = game("gmod");
      const gamemode = g.variant === "custom" ? text(g.values.gamemode) || "sandbox" : g.variant;
      const args = [
        `+rcon_password ${rcon}`,
        ...(text(g.values.password) ? [`+sv_password ${text(g.values.password)}`] : []),
        ...(text(g.values.workshopCollection) ? [`+host_workshop_collection ${text(g.values.workshopCollection)}`] : []),
        ...extraArgs,
      ];
      spec = {
        image: "ceifa/garrysmod:latest",
        dataDir: "/home/gmod/server/garrysmod",
        dataUid: 1000,
        env: [
          `PORT=${port}`,
          `NAME=${text(g.values.hostname) || server.name}`,
          `MAXPLAYERS=${g.values.maxPlayers}`,
          `MAP=${text(g.values.map) || "gm_construct"}`,
          `GAMEMODE=${gamemode}`,
          ...(text(g.values.gslt) ? [`GSLT=${text(g.values.gslt)}`] : []),
          `ARGS=${args.join(" ")}`,
          `TZ=${tz}`,
        ],
        ports: gamePorts("gmod", g.variant),
      };
      break;
    }
    default: {
      const runtime = findRuntime(s.runtime);
      if (s.runtime === "image") {
        spec = {
          image: s.dockerImage?.trim() || "alpine:3.20",
          dataDir: "/data",
          dataUid: 0,
          env: [`TZ=${tz}`, `SERVER_PORT=${port}`],
          ports: both(port),
        };
        break;
      }
      if (runtime && runtime.id !== "java") {
        spec = {
          image: runtime.versions[0].image,
          dataDir: "/data",
          dataUid: 0,
          env: [`TZ=${tz}`, `SERVER_PORT=${port}`],
          workingDir: "/data",
          entrypoint: ["/bin/sh", "-c"],
          cmd: [runtime.defaultCommand || "sh start.sh"],
          ports: both(port),
        };
        break;
      }
      const javaNumber = s.javaVersion?.match(/^Java (\d+)$/)?.[1];
      const tag = javaNumber ? `${javaNumber}-jre` : s.version ? TEMURIN_TAGS[javaForMinecraft(s.version)] : "21-jre";
      const memory = jvmMaxMemoryMb(server, s);
      const gc = s.garbageCollector ? [`-XX:+${s.garbageCollector.replace(/^-?XX:\+?/, "")}`] : [];
      spec = {
        image: `eclipse-temurin:${tag}`,
        dataDir: "/data",
        dataUid: 0,
        env: [`TZ=${tz}`, `SERVER_PORT=${port}`, `SERVER_MEMORY=${memory}`],
        workingDir: "/data",
        cmd: [
          "java",
          `-Xms${s.minMemory || "128M"}`,
          `-Xmx${memory}M`,
          ...gc,
          `-Duser.timezone=${tz}`,
          "-Dfile.encoding=UTF-8",
          ...extraArgs,
          "-jar",
          s.jarFile || "server.jar",
          "nogui",
        ],
        ports: both(port),
      };
    }
  }

  if (s.dockerImage && s.dockerImage.trim()) {
    spec.image = s.dockerImage.trim();
  }

  for (const variable of getEnvVars(server)) {
    if (!ENV_KEY_PATTERN.test(variable.key) || RESERVED_ENV_KEYS.has(variable.key)) continue;
    spec.env = spec.env.filter((entry) => !entry.startsWith(`${variable.key}=`));
    spec.env.push(`${variable.key}=${variable.value}`);
  }

  if (s.startupCommand && s.startupCommand.trim()) {
    spec.entrypoint = ["/bin/sh", "-c"];
    spec.cmd = [s.startupCommand.trim()];
    spec.workingDir = spec.workingDir || spec.dataDir;
  }

  return spec;
}

/** NanoCPUs из процента от всех ядер ноды. */
export function nanoCpusFor(server: Server, node: Node): number {
  const cores = Math.max(node.cpuCores || 1, 1);
  const percent = Math.min(Math.max(server.cpuLimit || 100, 1), 100);
  return Math.max(Math.floor((percent / 100) * cores * 1e9), 1e8);
}
