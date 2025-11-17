import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Status = "running" | "stopped" | "starting" | "stopping" | "error" | "online" | "offline";

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

const statusConfig: Record<Status, { label: string; className: string; dotClassName: string }> = {
  running: {
    label: "Running",
    className: "bg-primary/10 text-primary border-primary/20",
    dotClassName: "bg-primary",
  },
  stopped: {
    label: "Stopped",
    className: "bg-muted text-muted-foreground border-border",
    dotClassName: "bg-muted-foreground",
  },
  starting: {
    label: "Starting",
    className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-500 border-yellow-500/20",
    dotClassName: "bg-yellow-500",
  },
  stopping: {
    label: "Stopping",
    className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-500 border-yellow-500/20",
    dotClassName: "bg-yellow-500",
  },
  error: {
    label: "Error",
    className: "bg-destructive/10 text-destructive border-destructive/20",
    dotClassName: "bg-destructive",
  },
  online: {
    label: "Online",
    className: "bg-primary/10 text-primary border-primary/20",
    dotClassName: "bg-primary",
  },
  offline: {
    label: "Offline",
    className: "bg-muted text-muted-foreground border-border",
    dotClassName: "bg-muted-foreground",
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      <span className={cn("w-2 h-2 rounded-full mr-2", config.dotClassName)} />
      {config.label}
    </Badge>
  );
}
