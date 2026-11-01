import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { HardDrive, Plus, Trash2, RefreshCw, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusLed } from "@/components/status-badge";
import { PageHeader, PageShell } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { useCan } from "@/lib/use-me";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ResourceMeter } from "@/components/resource-meter";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertNodeSchema, type InsertNode, type Node, type NodeStats, type Server } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { NodeInstallDialog } from "@/components/node-install-dialog";

export default function NodesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();
  const can = useCan();

  const { data: nodes, isLoading } = useQuery<Node[]>({
    queryKey: ["/api/nodes"],
    refetchInterval: 15000,
  });

  const { data: nodeStats } = useQuery<Record<string, NodeStats>>({
    queryKey: ["/api/stats/nodes"],
    refetchInterval: 5000,
  });

  const { data: servers } = useQuery<Server[]>({
    queryKey: ["/api/servers"],
    refetchInterval: 15000,
    enabled: can("servers.view"),
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertNode) => {
      const res = await apiRequest("POST", "/api/nodes", data);
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/nodes"] });
      setDialogOpen(false);
      toast({
        title: "Node added",
        description: `Node "${data.name}" has been added successfully`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add node",
        variant: "destructive",
      });
    },
  });

  const online = nodes?.filter((n) => n.status === "online").length ?? 0;

  return (
    <PageShell>
      <PageHeader
        title="Nodes"
        description={nodes?.length ? `${online} of ${nodes.length} online. Machines with Docker where servers run.` : "Machines with Docker where servers run"}
        actions={
          can("nodes.manage") && (
            <div className="flex flex-wrap gap-2">
              <NodeInstallDialog />
              <Button onClick={() => setDialogOpen(true)} data-testid="button-add-node">
                <Plus /> Add node
              </Button>
            </div>
          )
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>{dialogOpen && <CreateNodeForm onSubmit={(data) => createMutation.mutate(data)} isLoading={createMutation.isPending} />}</DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : !nodes || nodes.length === 0 ? (
        <EmptyState
          icon={HardDrive}
          title="No nodes yet"
          description="The machine with the panel is added automatically when Docker is available. Add more machines to spread servers across them."
          action={
            can("nodes.manage") && (
              <Button onClick={() => setDialogOpen(true)} data-testid="button-add-first-node">
                <Plus /> Add node
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {nodes.map((node) => (
            <NodeRow
              key={node.id}
              node={node}
              stats={nodeStats?.[node.id]}
              totalServers={servers?.filter((s) => s.nodeId === node.id).length ?? 0}
              canManage={can("nodes.manage")}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function NodeRow({ node, stats, totalServers, canManage }: { node: Node; stats?: NodeStats; totalServers: number; canManage: boolean }) {
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [poolOpen, setPoolOpen] = useState(false);
  const [poolStart, setPoolStart] = useState("");
  const [poolEnd, setPoolEnd] = useState("");
  const poolKey = ["/api/nodes", node.id, "port-pool"];
  const { data: pool } = useQuery<{ pool: { start: number; end: number } | null; used: number; nextFree: number | null; publicAddress: string | null }>({ queryKey: poolKey });
  const [publicAddress, setPublicAddress] = useState("");

  const addressMutation = useMutation({
    mutationFn: async (address: string | null) => (await apiRequest("PUT", `/api/nodes/${node.id}/public-address`, { address })).json(),
    onSuccess: (next) => {
      queryClient.setQueryData(poolKey, next);
      setPoolOpen(false);
      toast({ title: next.publicAddress ? `Players connect to ${next.publicAddress}` : "Address for players removed" });
    },
    onError: (error: Error) => toast({ title: "Address not saved", description: error.message, variant: "destructive" }),
  });

  const poolMutation = useMutation({
    mutationFn: async (next: { start: number; end: number } | null) => (await apiRequest("PUT", `/api/nodes/${node.id}/port-pool`, { pool: next })).json(),
    onSuccess: (next) => {
      queryClient.setQueryData(poolKey, next);
      setPoolOpen(false);
      toast({ title: next.pool ? `Ports ${next.pool.start}–${next.pool.end} saved` : "Port range removed" });
    },
    onError: (error: Error) => toast({ title: "Port range not saved", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/nodes/${node.id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/nodes"] });
      toast({ title: "Node removed", description: `${node.name} is no longer used by the panel` });
    },
    onError: (error: Error) => toast({ title: "Node not removed", description: error.message, variant: "destructive" }),
  });

  const checkMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/nodes/${node.id}/check`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/nodes"] }),
    onError: (error: Error) => toast({ title: "Node did not respond", description: error.message, variant: "destructive" }),
  });

  return (
    <div className="grid gap-5 rounded-lg border bg-card p-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)_auto] lg:items-center" data-testid={`node-card-${node.id}`}>
      <div className="flex min-w-0 items-start gap-3">
        <StatusLed status={node.status} className="mt-1.5" />
        <div className="min-w-0">
          <p className="truncate font-semibold">{node.name}</p>
          <p className="truncate text-sm text-muted-foreground">
            <span className="font-mono">
              {node.ip}:{node.port}
            </span>
            {node.location ? `, ${node.location}` : ""}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {`${totalServers} ${totalServers === 1 ? "server" : "servers"}, ${stats?.serversCount ?? 0} running. ${node.cpuCores} cores, ${node.ramTotal} GB RAM, ${node.diskTotal} GB disk`}
          </p>
          {pool?.publicAddress && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Address for players: <span className="font-mono text-foreground" translate="no">{pool.publicAddress}</span>
            </p>
          )}
          {pool?.pool && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Ports {pool.pool.start}–{pool.pool.end}: {pool.used} used{pool.nextFree === null ? ", none free" : `, next free ${pool.nextFree}`}
            </p>
          )}
        </div>
      </div>

      {stats && node.status === "online" ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <ResourceMeter label="CPU" value={stats.cpuUsage} max={100} unit="%" />
          <ResourceMeter label="Memory" value={stats.ramUsage} max={node.ramTotal} />
          <ResourceMeter label="Disk" value={stats.diskUsage} max={node.diskTotal} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {node.status === "online" ? "Collecting load data…" : "The panel cannot reach Docker on this node. Servers on it cannot be started or stopped."}
        </p>
      )}

      {canManage && (
        <div className="flex items-center gap-2 lg:justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setPublicAddress(pool?.publicAddress ?? "");
              setPoolStart(String(pool?.pool?.start ?? 25565));
              setPoolEnd(String(pool?.pool?.end ?? 25665));
              setPoolOpen(true);
            }}
          >
            <Network /> Address and ports
          </Button>
          <Button variant="outline" size="sm" onClick={() => checkMutation.mutate()} disabled={checkMutation.isPending}>
            <RefreshCw className={checkMutation.isPending ? "animate-spin" : undefined} /> Check
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setConfirmDelete(true)} aria-label={`Remove ${node.name}`} data-testid={`button-delete-${node.id}`}>
            <Trash2 />
          </Button>
        </div>
      )}

      <Dialog open={poolOpen} onOpenChange={setPoolOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Address and ports of {node.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor={`public-address-${node.id}`}>
              Address for players
            </label>
            <div className="flex gap-2">
              <Input id={`public-address-${node.id}`} value={publicAddress} onChange={(e) => setPublicAddress(e.target.value)} placeholder={node.ip} />
              <Button variant="outline" onClick={() => addressMutation.mutate(publicAddress.trim() || null)} disabled={addressMutation.isPending || publicAddress.trim() === (pool?.publicAddress ?? "")}>
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Public IP or domain shown on server pages and the status page. Leave empty to use the node IP.</p>
          </div>
          <DialogHeader>
            <DialogTitle className="text-base">Port range</DialogTitle>
            <DialogDescription>New servers on this node get the first free port of this range, and ports outside it are refused. Open the range in the machine's firewall.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor={`pool-start-${node.id}`}>
                First port
              </label>
              <Input id={`pool-start-${node.id}`} type="number" min={1024} max={65535} value={poolStart} onChange={(e) => setPoolStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor={`pool-end-${node.id}`}>
                Last port
              </label>
              <Input id={`pool-end-${node.id}`} type="number" min={1024} max={65535} value={poolEnd} onChange={(e) => setPoolEnd(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {pool?.pool && (
              <Button variant="ghost" onClick={() => poolMutation.mutate(null)} disabled={poolMutation.isPending}>
                Remove range
              </Button>
            )}
            <Button onClick={() => poolMutation.mutate({ start: Number(poolStart), end: Number(poolEnd) })} disabled={poolMutation.isPending || !poolStart || !poolEnd}>
              Save range
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {node.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The panel stops using this machine. A node that still has servers cannot be removed — move or delete them first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep node</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteMutation.mutate()}>
              Remove node
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreateNodeForm({
  onSubmit,
  isLoading,
}: {
  onSubmit: (data: InsertNode) => void;
  isLoading: boolean;
}) {
  const form = useForm<InsertNode>({
    resolver: zodResolver(insertNodeSchema),
    defaultValues: {
      name: "",
      location: "",
      ip: "",
      port: 2375,
      status: "online",
      cpuCores: 4,
      ramTotal: 16,
      diskTotal: 100,
    },
  });

  const handleSubmit = (data: InsertNode) => {
    onSubmit(data);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add New Node</DialogTitle>
        <DialogDescription>
          Configure connection to your Docker host
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Node Name</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="node-01" data-testid="input-node-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="location"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Location</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="US East" data-testid="input-location" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-3 gap-3">
            <FormField
              control={form.control}
              name="ip"
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>IP Address</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="192.168.1.100" data-testid="input-ip" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="port"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Port</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      value={field.value || ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        field.onChange(value === "" ? undefined : parseInt(value, 10));
                      }}
                      data-testid="input-node-port"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <FormField
              control={form.control}
              name="cpuCores"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CPU Cores</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      value={field.value || ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        field.onChange(value === "" ? undefined : parseInt(value, 10));
                      }}
                      data-testid="input-cpu-cores"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="ramTotal"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>RAM (GB)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      value={field.value || ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        field.onChange(value === "" ? undefined : parseInt(value, 10));
                      }}
                      data-testid="input-ram"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="diskTotal"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Disk (GB)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      value={field.value || ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        field.onChange(value === "" ? undefined : parseInt(value, 10));
                      }}
                      data-testid="input-disk"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button type="submit" disabled={isLoading} data-testid="button-submit-node">
              {isLoading ? "Adding..." : "Add Node"}
            </Button>
          </div>
        </form>
      </Form>
    </>
  );
}
