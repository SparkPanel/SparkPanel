import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Node } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Quota {
  maxServers: number;
  maxRamGb: number;
  maxCpuPercent: number;
  maxDiskGb: number;
  nodeIds: string[];
}
interface QuotaView {
  quota: Quota | null;
  usage: { servers: number; ramGb: number; cpuPercent: number; diskGb: number };
}

const DEFAULT_QUOTA: Quota = { maxServers: 1, maxRamGb: 2, maxCpuPercent: 100, maxDiskGb: 10, nodeIds: [] };

/** Квота пользователя: сколько серверов и ресурсов он может создать сам. */
export function QuotaDialog({ userId, username, open, onOpenChange }: { userId: string; username: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const queryKey = ["/api/users", userId, "quota"];
  const { data } = useQuery<QuotaView>({ queryKey, enabled: open });
  const { data: nodes = [] } = useQuery<Node[]>({ queryKey: ["/api/nodes"], enabled: open });
  const [form, setForm] = useState<Quota>(DEFAULT_QUOTA);

  useEffect(() => {
    if (data) setForm(data.quota ?? DEFAULT_QUOTA);
  }, [data]);

  const save = useMutation({
    mutationFn: async (quota: Quota | null) => (await apiRequest("PUT", `/api/users/${userId}/quota`, { quota })).json(),
    onSuccess: (next: QuotaView) => {
      queryClient.setQueryData(queryKey, next);
      onOpenChange(false);
      toast({ title: next.quota ? `${username} can create servers` : `${username} can no longer create servers` });
    },
    onError: (error: Error) => toast({ title: "Quota not saved", description: error.message, variant: "destructive" }),
  });

  const number = (key: keyof Omit<Quota, "nodeIds">, label: string, unit: string, used?: number) => (
    <div className="space-y-1.5">
      <label className="text-sm font-medium" htmlFor={`quota-${key}`}>
        {label}
      </label>
      <Input id={`quota-${key}`} type="number" min={0} value={form[key]} onChange={(e) => setForm({ ...form, [key]: Math.max(0, Number(e.target.value) || 0) })} />
      {used !== undefined && <p className="text-xs text-muted-foreground">{used} {unit} used now</p>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Server quota for {username}</DialogTitle>
          <DialogDescription>
            With a quota, {username} can create their own servers without other permissions. They own those servers and can share them; limits count all servers they own.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {number("maxServers", "Servers", "", data?.usage.servers)}
          {number("maxRamGb", "Memory, GB", "GB", data?.usage.ramGb)}
          {number("maxCpuPercent", "CPU, % in total", "%", data?.usage.cpuPercent)}
          {number("maxDiskGb", "Disk, GB", "GB", data?.usage.diskGb)}
        </div>
        {nodes.length > 1 && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Nodes (none selected — any node)</p>
            {nodes.map((node) => (
              <label key={node.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.nodeIds.includes(node.id)}
                  onCheckedChange={(on) => setForm({ ...form, nodeIds: on === true ? [...form.nodeIds, node.id] : form.nodeIds.filter((id) => id !== node.id) })}
                />
                {node.name}
              </label>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2">
          {data?.quota && (
            <Button variant="ghost" className="text-destructive" onClick={() => save.mutate(null)} disabled={save.isPending}>
              Remove quota
            </Button>
          )}
          <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
            Save quota
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
