import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Server, Plus, Search, Trash2, Play, Square, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertServerSchema, type InsertServer, type Server as ServerType, type Node, gameTypes } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";

import { Gamepad2, Crosshair, Hammer, GitBranch, Sword, Globe, Palette, Package } from "lucide-react";

const gameIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  minecraft: Gamepad2,
  csgo: Crosshair,
  rust: Hammer,
  ark: GitBranch,
  valheim: Sword,
  terraria: Globe,
  gmod: Palette,
  custom: Package,
};

export default function ServersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: servers, isLoading } = useQuery<ServerType[]>({
    queryKey: ["/api/servers"],
  });

  const { data: nodes } = useQuery<Node[]>({
    queryKey: ["/api/nodes"],
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertServer) => apiRequest("POST", "/api/servers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
      setDialogOpen(false);
      toast({
        title: "Server created",
        description: "Your game server has been created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create server",
        variant: "destructive",
      });
    },
  });

  const filteredServers = servers?.filter((server) =>
    server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    server.gameType.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Servers</h1>
          <p className="text-sm text-muted-foreground">
            Manage your game server containers
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-server">
              <Plus className="w-4 h-4 mr-2" />
              Create Server
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            {dialogOpen && (
              <CreateServerForm
                nodes={nodes || []}
                onSubmit={(data) => createMutation.mutate(data)}
                isLoading={createMutation.isPending}
                onSuccess={() => setDialogOpen(false)}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search servers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-servers"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : !filteredServers || filteredServers.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Server className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {searchQuery ? "No servers found" : "No servers yet"}
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              {searchQuery
                ? "Try adjusting your search"
                : "Create your first game server to get started"}
            </p>
            {!searchQuery && (
              <Button onClick={() => setDialogOpen(true)} data-testid="button-create-first-server">
                <Plus className="w-4 h-4 mr-2" />
                Create Server
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredServers.map((server) => (
            <ServerCard key={server.id} server={server} />
          ))}
        </div>
      )}
    </div>
  );
}

function ServerCard({ server }: { server: ServerType }) {
  const { toast } = useToast();

  const controlMutation = useMutation({
    mutationFn: ({ action }: { action: string }) =>
      apiRequest("POST", `/api/servers/${server.id}/${action}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to control server",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/servers/${server.id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
      toast({
        title: "Server deleted",
        description: "The server has been removed",
      });
    },
  });

  return (
    <Link href={`/servers/${server.id}`}>
      <Card className="hover-elevate active-elevate-2 h-full" data-testid={`server-card-${server.id}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
                {(() => {
                  const Icon = gameIcons[server.gameType] || gameIcons.custom;
                  return <Icon className="w-5 h-5 text-primary" />;
                })()}
              </div>
              <div>
                <h3 className="font-medium truncate">{server.name}</h3>
                <p className="text-xs text-muted-foreground capitalize">{server.gameType}</p>
              </div>
            </div>
            <StatusBadge status={server.status as any} />
          </div>

          <div className="space-y-2 mb-4 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">CPU Limit</span>
              <span className="font-medium">{server.cpuLimit}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">RAM Limit</span>
              <span className="font-medium">{server.ramLimit} GB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Port</span>
              <span className="font-medium">{server.port}</span>
            </div>
          </div>

          <div className="flex items-center gap-2" onClick={(e) => e.preventDefault()}>
            {server.status === "stopped" && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={(e) => {
                  e.preventDefault();
                  controlMutation.mutate({ action: "start" });
                }}
                disabled={controlMutation.isPending}
                data-testid={`button-start-${server.id}`}
              >
                <Play className="w-3 h-3 mr-1" />
                Start
              </Button>
            )}
            {server.status === "running" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={(e) => {
                    e.preventDefault();
                    controlMutation.mutate({ action: "restart" });
                  }}
                  disabled={controlMutation.isPending}
                  data-testid={`button-restart-${server.id}`}
                >
                  <RotateCw className="w-3 h-3 mr-1" />
                  Restart
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={(e) => {
                    e.preventDefault();
                    controlMutation.mutate({ action: "stop" });
                  }}
                  disabled={controlMutation.isPending}
                  data-testid={`button-stop-${server.id}`}
                >
                  <Square className="w-3 h-3 mr-1" />
                  Stop
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.preventDefault();
                if (confirm("Are you sure you want to delete this server?")) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
              data-testid={`button-delete-${server.id}`}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function CreateServerForm({
  nodes,
  onSubmit,
  isLoading,
  onSuccess,
}: {
  nodes: Node[];
  onSubmit: (data: InsertServer) => void;
  isLoading: boolean;
  onSuccess?: () => void;
}) {
  const form = useForm<InsertServer>({
    resolver: zodResolver(insertServerSchema),
    defaultValues: {
      name: "",
      gameType: "minecraft",
      nodeId: nodes[0]?.id || "",
      status: "stopped",
      cpuLimit: 50,
      ramLimit: 2,
      diskLimit: 10,
      port: 25565,
      autoStart: false,
      config: {},
    },
  });

  // Обновляем nodeId когда nodes загружаются
  useEffect(() => {
    if (nodes.length > 0 && !form.getValues("nodeId")) {
      form.setValue("nodeId", nodes[0].id);
    }
  }, [nodes, form]);

  const handleSubmit = async (data: InsertServer) => {
    try {
      await onSubmit(data);
      form.reset({
        name: "",
        gameType: "minecraft",
        nodeId: nodes[0]?.id || "",
        status: "stopped",
        cpuLimit: 50,
        ramLimit: 2,
        diskLimit: 10,
        port: 25565,
        autoStart: false,
        config: {},
      });
      onSuccess?.();
    } catch (error) {
      // Ошибка обрабатывается в mutation
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Create New Server</DialogTitle>
        <DialogDescription>
          Configure your game server container settings
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Server Name</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="My Awesome Server" data-testid="input-server-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="gameType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Game Type</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-game-type">
                      <SelectValue placeholder="Select game type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {gameTypes.map((type) => {
                      const Icon = gameIcons[type];
                      return (
                        <SelectItem key={type} value={type}>
                          <span className="flex items-center gap-2">
                            <Icon className="w-4 h-4" />
                            <span className="capitalize">{type}</span>
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="nodeId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Node</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ""}>
                  <FormControl>
                    <SelectTrigger data-testid="select-node">
                      <SelectValue placeholder="Select a node" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {nodes.map((node) => (
                      <SelectItem key={node.id} value={node.id}>
                        {node.name} ({node.location})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  {nodes.length === 0 && "No nodes available. Please add a node first."}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="cpuLimit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CPU Limit: {field.value}%</FormLabel>
                  <FormControl>
                    <Slider
                      min={10}
                      max={100}
                      step={10}
                      value={[field.value]}
                      onValueChange={([value]) => field.onChange(value)}
                      data-testid="slider-cpu"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="ramLimit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>RAM Limit: {field.value} GB</FormLabel>
                  <FormControl>
                    <Slider
                      min={1}
                      max={32}
                      step={1}
                      value={[field.value]}
                      onValueChange={([value]) => field.onChange(value)}
                      data-testid="slider-ram"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="diskLimit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Disk Limit: {field.value} GB</FormLabel>
                  <FormControl>
                    <Slider
                      min={5}
                      max={100}
                      step={5}
                      value={[field.value]}
                      onValueChange={([value]) => field.onChange(value)}
                      data-testid="slider-disk"
                    />
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
                      onChange={(e) => field.onChange(parseInt(e.target.value))}
                      data-testid="input-port"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="autoStart"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-md border border-border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Auto Start</FormLabel>
                  <FormDescription>
                    Automatically start server when node boots
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    data-testid="switch-autostart"
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <div className="flex justify-end gap-3">
            <Button type="submit" disabled={isLoading || nodes.length === 0} data-testid="button-submit-server">
              {isLoading ? "Creating..." : "Create Server"}
            </Button>
          </div>
        </form>
      </Form>
    </>
  );
}
