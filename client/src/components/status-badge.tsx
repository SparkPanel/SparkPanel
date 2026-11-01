import { cn } from "@/lib/utils";

export type Status = "running" | "stopped" | "starting" | "stopping" | "error" | "online" | "offline";

/** Цвет «светодиода», подпись и пульсация для каждого состояния сервера или ноды. */
export const STATUS_META: Record<Status, { label: string; color: string; pulse?: boolean; tone: string }> = {
  running: { label: "Running", color: "hsl(var(--primary))", tone: "text-primary" },
  online: { label: "Online", color: "hsl(var(--primary))", tone: "text-primary" },
  starting: { label: "Starting", color: "hsl(var(--warning))", pulse: true, tone: "text-warning" },
  stopping: { label: "Stopping", color: "hsl(var(--warning))", pulse: true, tone: "text-warning" },
  error: { label: "Error", color: "hsl(var(--destructive))", tone: "text-destructive" },
  stopped: { label: "Stopped", color: "hsl(var(--muted-foreground) / 0.55)", tone: "text-muted-foreground" },
  offline: { label: "Offline", color: "hsl(var(--muted-foreground) / 0.55)", tone: "text-muted-foreground" },
};

const metaOf = (status: string) => STATUS_META[status as Status] ?? STATUS_META.stopped;

/** Только светодиод — для плотных списков. */
export function StatusLed({ status, className }: { status: string; className?: string }) {
  const meta = metaOf(status);
  return (
    <span
      className={cn("status-led", className)}
      style={{ ["--led" as string]: meta.color }}
      data-pulse={meta.pulse ? "true" : undefined}
      role="img"
      aria-label={meta.label}
    />
  );
}

/** Светодиод с подписью. */
export function StatusBadge({ status, className, hideLed }: { status: string; className?: string; hideLed?: boolean }) {
  const meta = metaOf(status);
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs font-medium", meta.tone, className)}>
      {!hideLed && <StatusLed status={status} />}
      {meta.label}
    </span>
  );
}
