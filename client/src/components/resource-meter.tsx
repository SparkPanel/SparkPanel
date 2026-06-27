import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface ResourceMeterProps {
  label: string;
  value: number;
  max: number;
  unit?: string;
  className?: string;
}

export function ResourceMeter({ label, value, max, unit = "GB", className }: ResourceMeterProps) {
  const percentage = max > 0 ? (value / max) * 100 : 0;
  const isHigh = percentage > 80;
  const isMedium = percentage > 60;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn(
          "font-medium",
          isHigh && "text-destructive",
          isMedium && !isHigh && "text-yellow-600 dark:text-yellow-500"
        )}>
          {value.toFixed(1)} / {max.toFixed(1)} {unit}
        </span>
      </div>
      <Progress
        value={percentage}
        className="h-2"
        indicatorClassName={cn(
          isHigh && "bg-destructive",
          isMedium && !isHigh && "bg-yellow-600 dark:bg-yellow-500"
        )}
      />
      <div className="text-xs text-muted-foreground text-right">
        {percentage.toFixed(1)}%
      </div>
    </div>
  );
}
