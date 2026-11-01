import type { ComponentType, ReactNode } from "react";
import { Link } from "wouter";
import { Bot, Crosshair, Gamepad2, Globe, Hammer, Package, Palette, Server, Sword, TreePine } from "lucide-react";
import type { Server as ServerType } from "@shared/schema";
import { GAME_PROFILES, isProfiledGame, resolveGameSettings } from "@shared/game-profiles";
import { findRuntime } from "@shared/runtimes";
import { StatusLed } from "@/components/status-badge";
import { cn } from "@/lib/utils";

export type UnitStatus = "running" | "starting" | "stopped" | "error";

export interface BoardUnit {
  id: string;
  name: string;
  kind: string;
  port: number;
  status: UnitStatus;
  icon: ComponentType<{ className?: string }>;
  /** Нагрузка CPU за последний час (точки по 5 минут), пусто — нет данных. */
  load: number[];
  href?: string;
}

const COLOR: Record<UnitStatus, string> = {
  running: "hsl(157 57% 46%)",
  starting: "hsl(40 90% 55%)",
  stopped: "hsl(215 11% 45%)",
  error: "hsl(0 72% 58%)",
};

/** График нагрузки: линия с заливкой; без данных — ровная линия у нуля. */
function Sparkline({ points, color }: { points: number[]; color: string }) {
  const w = 72;
  const h = 22;
  const values = points.length > 1 ? points : [0, 0];
  const top = Math.max(100, ...values);
  const step = w / (values.length - 1);
  const line = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / top) * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="hidden shrink-0 sm:block" aria-hidden="true">
      {points.length > 1 && <polygon points={`0,${h} ${line} ${w},${h}`} fill={color} opacity={0.14} />}
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" opacity={points.length > 1 ? 1 : 0.45} />
    </svg>
  );
}

/**
 * Нода как «стойка»: заголовок с числом серверов в сети, строки серверов с состоянием, типом,
 * графиком нагрузки и портом, внизу — нагрузка самой ноды. Цвета берутся из темы панели.
 */
export function NodeBoard({
  title,
  subtitle,
  units,
  footer,
  emptyText = "No servers on this node yet.",
  className,
}: {
  title: string;
  subtitle?: string;
  units: BoardUnit[];
  footer?: ReactNode;
  emptyText?: string;
  className?: string;
}) {
  const online = units.filter((u) => u.status === "running").length;
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card text-card-foreground", className)}>
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted">
          <Server className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title}</p>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <StatusLed status={online > 0 ? "running" : "stopped"} />
          {`${online} / ${units.length} online`}
        </span>
      </div>
      {units.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="divide-y">
          {units.map((unit) => {
            const Icon = unit.icon;
            const row = (
              <>
                <StatusLed status={unit.status} />
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[13px]">{unit.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{unit.kind}</p>
                </div>
                <Sparkline points={unit.load} color={COLOR[unit.status]} />
                <span className="w-14 text-right font-mono text-xs tabular-nums text-muted-foreground">:{unit.port}</span>
              </>
            );
            return (
              <li key={unit.id}>
                {unit.href ? (
                  <Link href={unit.href} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40">
                    {row}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-2.5">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {footer && <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t bg-muted/30 px-4 py-2.5 font-mono text-[11px] text-muted-foreground">{footer}</div>}
    </div>
  );
}

const GAME_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  minecraft: Gamepad2,
  csgo: Crosshair,
  rust: Hammer,
  ark: TreePine,
  valheim: Sword,
  terraria: Globe,
  gmod: Palette,
};

/** Сервер панели → строка стойки: тип с ядром или средой, иконка, состояние. */
export function serverToUnit(server: ServerType, load: number[] = []): BoardUnit {
  const config = (server.config as Record<string, any> | null) ?? {};
  const startup = config.startupSettings ?? {};
  let kind: string;
  let icon = GAME_ICONS[server.gameType] ?? Package;
  if (server.gameType === "minecraft") {
    const type = String(startup.serverType || "VANILLA");
    kind = `Minecraft · ${type.charAt(0)}${type.slice(1).toLowerCase()}${startup.version && startup.version !== "LATEST" ? ` ${startup.version}` : ""}`;
  } else if (isProfiledGame(server.gameType)) {
    const profile = GAME_PROFILES[server.gameType];
    const settings = resolveGameSettings(server.gameType, config.gameSettings);
    const variant = profile.variants.find((v) => v.id === settings.variant);
    kind = profile.variants.length > 1 && variant ? `${profile.label} · ${variant.label}` : profile.label;
  } else {
    const runtime = findRuntime(startup.runtime);
    kind = runtime?.name ?? (startup.dockerImage ? String(startup.dockerImage) : "Custom");
    if (runtime?.id === "python") icon = Bot;
  }
  const status: UnitStatus = server.status === "running" ? "running" : server.status === "error" ? "error" : server.status === "stopped" ? "stopped" : "starting";
  return { id: server.id, name: server.name, kind, port: server.port, status, icon, load, href: `/servers/${server.id}` };
}
