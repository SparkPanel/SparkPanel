import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy as CopyIcon, Layers, RefreshCw, Trash2 } from "lucide-react";
import type { Node, Server } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusLed } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCan } from "@/lib/use-me";

interface Settings {
  autoscale: boolean;
  min: number;
  max: number;
  targetCpu: number;
  nodeIds: string[];
}

interface ScalingView {
  settings: Settings;
  replicas: { id: string; nodeId: string; nodeName: string; address: string; port: number; running: boolean; cpu: number | null }[];
  domains: string[];
  hasDatabase: boolean;
}

/** Масштабирование сайта: копии на нодах, балансировка трафика домена и автомасштабирование по CPU. */
export function ScalingTab({ server }: { server: Server }) {
  const { toast } = useToast();
  const can = useCan();
  const canManage = can("servers.manage");
  const queryKey = ["/api/servers", server.id, "scaling"];
  const { data, isLoading, error } = useQuery<ScalingView>({ queryKey, refetchInterval: 10000, retry: false });
  const { data: nodes = [] } = useQuery<Node[]>({ queryKey: ["/api/nodes"], enabled: can("nodes.view", "nodes.manage", "servers.manage") });
  const [form, setForm] = useState<Settings | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data && !dirty) setForm(data.settings);
  }, [data, dirty]);

  const onDone = (title: string) => (next: ScalingView) => {
    queryClient.setQueryData(queryKey, next);
    toast({ title });
  };
  const onError = (title: string) => (err: Error) => toast({ title, description: err.message, variant: "destructive" });

  const save = useMutation({
    mutationFn: async () => (await apiRequest("PUT", `/api/servers/${server.id}/scaling`, form)).json(),
    onSuccess: (next: ScalingView) => {
      setDirty(false);
      onDone("Scaling saved")(next);
    },
    onError: onError("Scaling not saved"),
  });
  const add = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/servers/${server.id}/scaling/replicas`, {})).json(),
    onSuccess: onDone("Copy added"),
    onError: onError("Copy not added"),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/servers/${server.id}/scaling/replicas/${id}`, {})).json(),
    onSuccess: onDone("Copy removed"),
    onError: onError("Copy not removed"),
  });
  const sync = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/servers/${server.id}/scaling/sync`, {})).json(),
    onSuccess: (r: { updated: number }) => toast({ title: "Copies updated", description: `Files copied to ${r.updated} copies one by one.` }),
    onError: onError("Copies not updated"),
  });

  if (isLoading) return <Skeleton className="h-64" />;
  if (error || !data || !form) return <EmptyState icon={Layers} title="Scaling is not available" description={(error as Error | null)?.message ?? "Try again in a moment."} />;

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setForm({ ...form, [key]: value });
    setDirty(true);
  };
  const total = data.replicas.length + 1;

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Run several copies of this site on one or more nodes. Each copy is the same container with the same files and settings; traffic of the site's domain is spread
        across all copies, and a copy that fails is taken out of rotation automatically.
        {data.hasDatabase ? " All copies use the server's database." : " If the site keeps data, create a database on the Database tab — all copies will share it."}
      </p>
      {data.domains.length === 0 && (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
          Add a domain on the Ports tab: the load balancer works through the domain. Without it, visitors reach only the main server.
        </p>
      )}

      <section className="space-y-3">
        <SectionHeader
          title={`Copies — ${total}`}
          description={data.domains.length ? `Balanced through ${data.domains.join(", ")}` : undefined}
          actions={
            canManage && (
              <div className="flex gap-2">
                {data.replicas.length > 0 && (
                  <Button size="sm" variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
                    <RefreshCw className={sync.isPending ? "animate-spin" : undefined} /> Update files in copies
                  </Button>
                )}
                <Button size="sm" onClick={() => add.mutate()} disabled={add.isPending}>
                  <CopyIcon /> {add.isPending ? "Adding…" : "Add copy"}
                </Button>
              </div>
            )
          }
        />
        <ul className="divide-y rounded-lg border bg-card">
          <li className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
            <StatusLed status={server.status} />
            <span className="font-medium">Main server</span>
            <span className="text-muted-foreground">{`port ${server.port}`}</span>
          </li>
          {data.replicas.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
              <StatusLed status={r.running ? "running" : "stopped"} />
              <span className="font-medium">{`Copy ${r.id.split("-r").pop()}`}</span>
              <span className="text-muted-foreground">{r.nodeName}</span>
              <span className="font-mono text-xs text-muted-foreground" translate="no">
                {r.address}
              </span>
              <span className="ml-auto tabular-nums text-muted-foreground">{r.cpu === null ? "—" : `CPU ${r.cpu}%`}</span>
              {canManage && (
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" disabled={remove.isPending} onClick={() => remove.mutate(r.id)} aria-label={`Remove copy ${r.id}`}>
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Files are copied from the main server when a copy is added. After you change files, press «Update files in copies»; deploys from Git update the copies themselves.
        </p>
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-4">
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block text-sm font-medium">Automatic scaling</span>
            <span className="block text-xs text-muted-foreground">Adds a copy when the average CPU of the copies stays above the threshold, removes one when the load drops.</span>
          </span>
          <Switch checked={form.autoscale} onCheckedChange={(on) => set("autoscale", on)} disabled={!canManage} />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="scale-min">
              Copies at least
            </label>
            <Input id="scale-min" type="number" min={1} max={20} value={form.min} onChange={(e) => set("min", Number(e.target.value))} disabled={!canManage} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="scale-max">
              Copies at most
            </label>
            <Input id="scale-max" type="number" min={1} max={20} value={form.max} onChange={(e) => set("max", Number(e.target.value))} disabled={!canManage} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="scale-cpu">
              Add a copy above CPU, %
            </label>
            <Input id="scale-cpu" type="number" min={10} max={95} value={form.targetCpu} onChange={(e) => set("targetCpu", Number(e.target.value))} disabled={!canManage} />
          </div>
        </div>
        {nodes.length > 1 && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Nodes for copies (none selected — any online node)</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {nodes.map((n) => (
                <label key={n.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.nodeIds.includes(n.id)}
                    disabled={!canManage}
                    onCheckedChange={(on) => set("nodeIds", on === true ? [...form.nodeIds, n.id] : form.nodeIds.filter((id) => id !== n.id))}
                  />
                  {n.name}
                </label>
              ))}
            </div>
          </div>
        )}
        {canManage && (
          <div className="flex justify-end gap-2">
            {dirty && (
              <Button variant="ghost" onClick={() => setDirty(false)}>
                Discard changes
              </Button>
            )}
            <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
              Save scaling
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
