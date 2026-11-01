import { useMemo, useState } from "react";

export interface ChartPoint {
  t: number;
  value: number;
}

/**
 * Площадной график истории нагрузки без сторонних библиотек: SVG растягивается по ширине,
 * при наведении показывает значение и время ближайшей точки.
 */
export function HistoryChart({
  points,
  max,
  unit,
  label,
  color = "hsl(var(--primary))",
  format = (v: number) => v.toFixed(1),
}: {
  points: ChartPoint[];
  /** Верх шкалы: лимит сервера или ёмкость ноды. */
  max: number;
  unit: string;
  label: string;
  color?: string;
  format?: (value: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = 140;
  const top = Math.max(max, ...points.map((p) => p.value), 0.001);

  const { line, area, xs } = useMemo(() => {
    if (points.length === 0) return { line: "", area: "", xs: [] as number[] };
    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    const span = Math.max(t1 - t0, 1);
    const xs = points.map((p) => (points.length === 1 ? W : ((p.t - t0) / span) * W));
    const ys = points.map((p) => H - (Math.min(p.value, top) / top) * (H - 4) - 2);
    const line = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
    return { line, area: `${line} L${xs[xs.length - 1].toFixed(1)},${H} L${xs[0].toFixed(1)},${H} Z`, xs };
  }, [points, top]);

  const current = hover !== null ? points[hover] : points[points.length - 1];
  const peak = points.reduce((m, p) => Math.max(m, p.value), 0);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        {current ? (
          <span className="tabular-nums">
            <span className="font-medium">
              {format(current.value)} {unit}
            </span>
            <span className="ml-2 text-xs text-muted-foreground">
              {new Date(current.t).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          </span>
        ) : null}
      </div>
      {points.length === 0 ? (
        <div className="flex h-[140px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
          No data for this period yet
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-[140px] w-full rounded-md bg-muted/40"
          role="img"
          aria-label={`${label}: peak ${format(peak)} ${unit}`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * W;
            let nearest = 0;
            xs.forEach((px, i) => {
              if (Math.abs(px - x) < Math.abs(xs[nearest] - x)) nearest = i;
            });
            setHover(nearest);
          }}
        >
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} stroke="hsl(var(--border))" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          <path d={area} fill={color} opacity={0.14} />
          <path d={line} fill="none" stroke={color} strokeWidth={1.75} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          {hover !== null && xs[hover] !== undefined && (
            <line x1={xs[hover]} x2={xs[hover]} y1={0} y2={H} stroke="hsl(var(--foreground))" strokeOpacity={0.35} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          )}
        </svg>
      )}
      <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
        <span>Peak {format(peak)} {unit}</span>
        <span>
          Scale up to {format(top)} {unit}
        </span>
      </div>
    </div>
  );
}
