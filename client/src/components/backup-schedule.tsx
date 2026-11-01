import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface BackupSchedule {
  enabled: boolean;
  cron: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
  keep: number | null;
}

const PRESETS: { value: string; label: string; cron?: string }[] = [
  { value: "off", label: "No automatic backups" },
  { value: "6h", label: "Every 6 hours", cron: "0 */6 * * *" },
  { value: "daily", label: "Every day at 04:00", cron: "0 4 * * *" },
  { value: "weekly", label: "Every Sunday at 04:00", cron: "0 4 * * 0" },
  { value: "custom", label: "Custom schedule (cron)" },
];

/** Автоматические бэкапы одного сервера; задача хранится в общем планировщике панели. */
export function BackupScheduleCard({ serverId, canManage }: { serverId: string; canManage: boolean }) {
  const { toast } = useToast();
  const queryKey = ["/api/servers", serverId, "backup-schedule"];
  const { data } = useQuery<BackupSchedule>({ queryKey });
  const [preset, setPreset] = useState("off");
  const [cron, setCron] = useState("0 4 * * *");

  useEffect(() => {
    if (!data) return;
    if (!data.enabled || !data.cron) return setPreset("off");
    const match = PRESETS.find((p) => p.cron === data.cron);
    setPreset(match?.value ?? "custom");
    setCron(data.cron);
  }, [data]);

  const save = useMutation({
    mutationFn: async (input: { enabled: boolean; cron: string }) => (await apiRequest("PUT", `/api/servers/${serverId}/backup-schedule`, input)).json(),
    onSuccess: (next: BackupSchedule) => {
      queryClient.setQueryData(queryKey, next);
      toast({ title: next.enabled ? "Backup schedule saved" : "Automatic backups turned off" });
    },
    onError: (error: any) => toast({ title: "Schedule not saved", description: error.message, variant: "destructive" }),
  });

  if (!data) return null;
  const chosen = PRESETS.find((p) => p.value === preset);
  const nextCron = preset === "custom" ? cron.trim() : chosen?.cron ?? data.cron ?? "0 4 * * *";
  const changed = preset === "off" ? data.enabled : !data.enabled || nextCron !== data.cron;

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1 space-y-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <CalendarClock className="h-4 w-4 text-muted-foreground" /> Automatic backups
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={preset} onValueChange={setPreset} disabled={!canManage}>
            <SelectTrigger className="sm:w-60" aria-label="Backup schedule">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {preset === "custom" && (
            <Input value={cron} onChange={(e) => setCron(e.target.value)} placeholder="minute hour day month weekday" className="font-mono sm:w-52" aria-label="Cron expression" disabled={!canManage} />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {data.enabled && data.nextRunAt ? `Next backup ${new Date(data.nextRunAt).toLocaleString()}. ` : ""}
          {data.lastError ? `Last run failed: ${data.lastError}. ` : data.lastRunAt ? `Last run ${new Date(data.lastRunAt).toLocaleString()}. ` : ""}
          {data.keep ? `The oldest backups are deleted to keep ${data.keep}.` : "All backups are kept until you delete them."}
        </p>
      </div>
      {canManage && (
        <Button
          variant="outline"
          disabled={!changed || save.isPending || (preset === "custom" && cron.trim().split(/\s+/).length !== 5)}
          onClick={() => save.mutate({ enabled: preset !== "off", cron: nextCron })}
        >
          Save schedule
        </Button>
      )}
    </div>
  );
}
