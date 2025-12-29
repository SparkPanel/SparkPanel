import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { HardDrive, Plus, Trash2, MapPin, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { ResourceMeter } from "@/components/resource-meter";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertNodeSchema, type InsertNode, type Node, type NodeStats } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";

export default function NodesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: nodes, isLoading } = useQuery<Node[]>({
    queryKey: ["/api/nodes"],
  });

  const { data: nodeStats } = useQuery<Record<string, NodeStats>>({
    queryKey: ["/api/stats/nodes"],
    refetchInterval: 5000,
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
      // Извлекаем сообщение об ошибке из ответа сервера
      let errorMessage = "Failed to add node";
      if (error.message) {
        try {
          // Пытаемся извлечь JSON из сообщения об ошибке
          const match = error.message.match(/\d+:\s*(.+)/);
          if (match) {
            try {
              const errorData = JSON.parse(match[1]);
              errorMessage = errorData.message || errorMessage;
            } catch {
              errorMessage = match[1] || errorMessage;
            }
          }
        } catch {
          errorMessage = error.message || errorMessage;
        }
      }
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Nodes</h1>
          <p className="text-sm text-muted-foreground">
            Manage your infrastructure nodes
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-node">
              <Plus className="w-4 h-4 mr-2" />
              Add Node
            </Button>
          </DialogTrigger>
          <DialogContent>
            <CreateNodeForm
              onSubmit={(data) => createMutation.mutate(data)}
              isLoading={createMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : !nodes || nodes.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <HardDrive className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No nodes configured</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Add your first node to start deploying game servers
            </p>
            <Button onClick={() => setDialogOpen(true)} data-testid="button-add-first-node">
              <Plus className="w-4 h-4 mr-2" />
              Add Node
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {nodes.map((node) => (
            <NodeCard key={node.id} node={node} stats={nodeStats?.[node.id]} />
          ))}
        </div>
      )}
    </div>
  );
}

function NodeCard({ node, stats }: { node: Node; stats?: NodeStats }) {
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/nodes/${node.id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/nodes"] });
      toast({
        title: "Node removed",
        description: "The node has been removed",
      });
    },
  });

  return (
    <Card data-testid={`node-card-${node.id}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
            <HardDrive className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">{node.name}</CardTitle>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <MapPin className="w-3 h-3" />
              {node.location}
            </div>
          </div>
        </div>
        <StatusBadge status={node.status as any} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">IP Address</span>
            <p className="font-mono text-xs mt-1">{node.ip}:{node.port}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Servers</span>
            <p className="font-medium mt-1">{stats?.serversCount || 0}</p>
          </div>
        </div>

        {stats && (
          <div className="space-y-3 pt-3 border-t border-border">
            <ResourceMeter
              label="CPU Usage"
              value={stats.cpuUsage}
              max={100}
              unit="%"
            />
            <ResourceMeter
              label="Memory"
              value={stats.ramUsage}
              max={node.ramTotal}
            />
            <ResourceMeter
              label="Disk"
              value={stats.diskUsage}
              max={node.diskTotal}
            />
          </div>
        )}

        <div className="pt-3 border-t border-border">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground flex-1">
              <Activity className="w-3 h-3" />
              <span>{node.cpuCores} Cores | {node.ramTotal}GB RAM | {node.diskTotal}GB Disk</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm("Are you sure you want to remove this node?")) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
              data-testid={`button-delete-${node.id}`}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateNodeForm({
  onSubmit,
  isLoading,
  onSuccess,
}: {
  onSubmit: (data: InsertNode) => void;
  isLoading: boolean;
  onSuccess?: () => void;
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
    // Сбрасываем форму после отправки
    setTimeout(() => {
      form.reset();
      onSuccess?.();
    }, 100);
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
