import { cn } from "@/lib/utils";

interface ResourceMeterProps {
  label: string;
  value: number;
  max: number;
  unit?: string;
  className?: string;
}

/** Тонкая полоса загрузки: зелёная до 60%, жёлтая до 80%, красная выше. */
export function ResourceMeter({ label, value, max, unit = "GB", className }: ResourceMeterProps) {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const tone = percentage > 80 ? "bg-destructive" : percentage > 60 ? "bg-warning" : "bg-primary";
  const fmt = (n: number) => (n >= 100 || Number.isInteger(n) ? n.toFixed(0) : n.toFixed(1));

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          <span className="font-medium">{fmt(value)}</span>
          <span className="text-muted-foreground"> / {fmt(max)} {unit}</span>
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(percentage)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={cn("h-full rounded-full transition-[width] duration-500", tone)} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
