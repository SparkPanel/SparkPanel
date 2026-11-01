import { useParams, useLocation, Link } from "wouter";
import { AnsiText, stripAnsi } from "@/lib/ansi";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { GitBranch, Plus, RefreshCw, CopyPlus, BookmarkPlus, Upload, ArrowLeft, ArrowRightLeft, MoreHorizontal, Server as ServerIcon, Zap, Play, Square, RotateCw, Trash2, Terminal, FolderOpen, Settings as SettingsIcon, BarChart3, Send, Database, Network, Key, Download, Trash, Edit, Save, Search, Copy, ChevronLeft, ChevronRight, FileText, Folder, FileArchive, PackageOpen, X, Users, Package, DatabaseZap, Layers } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge, StatusLed } from "@/components/status-badge";
import { PageHeader, PageShell, SectionHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { HistoryChart } from "@/components/history-chart";
import { CodeEditor } from "@/components/code-editor";
import { PlayersTab } from "@/components/players-tab";
import { GamePlayersTab } from "@/components/game-players-tab";
import { CatalogTab } from "@/components/catalog-tab";
import { DatabaseTab } from "@/components/database-tab";
import { DomainsCard } from "@/components/domains-card";
import { ScalingTab } from "@/components/scaling-tab";
import { GameSettingsCard } from "@/components/game-settings-card";
import { GAME_LABELS, GAME_PROFILES, isProfiledGame } from "@shared/game-profiles";
import { BackupScheduleCard } from "@/components/backup-schedule";
import { Checkbox } from "@/components/ui/checkbox";
import { useCan, ServerPermissionsContext, SERVER_SCOPED } from "@/lib/use-me";
import { ServerAccessCards } from "@/components/server-access-cards";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Server, ServerStats, ConsoleLog, FileEntry, Node, UserPermission } from "@shared/schema";

/** Ответ GET /api/servers/:id: сервер и права текущего пользователя на него. */
type ServerDetail = Server & {
  pendingRestart?: boolean;
  myPermissions: UserPermission[];
  isOwner: boolean;
  paidUntil: string | null;
  suspended: { at: string; reason: string } | null;
  /** Публичный адрес ноды; null — локальная нода без заданного адреса. */
  connectHost: string | null;
};
import { findRuntime } from "@shared/runtimes";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function ServerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const globalCan = useCan();
  const { data: server, isLoading } = useQuery<ServerDetail>({
    queryKey: ["/api/servers", id],
    refetchInterval: 5000,
  });
  const myPermissions = server?.myPermissions;
  const can = (...any: UserPermission[]) => any.some((p) => (myPermissions && SERVER_SCOPED.includes(p) ? myPermissions.includes(p) : globalCan(p)));

  const { data: liveStats } = useQuery<ServerStats>({
    queryKey: ["/api/servers", id, "stats"],
    refetchInterval: 3000,
    enabled: server?.status === "running",
  });
  const stats = server?.status === "running" ? liveStats : undefined;

  const { data: nodes = [] } = useQuery<Node[]>({
    queryKey: ["/api/nodes"],
    enabled: can("nodes.view", "nodes.manage", "servers.manage"),
  });
  const [targetNodeId, setTargetNodeId] = useState("");
  const [migrateDialogOpen, setMigrateDialogOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneName, setCloneName] = useState("");
  const [clonePort, setClonePort] = useState("");
  const [cloneFiles, setCloneFiles] = useState(true);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const controlMutation = useMutation({
    mutationFn: ({ action }: { action: string }) =>
      apiRequest("POST", `/api/servers/${id}/${action}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servers", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
    },
    onError: (error: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/servers", id] });
      toast({
        title: "Error",
        description: error?.message || "Failed to control server",
        variant: "destructive",
      });
    },
  });

  const updateImageMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/servers/${id}/update-image`, {}),
    onSuccess: () => toast({ title: "Updating image", description: "Progress is shown in the console. A running server restarts on the new image." }),
    onError: (error: any) => toast({ title: "Image not updated", description: error.message, variant: "destructive" }),
  });

  const cloneMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/servers/${id}/clone`, { name: cloneName.trim(), port: Number(clonePort), copyFiles: cloneFiles });
      return (await response.json()) as Server;
    },
    onSuccess: (copy) => {
      queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
      setCloneOpen(false);
      toast({ title: "Server copied", description: `${copy.name} is ready. Start it when you need it.` });
      setLocation(`/servers/${copy.id}`);
    },
    onError: (error: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
      toast({ title: "Server not copied", description: error.message, variant: "destructive" });
    },
  });

  const templateMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/servers/${id}/template`, { name: templateName.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/server-templates"] });
      setTemplateOpen(false);
      toast({ title: "Template saved", description: `Choose “${templateName.trim()}” when creating a new server.` });
    },
    onError: (error: any) => toast({ title: "Template not saved", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/servers/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
      toast({ title: "Server deleted", description: "The container and its files were removed" });
      setLocation("/servers");
    },
    onError: (error: any) => toast({ title: "Server not deleted", description: error.message, variant: "destructive" }),
  });

  const migrateMutation = useMutation({
    mutationFn: (payload: { targetNodeId: string; keepSource: boolean }) =>
      apiRequest("POST", `/api/servers/${id}/migrate`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servers", id] });
      setMigrateDialogOpen(false);
      toast({ title: "Migrated", description: "Server migrated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Migration failed", description: error.message || "Failed to migrate server", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <PageShell>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96" />
      </PageShell>
    );
  }

  if (!server) {
    return (
      <PageShell>
        <EmptyState
          icon={ServerIcon}
          title="Server not found"
          description="It may have been deleted, or you no longer have access to it."
          action={
            <Button asChild variant="outline" data-testid="button-back-servers">
              <Link href="/servers">Back to servers</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }

  const running = server.status === "running";
  const busy = server.status === "starting" || server.status === "stopping";
  const nodeName = nodes.find((n) => n.id === server.nodeId)?.name;
  const canControl = can("servers.control");
  const canManage = can("servers.manage");
  const canConfig = can("servers.config", "servers.manage");
  const canDelete = canManage || server.isOwner;

  return (
    <ServerPermissionsContext.Provider value={server.myPermissions}>
    <PageShell>
      {server.suspended && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
          This server is suspended ({server.suspended.reason}). It cannot be started until it is unsuspended.
        </div>
      )}
      <div className="space-y-4">
        <Link href="/servers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-testid="button-back">
          <ArrowLeft className="h-4 w-4" /> Servers
        </Link>

        <PageHeader
          leading={<StatusLed status={server.status} className="mt-3.5" />}
          title={server.name}
          description={
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <StatusBadge status={server.status} hideLed className="text-sm" />
              <span>{GAME_LABELS[server.gameType] ?? server.gameType}</span>
              {nodeName && <span>Node {nodeName}</span>}
              <ConnectAddress host={server.connectHost} port={server.port} gameType={server.gameType} />
            </span>
          }
          actions={
            <>
              {canControl &&
                (running ? (
                  <>
                    <Button variant="outline" onClick={() => controlMutation.mutate({ action: "restart" })} disabled={controlMutation.isPending} data-testid="button-restart-server">
                      <RotateCw /> Restart
                    </Button>
                    <Button variant="outline" onClick={() => controlMutation.mutate({ action: "stop" })} disabled={controlMutation.isPending} data-testid="button-stop-server">
                      <Square /> Stop
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => controlMutation.mutate({ action: "start" })} disabled={busy || controlMutation.isPending} data-testid="button-start-server">
                    <Play /> {busy ? "Working…" : "Start"}
                  </Button>
                ))}
              {(canControl || canConfig || canDelete) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" aria-label="More server actions">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    {canControl && (running || busy) && (
                      <DropdownMenuItem onSelect={() => controlMutation.mutate({ action: "kill" })}>
                        <Zap className="mr-2 h-4 w-4" /> Force stop
                      </DropdownMenuItem>
                    )}
                    {canConfig && (
                      <DropdownMenuItem onSelect={() => updateImageMutation.mutate()} disabled={updateImageMutation.isPending}>
                        <RefreshCw className="mr-2 h-4 w-4" /> Update server image
                      </DropdownMenuItem>
                    )}
                    {canManage && (
                      <>
                        <DropdownMenuItem
                          onSelect={() => {
                            setCloneName(`${server.name} copy`);
                            setClonePort(String(server.port + 1));
                            setCloneFiles(true);
                            setCloneOpen(true);
                          }}
                        >
                          <CopyPlus className="mr-2 h-4 w-4" /> Make a copy
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            setTemplateName(server.name);
                            setTemplateOpen(true);
                          }}
                        >
                          <BookmarkPlus className="mr-2 h-4 w-4" /> Save as template
                        </DropdownMenuItem>
                      </>
                    )}
                    {canManage && nodes.length > 1 && (
                      <DropdownMenuItem onSelect={() => setMigrateDialogOpen(true)}>
                        <ArrowRightLeft className="mr-2 h-4 w-4" /> Move to another node
                      </DropdownMenuItem>
                    )}
                    {canDelete && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setDeleteOpen(true)} className="text-destructive focus:text-destructive" data-testid="button-delete-server">
                          <Trash2 className="mr-2 h-4 w-4" /> Delete server
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          }
        />

        {(server as Server & { pendingRestart?: boolean }).pendingRestart && (
          <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
            <StatusLed status="starting" />
            Settings were changed. Restart the server to apply them.
          </div>
        )}

        {running && stats && (
          <div className="grid gap-x-8 gap-y-3 rounded-lg border bg-card px-5 py-4 sm:grid-cols-3">
            <ResourceMeter label="CPU" value={stats.cpuUsage} max={server.cpuLimit} unit="%" />
            <ResourceMeter label="Memory" value={stats.ramUsage} max={server.ramLimit} />
            <ResourceMeter label="Disk" value={stats.diskUsage} max={server.diskLimit} />
          </div>
        )}
      </div>

      <Dialog open={migrateDialogOpen} onOpenChange={setMigrateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move to another node</DialogTitle>
            <DialogDescription>The server is stopped, its files are copied to the selected node, and it keeps its settings.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={targetNodeId} onValueChange={setTargetNodeId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a node" />
              </SelectTrigger>
              <SelectContent>
                {nodes
                  .filter((n) => n.id !== server.nodeId)
                  .map((node) => (
                    <SelectItem key={node.id} value={node.id}>
                      {node.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button onClick={() => migrateMutation.mutate({ targetNodeId, keepSource: false })} disabled={migrateMutation.isPending || !targetNodeId} className="w-full">
              {migrateMutation.isPending ? "Moving…" : "Move server"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={cloneOpen} onOpenChange={(open) => !cloneMutation.isPending && setCloneOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Make a copy of {server.name}</DialogTitle>
            <DialogDescription>The copy gets the same settings, resources and variables. It is created stopped.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="clone-name">Name</Label>
              <Input id="clone-name" value={cloneName} onChange={(e) => setCloneName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clone-port">Port</Label>
              <Input id="clone-port" type="number" min={1} max={65535} value={clonePort} onChange={(e) => setClonePort(e.target.value)} />
            </div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="clone-files">Copy files</Label>
                <p className="text-sm text-muted-foreground">
                  Worlds, plugins and configs are copied. {running ? "Stop the server first for a consistent copy of its world." : ""}
                </p>
              </div>
              <Switch id="clone-files" checked={cloneFiles} onCheckedChange={setCloneFiles} />
            </div>
            <Button
              className="w-full"
              onClick={() => cloneMutation.mutate()}
              disabled={cloneMutation.isPending || !cloneName.trim() || !(Number(clonePort) >= 1 && Number(clonePort) <= 65535)}
            >
              {cloneMutation.isPending ? (cloneFiles ? "Copying files…" : "Creating…") : "Make a copy"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
            <DialogDescription>
              Saves the game type, resources, image, startup command and variables. Files, ports and secret values are not saved.
            </DialogDescription>
          </DialogHeader>
          <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Template name" autoFocus onKeyDown={(e) => e.key === "Enter" && templateName.trim() && templateMutation.mutate()} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTemplateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => templateMutation.mutate()} disabled={templateMutation.isPending || !templateName.trim()}>
              {templateMutation.isPending ? "Saving…" : "Save template"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {server.name}?</AlertDialogTitle>
            <AlertDialogDescription>The container, all server files and its backups will be removed. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep server</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteMutation.mutate()}>
              Delete server
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Tabs defaultValue="console">
        <TabsList>
          {(!server.visibility || server.visibility.console !== false) && (
            <TabsTrigger value="console" data-testid="tab-console">
              <Terminal />
              Console
            </TabsTrigger>
          )}
          {(server.gameType === "minecraft" || isProfiledGame(server.gameType)) && can("servers.console", "servers.command") && (
            <TabsTrigger value="players" data-testid="tab-players">
              <Users />
              Players
            </TabsTrigger>
          )}
          {["minecraft", "rust", "valheim"].includes(server.gameType) && can("servers.files") && (
            <TabsTrigger value="catalog" data-testid="tab-catalog">
              <Package />
              Plugins & mods
            </TabsTrigger>
          )}
          {(!server.visibility || server.visibility.files !== false) && (
            <TabsTrigger value="files" data-testid="tab-files">
              <FolderOpen />
              Files
            </TabsTrigger>
          )}
          {(!server.visibility || server.visibility.stats !== false) && (
            <TabsTrigger value="stats" data-testid="tab-stats">
              <BarChart3 />
              Statistics
            </TabsTrigger>
          )}
          {(!server.visibility || server.visibility.backups !== false) && (
            <TabsTrigger value="backups" data-testid="tab-backups">
              <Database />
              Backups
            </TabsTrigger>
          )}
          {(!server.visibility || server.visibility.ports !== false) && (
            <TabsTrigger value="ports" data-testid="tab-ports">
              <Network />
              Ports
            </TabsTrigger>
          )}
          {(!server.visibility || server.visibility.sftp !== false) && (
            <TabsTrigger value="sftp" data-testid="tab-sftp">
              <Key />
              SFTP
            </TabsTrigger>
          )}
          {can("servers.config", "servers.manage") && (
            <TabsTrigger value="variables" data-testid="tab-variables">
              <Key />
              Variables
            </TabsTrigger>
          )}
          {server.gameType === "custom" && can("servers.config", "servers.manage") && (
            <TabsTrigger value="scaling" data-testid="tab-scaling">
              <Layers />
              Scaling
            </TabsTrigger>
          )}
          {can("servers.config", "servers.manage") && (
            <TabsTrigger value="database" data-testid="tab-database">
              <DatabaseZap />
              Database
            </TabsTrigger>
          )}
          {can("servers.config", "servers.manage") && (
            <TabsTrigger value="git" data-testid="tab-git">
              <GitBranch />
              Git
            </TabsTrigger>
          )}
          {(!server.visibility || server.visibility.settings !== false) && (
            <TabsTrigger value="settings" data-testid="tab-settings">
              <SettingsIcon />
              Settings
            </TabsTrigger>
          )}
        </TabsList>

        {(!server.visibility || server.visibility.console !== false) && (
          <TabsContent value="console" className="space-y-4">
            <ConsoleTab serverId={server.id} isRunning={server.status === "running"} />
          </TabsContent>
        )}

        {(server.gameType === "minecraft" || isProfiledGame(server.gameType)) && can("servers.console", "servers.command") && (
          <TabsContent value="players">{server.gameType === "minecraft" ? <PlayersTab server={server} /> : <GamePlayersTab server={server} />}</TabsContent>
        )}

        {["minecraft", "rust", "valheim"].includes(server.gameType) && can("servers.files") && (
          <TabsContent value="catalog">
            <CatalogTab server={server} />
          </TabsContent>
        )}

        {(!server.visibility || server.visibility.files !== false) && (
          <TabsContent value="files" className="space-y-4">
            <FilesTab serverId={server.id} />
          </TabsContent>
        )}

        {(!server.visibility || server.visibility.stats !== false) && (
          <TabsContent value="stats" className="space-y-4">
            <StatsTab server={server} stats={stats} />
          </TabsContent>
        )}

        {(!server.visibility || server.visibility.backups !== false) && (
          <TabsContent value="backups" className="space-y-4">
            <BackupsTab serverId={server.id} server={server} />
          </TabsContent>
        )}

        {(!server.visibility || server.visibility.ports !== false) && (
          <TabsContent value="ports" className="space-y-4">
            <PortsTab serverId={server.id} server={server} />
            {can("servers.config", "servers.manage") && <DomainsCard server={server} />}
          </TabsContent>
        )}

        {(!server.visibility || server.visibility.sftp !== false) && (
          <TabsContent value="sftp" className="space-y-4">
            <SftpTab serverId={server.id} server={server} />
          </TabsContent>
        )}

        {can("servers.config", "servers.manage") && (
          <TabsContent value="variables">
            <VariablesTab server={server} />
          </TabsContent>
        )}

        {server.gameType === "custom" && can("servers.config", "servers.manage") && (
          <TabsContent value="scaling">
            <ScalingTab server={server} />
          </TabsContent>
        )}

        {can("servers.config", "servers.manage") && (
          <TabsContent value="database">
            <DatabaseTab server={server} />
          </TabsContent>
        )}

        {can("servers.config", "servers.manage") && (
          <TabsContent value="git">
            <GitTab server={server} />
          </TabsContent>
        )}

        {(!server.visibility || server.visibility.settings !== false) && (
          <TabsContent value="settings" className="space-y-4">
            {isProfiledGame(server.gameType) && <GameSettingsCard server={server} gameType={server.gameType} canEdit={can("servers.config", "servers.manage")} />}
            <SettingsTab server={server} />
            <ServerAccessCards server={server} />
          </TabsContent>
        )}
      </Tabs>
    </PageShell>
    </ServerPermissionsContext.Provider>
  );
}

function ConsoleTab({ serverId, isRunning }: { serverId: string; isRunning: boolean }) {
  const [command, setCommand] = useState("");
  const [logs, setLogs] = useState<ConsoleLog[]>([]);
  const [filter, setFilter] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [connected, setConnected] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const wsRef = useRef<WebSocket | null>(null);
  const { toast } = useToast();
  const MAX_LINES = 2000;

  useEffect(() => {
    let closedByUs = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setLogs([]);
        ws.send(JSON.stringify({ type: "subscribe", serverId }));
      };
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.serverId !== serverId) return;
        if (data.type === "history") {
          setLogs(data.logs);
        } else if (data.type === "log") {
          setLogs((prev) => {
            const next = [...prev, data.log];
            return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
          });
        } else if (data.type === "status") {
          queryClient.invalidateQueries({ queryKey: ["/api/servers", serverId] });
          queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
        } else if (data.type === "command_error") {
          toast({ title: "Command failed", description: data.error, variant: "destructive" });
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closedByUs) retryTimer = setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      closedByUs = true;
      if (retryTimer) clearTimeout(retryTimer);
      wsRef.current?.close();
    };
  }, [serverId]);

  useEffect(() => {
    if (scrollRef.current && autoScroll) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const sendCommand = () => {
    const value = command.trim();
    if (!value || !isRunning) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast({ title: "Console disconnected", description: "Reconnecting, try again in a moment", variant: "destructive" });
      return;
    }
    ws.send(JSON.stringify({ type: "command", serverId, command: value }));
    setLogs((prev) => [...prev, { timestamp: Date.now(), message: `> ${value}`, type: "system" }]);
    setHistory((prev) => [value, ...prev.filter((c) => c !== value)].slice(0, 50));
    setHistoryIndex(-1);
    setCommand("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      sendCommand();
    } else if (e.key === "ArrowUp" && history.length > 0) {
      e.preventDefault();
      const index = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(index);
      setCommand(history[index]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const index = historyIndex - 1;
      setHistoryIndex(Math.max(index, -1));
      setCommand(index >= 0 ? history[index] : "");
    }
  };

  const clearLogs = () => {
    setLogs([]);
    toast({ title: "Logs cleared", description: "Console logs have been cleared" });
  };

  const saveLogs = () => {
    const logText = logs.map(log => 
      `[${new Date(log.timestamp).toLocaleString()}] ${log.type.toUpperCase()}: ${stripAnsi(log.message)}`
    ).join("\n");
    
    const blob = new Blob([logText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `server-${serverId}-logs-${new Date().toISOString()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Logs saved", description: "Console logs have been saved to file" });
  };

  const copyLogs = () => {
    const logText = logs.map(log => 
      `[${new Date(log.timestamp).toLocaleString()}] ${log.type.toUpperCase()}: ${stripAnsi(log.message)}`
    ).join("\n");
    
    navigator.clipboard.writeText(logText);
    toast({ title: "Logs copied", description: "Console logs have been copied to clipboard" });
  };

  const filteredLogs = filter
    ? logs.filter(log => stripAnsi(log.message).toLowerCase().includes(filter.toLowerCase()))
    : logs;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Filter output" value={filter} onChange={(e) => setFilter(e.target.value)} className="h-9 pl-9" />
        </div>
        <span className="text-sm tabular-nums text-muted-foreground">
          {filter ? `${filteredLogs.length} of ${logs.length} lines` : `${logs.length} lines`}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant={autoScroll ? "secondary" : "ghost"} size="sm" onClick={() => setAutoScroll(!autoScroll)} aria-pressed={autoScroll}>
            Follow output
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copyLogs} disabled={logs.length === 0} aria-label="Copy output">
            <Copy />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={saveLogs} disabled={logs.length === 0} aria-label="Download output">
            <Download />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={clearLogs} disabled={logs.length === 0} aria-label="Clear output">
            <Trash />
          </Button>
        </div>
      </div>

      {/* Терминал всегда тёмный: вывод игровых серверов рассчитан на тёмный фон. */}
      <div className="overflow-hidden rounded-lg border border-[hsl(214_18%_17%)] bg-[hsl(213_26%_8%)]">
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2 text-xs text-[hsl(215_14%_62%)]">
          <span className="status-led" style={{ ["--led" as string]: connected ? "hsl(157 57% 46%)" : "hsl(215 11% 45%)" }} />
          {connected ? (isRunning ? "Connected to the server" : "Connected, server is not running") : "Connecting…"}
        </div>
        <div
          ref={scrollRef}
          className="h-[min(60vh,32rem)] overflow-y-auto px-4 py-3 font-mono text-[13px] leading-relaxed text-[hsl(216_22%_88%)]"
          data-testid="console-output"
          onScroll={() => {
            if (scrollRef.current) {
              const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
              const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10;
              if (!isAtBottom && autoScroll) setAutoScroll(false);
            }
          }}
        >
          {filteredLogs.length === 0 ? (
            <div className="text-[hsl(215_11%_50%)]">
              {filter
                ? "No lines match the filter."
                : !connected
                  ? "Connecting to the console…"
                  : isRunning
                    ? "Waiting for output…"
                    : "The server is stopped. Start it to see its output here."}
            </div>
          ) : (
            filteredLogs.map((log, i) => (
              <div key={i} className="whitespace-pre-wrap break-words">
                <span className="select-none text-[hsl(215_11%_45%)]">{new Date(log.timestamp).toLocaleTimeString()} </span>
                <span
                  className={
                    log.type === "error"
                      ? "text-[hsl(0_80%_70%)]"
                      : log.type === "warn"
                        ? "text-[hsl(40_90%_65%)]"
                        : log.type === "system"
                          ? "text-[hsl(157_50%_62%)]"
                          : undefined
                  }
                >
                  <AnsiText text={log.message} />
                </span>
              </div>
            ))
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-white/[0.06] px-3 py-2">
          <span className="select-none pl-1 font-mono text-sm text-[hsl(157_50%_62%)]">&gt;</span>
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isRunning ? "Type a command and press Enter" : "Start the server to send commands"}
            disabled={!isRunning}
            className="h-9 flex-1 bg-transparent font-mono text-sm text-[hsl(216_22%_92%)] placeholder:text-[hsl(215_11%_45%)] focus:outline-none disabled:cursor-not-allowed"
            aria-label="Console command"
            data-testid="input-command"
          />
          <Button size="sm" onClick={sendCommand} disabled={!isRunning || !command.trim()} data-testid="button-send-command">
            <Send /> Send
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Use the ↑ and ↓ keys to repeat previous commands.</p>
    </div>
  );
}

function FilesTab({ serverId }: { serverId: string }) {
  const [currentPath, setCurrentPath] = useState("/data");
  const { data: files, isLoading, error: filesError, refetch } = useQuery<FileEntry[]>({
    queryKey: ["/api/servers", serverId, "files", currentPath],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/servers/${serverId}/files?path=${encodeURIComponent(currentPath)}`);
      return response.json();
    },
  });

  const { toast } = useToast();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<FileEntry | null>(null);
  const [folderName, setFolderName] = useState("");
  const [renameTarget, setRenameTarget] = useState<FileEntry | null>(null);
  const [newName, setNewName] = useState("");
  const [editingFile, setEditingFile] = useState<FileEntry | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [editorLoading, setEditorLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [compressOpen, setCompressOpen] = useState(false);
  const [archiveName, setArchiveName] = useState("");
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [dropping, setDropping] = useState(false);

  useEffect(() => {
    setSelected(new Set());
    setSearchText("");
    setSearchQuery("");
  }, [currentPath]);

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchText.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const searching = searchQuery.length >= 2;
  const { data: searchResult, isFetching: searchLoading, error: searchError } = useQuery<{ files: FileEntry[]; truncated: boolean }>({
    queryKey: ["/api/servers", serverId, "files-search", currentPath, searchQuery],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/servers/${serverId}/files/search?path=${encodeURIComponent(currentPath)}&q=${encodeURIComponent(searchQuery)}`);
      return response.json();
    },
    enabled: searching,
  });

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await apiRequest("POST", `/api/servers/${serverId}/files/upload?path=${encodeURIComponent(currentPath)}`, formData);
      return response.json();
    },
    onError: (error: any) => {
      toast({ title: "File not uploaded", description: error.message || "Check the file size and try again", variant: "destructive" });
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest("POST", `/api/servers/${serverId}/files/folder`, { name, path: currentPath });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Folder created", description: "Folder has been created successfully" });
      setFolderDialogOpen(false);
      setFolderName("");
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "Creation failed", description: error.message || "Failed to create folder", variant: "destructive" });
    },
  });

  const renameMutation = useMutation({
    mutationFn: async ({ fromPath, newName }: { fromPath: string; newName: string }) => {
      const response = await apiRequest("PATCH", `/api/servers/${serverId}/files/rename`, { fromPath, newName });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Renamed", description: "File renamed successfully" });
      setRenameDialogOpen(false);
      setRenameTarget(null);
      setNewName("");
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "Rename failed", description: error.message || "Failed to rename file", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (path: string) => {
      const response = await apiRequest("DELETE", `/api/servers/${serverId}/files?path=${encodeURIComponent(path)}`, {});
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Deleted", description: `${deleteTarget?.name ?? "Entry"} was deleted` });
      setDeleteTarget(null);
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "Delete failed", description: error.message || "Failed to delete entry", variant: "destructive" });
    },
  });

  const compressMutation = useMutation({
    mutationFn: async ({ names, archiveName }: { names: string[]; archiveName: string }) => {
      const response = await apiRequest("POST", `/api/servers/${serverId}/files/compress`, { path: currentPath, names, archiveName });
      return response.json();
    },
    onSuccess: (data: { path: string }) => {
      toast({ title: "Archive created", description: data.path });
      setCompressOpen(false);
      setSelected(new Set());
      refetch();
    },
    onError: (error: any) => toast({ title: "Archive not created", description: error.message, variant: "destructive" }),
  });

  const extractMutation = useMutation({
    mutationFn: async (path: string) => {
      const response = await apiRequest("POST", `/api/servers/${serverId}/files/extract`, { path });
      return response.json();
    },
    onSuccess: (data: { path: string }) => {
      toast({ title: "Archive extracted", description: `Files are in ${data.path}` });
      refetch();
    },
    onError: (error: any) => toast({ title: "Archive not extracted", description: error.message, variant: "destructive" }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (names: string[]) => {
      const failed: string[] = [];
      for (const name of names) {
        try {
          await apiRequest("DELETE", `/api/servers/${serverId}/files?path=${encodeURIComponent(`${currentPath}/${name}`)}`, {});
        } catch {
          failed.push(name);
        }
      }
      return { deleted: names.length - failed.length, failed };
    },
    onSuccess: ({ deleted, failed }) => {
      if (failed.length) toast({ title: `${failed.length} not deleted`, description: failed.join(", "), variant: "destructive" });
      if (deleted) toast({ title: deleted === 1 ? "1 item deleted" : `${deleted} items deleted` });
      setBulkDeleteOpen(false);
      setSelected(new Set());
      refetch();
    },
  });

  const saveFileMutation = useMutation({
    mutationFn: async ({ path, content }: { path: string; content: string }) => {
      const response = await apiRequest("PUT", `/api/servers/${serverId}/files/content`, { path, content });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Saved", description: `${editingFile?.name} has been saved` });
      setEditingFile(null);
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "Save failed", description: error.message || "Failed to save file", variant: "destructive" });
    },
  });

  const openEditor = async (file: FileEntry) => {
    setEditorLoading(true);
    try {
      const response = await apiRequest("GET", `/api/servers/${serverId}/files/content?path=${encodeURIComponent(file.path)}`);
      const data = await response.json();
      setEditorContent(data.content);
      setEditingFile(file);
    } catch (error: any) {
      toast({ title: "Cannot open file", description: error.message || "Failed to read file", variant: "destructive" });
    } finally {
      setEditorLoading(false);
    }
  };

  const downloadFile = async (path: string, name: string) => {
    try {
      const response = await fetch(`/api/servers/${serverId}/files/download?path=${encodeURIComponent(path)}`, {
        credentials: "include",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ message: "Failed to download file" }));
        throw new Error(data.message || "Failed to download file");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({ title: "Download failed", description: error.message || "Failed to download file", variant: "destructive" });
    }
  };

  /** Загружает файлы в открытую папку по одному; возвращает число успешно загруженных. */
  const uploadFiles = async (list: File[]) => {
    let uploaded = 0;
    for (const file of list) {
      const formData = new FormData();
      formData.append("file", file);
      try {
        await uploadMutation.mutateAsync(formData);
        uploaded += 1;
      } catch {
      }
    }
    if (uploaded > 0) {
      toast({ title: uploaded === 1 ? "File uploaded" : `${uploaded} files uploaded`, description: `Saved to ${currentPath}` });
      refetch();
    }
    return uploaded;
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    if ((await uploadFiles(selectedFiles)) > 0) {
      setUploadDialogOpen(false);
      setSelectedFiles([]);
    }
  };

  const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  const handleDrop = async (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    setDragActive(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length === 0 || dropping) return;
    setDropping(true);
    try {
      await uploadFiles(dropped);
    } finally {
      setDropping(false);
    }
  };

  const handleCreateFolder = () => {
    if (!folderName.trim()) return;
    createFolderMutation.mutate(folderName.trim());
  };

  const navigateToFolder = (name: string) => setCurrentPath(`${currentPath}/${name}`);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const crumbs = currentPath
    .split("/")
    .filter(Boolean)
    .map((part, index, parts) => ({ label: index === 0 ? "Server files" : part, path: `/${parts.slice(0, index + 1).join("/")}` }));
  const sortedFiles = [...(files ?? [])].sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "directory" ? -1 : 1));
  const canEdit = (file: FileEntry) => file.type === "file" && file.size <= 2 * 1024 * 1024;
  const isArchive = (file: FileEntry) => file.type === "file" && /\.(zip|tar|tar\.gz|tgz)$/i.test(file.name);
  const toggleSelected = (name: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(name);
      else next.delete(name);
      return next;
    });
  const allSelected = sortedFiles.length > 0 && sortedFiles.every((f) => selected.has(f.name));
  const openSearchResult = (file: FileEntry) => {
    if (file.type === "directory") {
      setCurrentPath(file.path);
      return;
    }
    setCurrentPath(file.path.slice(0, file.path.lastIndexOf("/")));
    if (canEdit(file)) openEditor(file);
  };

  return (
    <div
      className="relative space-y-3"
      onDragOver={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) setDragActive(false);
      }}
      onDrop={handleDrop}
    >
      {(dragActive || dropping) && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-background/85 text-sm font-medium">
          {dropping ? "Uploading…" : <>Drop files to upload them to <span className="ml-1 font-mono">{currentPath}</span></>}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex min-w-0 flex-wrap items-center gap-1 text-sm" aria-label="Current folder">
          {crumbs.map((crumb, index) => (
            <span key={crumb.path} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              {index === crumbs.length - 1 ? (
                <span className="font-medium">{crumb.label}</span>
              ) : (
                <button className="rounded-sm text-muted-foreground hover:text-foreground" onClick={() => setCurrentPath(crumb.path)}>
                  {crumb.label}
                </button>
              )}
            </span>
          ))}
        </nav>
        <div className="flex flex-wrap gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Find files in this folder"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="h-9 pl-9 pr-8"
              aria-label="Find files by name"
            />
            {searchText && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm text-muted-foreground hover:text-foreground" onClick={() => setSearchText("")} aria-label="Clear search">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => setFolderDialogOpen(true)} data-testid="button-new-folder">
            <Folder /> New folder
          </Button>
          <Button size="sm" onClick={() => setUploadDialogOpen(true)} data-testid="button-upload-file">
            <Upload /> Upload
          </Button>
        </div>
      </div>

      {selected.size > 0 && !searching && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium tabular-nums">{selected.size} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const names = Array.from(selected);
                setArchiveName(names.length === 1 ? names[0].replace(/\.[^.]+$/, "") : "archive");
                setCompressOpen(true);
              }}
            >
              <FileArchive /> Compress to .zip
            </Button>
            <Button variant="outline" size="sm" className="text-destructive" onClick={() => setBulkDeleteOpen(true)}>
              <Trash /> Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
          </div>
        </div>
      )}

      {searching ? (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="border-b px-4 py-2.5 text-xs text-muted-foreground">
            {searchLoading
              ? "Searching…"
              : searchError
                ? (searchError as Error).message
                : `${searchResult?.files.length ?? 0} ${searchResult?.files.length === 1 ? "match" : "matches"} for “${searchQuery}” in ${currentPath}${searchResult?.truncated ? " (showing the first 200)" : ""}`}
          </div>
          <ul className="max-h-[32rem] divide-y overflow-y-auto">
            {(searchResult?.files ?? []).map((file) => (
              <li key={file.path}>
                <button
                  className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-muted/40"
                  onClick={() => openSearchResult(file)}
                  title={file.type === "file" && !canEdit(file) ? "Opens the folder that holds this file" : undefined}
                >
                  {file.type === "directory" ? <Folder className="h-4 w-4 shrink-0 fill-primary/15 text-primary" /> : <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 truncate font-mono text-[13px]">{file.name}</span>
                  {file.type === "file" && <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{formatFileSize(file.size)}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      ) : filesError ? (
        <EmptyState
          icon={FolderOpen}
          title="This folder cannot be opened"
          description={(filesError as Error).message}
          action={
            <Button variant="outline" size="sm" onClick={() => setCurrentPath("/data")}>
              Back to server files
            </Button>
          }
        />
      ) : sortedFiles.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="This folder is empty"
          description="Drop files here, upload them, or connect over SFTP to copy many files at once."
          action={
            <Button size="sm" onClick={() => setUploadDialogOpen(true)}>
              <Upload /> Upload
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="hidden grid-cols-[minmax(0,1fr)_6rem_11rem_9.5rem] gap-4 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground sm:grid">
            <span className="flex items-center gap-3">
              <Checkbox
                checked={allSelected ? true : selected.size > 0 ? "indeterminate" : false}
                onCheckedChange={(on) => setSelected(on === true ? new Set(sortedFiles.map((f) => f.name)) : new Set())}
                aria-label="Select all"
              />
              Name
            </span>
            <span className="text-right">Size</span>
            <span>Modified</span>
            <span />
          </div>
          <ul className="max-h-[32rem] divide-y overflow-y-auto">
            {crumbs.length > 1 && (
              <li>
                <button
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-muted-foreground hover:bg-muted/40"
                  onClick={() => setCurrentPath(crumbs[crumbs.length - 2].path)}
                >
                  <ChevronLeft className="h-4 w-4" /> Up one level
                </button>
              </li>
            )}
            {sortedFiles.map((file) => (
              <li
                key={file.path}
                className={`group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-2 hover:bg-muted/40 sm:grid-cols-[minmax(0,1fr)_6rem_11rem_9.5rem] ${selected.has(file.name) ? "bg-primary/5" : ""}`}
                data-testid={`file-${file.name}`}
              >
                <div className="flex min-w-0 items-center gap-3">
                <Checkbox checked={selected.has(file.name)} onCheckedChange={(on) => toggleSelected(file.name, on === true)} aria-label={`Select ${file.name}`} />
                <button
                  className="flex min-w-0 items-center gap-3 text-left text-sm disabled:cursor-default"
                  onClick={() => (file.type === "directory" ? navigateToFolder(file.name) : canEdit(file) && openEditor(file))}
                  disabled={file.type === "file" && (!canEdit(file) || editorLoading)}
                  title={file.type === "file" && !canEdit(file) ? "Too large to edit here — download it instead" : undefined}
                >
                  {file.type === "directory" ? (
                    <Folder className="h-4 w-4 shrink-0 fill-primary/15 text-primary" />
                  ) : (
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{file.name}</span>
                </button>
                </div>
                <span className="hidden text-right text-sm tabular-nums text-muted-foreground sm:block">
                  {file.type === "directory" ? "—" : formatFileSize(file.size)}
                </span>
                <span className="hidden truncate text-sm text-muted-foreground sm:block">{new Date(file.modified).toLocaleString()}</span>
                <div className="flex justify-end gap-0.5 sm:opacity-0 sm:transition-opacity sm:focus-within:opacity-100 sm:group-hover:opacity-100">
                  {isArchive(file) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Extract ${file.name}`}
                      title="Extract here"
                      disabled={extractMutation.isPending}
                      onClick={() => extractMutation.mutate(file.path)}
                    >
                      <PackageOpen />
                    </Button>
                  )}
                  {file.type === "file" && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Download ${file.name}`} onClick={() => downloadFile(file.path, file.name)}>
                      <Download />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={`Rename ${file.name}`}
                    onClick={() => {
                      setRenameTarget(file);
                      setNewName(file.name);
                      setRenameDialogOpen(true);
                    }}
                  >
                    <Edit />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label={`Delete ${file.name}`} onClick={() => setDeleteTarget(file)}>
                    <Trash />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={uploadDialogOpen} onOpenChange={(open) => { setUploadDialogOpen(open); if (!open) setSelectedFiles([]); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload files</DialogTitle>
            <DialogDescription>
              Files are saved to <span className="font-mono">{currentPath}</span>. Files with the same name are replaced.
            </DialogDescription>
          </DialogHeader>
          <Input type="file" multiple onChange={(e) => setSelectedFiles(Array.from(e.target.files ?? []))} />
          {selectedFiles.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {selectedFiles.length === 1 ? selectedFiles[0].name : `${selectedFiles.length} files`}, {formatFileSize(selectedFiles.reduce((sum, f) => sum + f.size, 0))}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={uploadMutation.isPending || selectedFiles.length === 0}>
              {uploadMutation.isPending ? "Uploading…" : "Upload"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>
              Created inside <span className="font-mono">{currentPath}</span>
            </DialogDescription>
          </DialogHeader>
          <Input value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="Folder name" autoFocus onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFolderDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder} disabled={createFolderMutation.isPending || !folderName.trim()}>
              {createFolderMutation.isPending ? "Creating…" : "Create folder"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editingFile !== null} onOpenChange={(open) => !open && setEditingFile(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{editingFile?.name}</DialogTitle>
            <DialogDescription className="font-mono text-xs">{editingFile?.path}</DialogDescription>
          </DialogHeader>
          <CodeEditor value={editorContent} onChange={setEditorContent} fileName={editingFile?.name ?? ""} className="h-[60vh]" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditingFile(null)}>
              Close without saving
            </Button>
            <Button onClick={() => editingFile && saveFileMutation.mutate({ path: editingFile.path, content: editorContent })} disabled={saveFileMutation.isPending}>
              <Save /> {saveFileMutation.isPending ? "Saving…" : "Save file"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename {renameTarget?.name}</DialogTitle>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && renameTarget && newName.trim() && renameMutation.mutate({ fromPath: renameTarget.path, newName: newName.trim() })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => renameTarget && newName.trim() && renameMutation.mutate({ fromPath: renameTarget.path, newName: newName.trim() })}
              disabled={renameMutation.isPending || !newName.trim()}
            >
              {renameMutation.isPending ? "Renaming…" : "Rename"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={compressOpen} onOpenChange={setCompressOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Compress {selected.size === 1 ? Array.from(selected)[0] : `${selected.size} items`}</DialogTitle>
            <DialogDescription>
              The .zip archive is saved in <span className="font-mono">{currentPath}</span>
            </DialogDescription>
          </DialogHeader>
          <Input
            value={archiveName}
            onChange={(e) => setArchiveName(e.target.value)}
            placeholder="Archive name"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && archiveName.trim() && compressMutation.mutate({ names: Array.from(selected), archiveName: archiveName.trim() })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCompressOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => compressMutation.mutate({ names: Array.from(selected), archiveName: archiveName.trim() })} disabled={compressMutation.isPending || !archiveName.trim()}>
              {compressMutation.isPending ? "Compressing…" : "Compress"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} selected {selected.size === 1 ? "item" : "items"}?</AlertDialogTitle>
            <AlertDialogDescription>Folders are deleted with everything inside them. Restore from a backup if you need them back.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkDeleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                bulkDeleteMutation.mutate(Array.from(selected));
              }}
            >
              {bulkDeleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "directory" ? "The folder and everything inside it will be deleted." : "The file will be deleted."} Restore from a backup if you need it back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.path)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatsTab({ server, stats }: { server: Server; stats?: ServerStats }) {
  const { toast } = useToast();

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const exportStats = () => {
    if (!stats) {
      toast({ title: "No data", description: "No statistics available to export", variant: "destructive" });
      return;
    }

    const statsData = {
      timestamp: new Date().toISOString(),
      server: {
        id: server.id,
        name: server.name,
        gameType: server.gameType,
      },
      resources: {
        cpu: {
          usage: stats.cpuUsage,
          limit: server.cpuLimit,
          unit: "%",
        },
        memory: {
          usage: stats.ramUsage,
          limit: server.ramLimit,
          unit: "GB",
        },
        disk: {
          usage: stats.diskUsage,
          limit: server.diskLimit,
          unit: "GB",
        },
      },
      network: {
        rx: stats.networkRx,
        tx: stats.networkTx,
        rxFormatted: formatBytes(stats.networkRx),
        txFormatted: formatBytes(stats.networkTx),
      },
      uptime: {
        seconds: stats.uptime,
        formatted: formatUptime(stats.uptime),
      },
    };

    const blob = new Blob([JSON.stringify(statsData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `server-${server.id}-stats-${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Statistics exported", description: "Statistics have been exported to JSON file" });
  };

  const [range, setRange] = useState<"day" | "week">("day");
  const { data: history = [] } = useQuery<{ t: number; cpu: number; ram: number; disk: number }[]>({
    queryKey: [`/api/servers/${server.id}/history?range=${range}`],
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <SectionHeader
          title="Load history"
          description={range === "day" ? "Last 24 hours, 5-minute averages" : "Last 7 days, 30-minute averages"}
          actions={
            <div className="flex rounded-md border p-0.5">
              {(["day", "week"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`rounded px-3 py-1 text-sm ${range === r ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {r === "day" ? "24 hours" : "7 days"}
                </button>
              ))}
            </div>
          }
        />
        <div className="grid gap-6 rounded-lg border bg-card p-5 lg:grid-cols-2">
          <HistoryChart label="CPU" unit="%" max={server.cpuLimit} points={history.map((p) => ({ t: p.t, value: p.cpu }))} />
          <HistoryChart label="Memory" unit="GB" max={server.ramLimit} points={history.map((p) => ({ t: p.t, value: p.ram }))} format={(v) => v.toFixed(2)} color="hsl(var(--info))" />
        </div>
      </section>

      {stats ? (
        <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
          {[
            { label: "Uptime", value: formatUptime(stats.uptime) },
            { label: "Data received", value: formatBytes(stats.networkRx) },
            { label: "Data sent", value: formatBytes(stats.networkTx) },
          ].map((item) => (
            <div key={item.label} className="bg-card px-5 py-4">
              <div className="text-sm text-muted-foreground">{item.label}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{item.value}</div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={BarChart3} title="No live data" description="Uptime and network traffic appear while the server is running." />
      )}

      <section className="space-y-3">
        <SectionHeader
          title="Limits"
          description="What this server may use on its node. Change them on the Settings tab."
          actions={
            stats && (
              <Button variant="outline" size="sm" onClick={exportStats}>
                <Download /> Export as JSON
              </Button>
            )
          }
        />
        <dl className="divide-y rounded-lg border bg-card text-sm">
          {[
            { label: "CPU", value: `${server.cpuLimit}% of the node`, used: stats ? `${stats.cpuUsage.toFixed(1)}% now` : null },
            { label: "Memory", value: `${server.ramLimit} GB`, used: stats ? `${stats.ramUsage.toFixed(2)} GB now` : null },
            { label: "Disk", value: `${server.diskLimit} GB`, used: stats ? `${stats.diskUsage.toFixed(2)} GB now` : null },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="text-right tabular-nums">
                <span className="font-medium">{row.value}</span>
                {row.used && <span className="ml-3 text-muted-foreground">{row.used}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function SettingsTab({ server }: { server: Server }) {
  const { toast } = useToast();
  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState(server.name);
  const [port, setPort] = useState(server.port);
  const [cpuLimit, setCpuLimit] = useState(server.cpuLimit);
  const [ramLimit, setRamLimit] = useState(server.ramLimit);
  const [diskLimit, setDiskLimit] = useState(server.diskLimit);
  const [crashRestart, setCrashRestart] = useState<boolean>(Boolean((server.config as any)?.crashRestart?.enabled));
  const [crashAttempts, setCrashAttempts] = useState<number>(Number((server.config as any)?.crashRestart?.maxAttempts) || 3);
  const [autoStart, setAutoStart] = useState(server.autoStart);
  
  const config = server.config as any || {};
  const startupSettings = config.startupSettings || {};
  const [jarFile, setJarFile] = useState(startupSettings.jarFile || "server.jar");
  const [javaVersion, setJavaVersion] = useState(startupSettings.javaVersion || "Auto");
  const [garbageCollector, setGarbageCollector] = useState(startupSettings.garbageCollector || "UseG1GC");
  const [timeZone, setTimeZone] = useState(startupSettings.timeZone || "Europe/Moscow");
  const [memoryPercent, setMemoryPercent] = useState(startupSettings.memoryPercent || 95);
  const [minMemory, setMinMemory] = useState(startupSettings.minMemory || "128M");
  const [additionalArgs, setAdditionalArgs] = useState(startupSettings.additionalArgs || "");
  const [startupCommand, setStartupCommand] = useState(startupSettings.startupCommand || "");
  const [dockerImage, setDockerImage] = useState(startupSettings.dockerImage || "");
  const [serverType, setServerType] = useState(startupSettings.serverType || "VANILLA");
  const [gameVersion, setGameVersion] = useState(startupSettings.version || "LATEST");
  const runtimeId: string | undefined = startupSettings.runtime;
  const usesJava = server.gameType === "minecraft" || (server.gameType === "custom" && (!runtimeId || runtimeId === "java"));
  const runtimeName = runtimeId === "image" ? "Other Docker image" : findRuntime(runtimeId)?.name ?? "Java (JAR)";

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<Server>) => {
      return apiRequest("PATCH", `/api/servers/${server.id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servers", server.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
      toast({ title: "Settings updated", description: "Server settings have been updated successfully" });
      setEditMode(false);
    },
    onError: (error: any) => {
      toast({ title: "Update failed", description: error.message || "Failed to update settings", variant: "destructive" });
    },
  });

  const handleSave = () => {
    const config = server.config as any || {};
    updateMutation.mutate({
      name,
      port,
      cpuLimit,
      ramLimit,
      diskLimit,
      autoStart,
      config: {
        ...config,
        crashRestart: { enabled: crashRestart, maxAttempts: crashAttempts },
        startupSettings: {
          ...(runtimeId ? { runtime: runtimeId } : {}),
          jarFile,
          javaVersion,
          garbageCollector,
          timeZone,
          memoryPercent,
          minMemory,
          additionalArgs,
          startupCommand,
          dockerImage,
          serverType,
          version: gameVersion,
        },
      },
    });
  };

  const handleCancel = () => {
    setName(server.name);
    setPort(server.port);
    setCpuLimit(server.cpuLimit);
    setRamLimit(server.ramLimit);
    setDiskLimit(server.diskLimit);
    setAutoStart(server.autoStart);
    setCrashRestart(Boolean((server.config as any)?.crashRestart?.enabled));
    setCrashAttempts(Number((server.config as any)?.crashRestart?.maxAttempts) || 3);
    const config = server.config as any || {};
    const startupSettings = config.startupSettings || {};
    setJarFile(startupSettings.jarFile || "server.jar");
    setJavaVersion(startupSettings.javaVersion || "Auto");
    setGarbageCollector(startupSettings.garbageCollector || "UseG1GC");
    setTimeZone(startupSettings.timeZone || "Europe/Moscow");
    setMemoryPercent(startupSettings.memoryPercent || 95);
    setMinMemory(startupSettings.minMemory || "128M");
    setAdditionalArgs(startupSettings.additionalArgs || "");
    setStartupCommand(startupSettings.startupCommand || "");
    setDockerImage(startupSettings.dockerImage || "");
    setServerType(startupSettings.serverType || "VANILLA");
    setGameVersion(startupSettings.version || "LATEST");
    setEditMode(false);
  };

  return (
    <div className="space-y-8 rounded-lg border bg-card p-5 sm:p-6">
      <SectionHeader
        title="Server settings"
        description={editMode ? "Changes to the image, ports, limits or startup apply after a restart." : undefined}
        actions={
          !editMode && (
            <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
              <Edit /> Edit settings
            </Button>
          )
        }
      />
      <div className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Server Name</Label>
            {editMode ? (
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Server name"
              />
            ) : (
              <p className="font-medium">{server.name}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Game Type</Label>
            <p className="font-medium">{GAME_LABELS[server.gameType] ?? server.gameType}</p>
          </div>
          <div className="space-y-2">
            <Label>Port</Label>
            {editMode ? (
              <Input
                type="number"
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value) || 0)}
                min="1"
                max="65535"
              />
            ) : (
              <p className="font-mono">{server.port}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Auto Start</Label>
            {editMode ? (
              <label className="flex items-center gap-3">
                <Switch checked={autoStart} onCheckedChange={setAutoStart} />
                <span className="text-sm text-muted-foreground">Start the server when the panel starts</span>
              </label>
            ) : (
              <p className="font-medium">{server.autoStart ? "Enabled" : "Disabled"}</p>
            )}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Restart after a crash</Label>
            {editMode ? (
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-3">
                  <Switch checked={crashRestart} onCheckedChange={setCrashRestart} />
                  <span className="text-sm text-muted-foreground">Start the server again if it stops with an error, up to</span>
                </label>
                <Input type="number" min={1} max={20} value={crashAttempts} onChange={(e) => setCrashAttempts(Math.min(20, Math.max(1, parseInt(e.target.value) || 1)))} className="h-8 w-20" disabled={!crashRestart} />
                <span className="text-sm text-muted-foreground">times in a row</span>
              </div>
            ) : (
              <p className="font-medium">
                {(server.config as any)?.crashRestart?.enabled ? `On, up to ${(server.config as any).crashRestart.maxAttempts} times in a row` : "Off"}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-base font-semibold">Resource limits</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>CPU Limit</Label>
              {editMode ? (
                <div className="space-y-2">
                  <Input
                    type="number"
                    value={cpuLimit}
                    onChange={(e) => setCpuLimit(parseInt(e.target.value) || 0)}
                    min="10"
                    max="100"
                  />
                  <p className="text-xs text-muted-foreground">{cpuLimit}%</p>
                </div>
              ) : (
                <p className="font-medium">{server.cpuLimit}%</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>RAM Limit</Label>
              {editMode ? (
                <div className="space-y-2">
                  <Input
                    type="number"
                    value={ramLimit}
                    onChange={(e) => setRamLimit(parseInt(e.target.value) || 0)}
                    min="1"
                    max="32"
                  />
                  <p className="text-xs text-muted-foreground">{ramLimit} GB</p>
                </div>
              ) : (
                <p className="font-medium">{server.ramLimit} GB</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Disk Limit</Label>
              {editMode ? (
                <div className="space-y-2">
                  <Input
                    type="number"
                    value={diskLimit}
                    onChange={(e) => setDiskLimit(parseInt(e.target.value) || 0)}
                    min="5"
                    max="100"
                  />
                  <p className="text-xs text-muted-foreground">{diskLimit} GB</p>
                </div>
              ) : (
                <p className="font-medium">{server.diskLimit} GB</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t">
          <h3 className="text-base font-semibold">Startup</h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Docker Image (optional - overrides the default image)</Label>
              {editMode ? (
                <Input value={dockerImage} onChange={(e) => setDockerImage(e.target.value)} placeholder="Default image" />
              ) : (
                <p className="font-mono text-sm">{dockerImage || "Default"}</p>
              )}
            </div>
            {server.gameType === "custom" && (
              <div className="space-y-2">
                <Label>Runtime</Label>
                <p className="text-sm">{runtimeName}</p>
              </div>
            )}
            {server.gameType === "minecraft" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Server Type</Label>
                  {editMode ? (
                    <Select value={serverType} onValueChange={setServerType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["VANILLA", "PAPER", "PURPUR", "SPIGOT", "FABRIC", "FORGE", "NEOFORGE", "QUILT", "CUSTOM"].map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm">{serverType}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Minecraft Version</Label>
                  {editMode ? (
                    <Input value={gameVersion} onChange={(e) => setGameVersion(e.target.value)} placeholder="LATEST or 1.21.1" />
                  ) : (
                    <p className="font-mono text-sm">{gameVersion}</p>
                  )}
                </div>
              </div>
            )}
            {/* Java-specific settings for Minecraft and Custom servers */}
            {usesJava && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Для Minecraft ядро скачивает образ itzg по типу и версии; свой JAR используется только при типе CUSTOM. */}
                  {server.gameType === "custom" || serverType === "CUSTOM" ? (
                    <div className="space-y-2">
                      <Label>JAR File</Label>
                      {editMode ? (
                        <Input
                          value={jarFile}
                          onChange={(e) => setJarFile(e.target.value)}
                          placeholder="server.jar"
                        />
                      ) : (
                        <p className="font-mono text-sm">{jarFile}</p>
                      )}
                      <p className="text-xs text-muted-foreground">A file in the root of the server folder (upload it on the Files tab)</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>Server Core</Label>
                      <p className="text-sm text-muted-foreground">
                        Downloaded automatically for {serverType} {gameVersion || "LATEST"}. To run your own JAR, choose Server Type CUSTOM.
                      </p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Java Version</Label>
                    {editMode ? (
                      <Select value={javaVersion} onValueChange={setJavaVersion}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Auto">Auto (by Minecraft version)</SelectItem>
                          <SelectItem value="Java 8">Java 8</SelectItem>
                          <SelectItem value="Java 11">Java 11</SelectItem>
                          <SelectItem value="Java 17">Java 17</SelectItem>
                          <SelectItem value="Java 21">Java 21</SelectItem>
                          <SelectItem value="Java 25">Java 25</SelectItem>
                          {/* Версия, выбранная при создании из полного списка реестра, может отсутствовать в коротком списке. */}
                          {!["Auto", "Java 8", "Java 11", "Java 17", "Java 21", "Java 25"].includes(javaVersion) && (
                            <SelectItem value={javaVersion}>{javaVersion}</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm">{javaVersion === "Auto" ? "Auto (by Minecraft version)" : javaVersion}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Garbage Collector</Label>
                    {editMode ? (
                      <Select value={garbageCollector} onValueChange={setGarbageCollector}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="UseSerialGC">UseSerialGC</SelectItem>
                          <SelectItem value="UseG1GC">UseG1GC</SelectItem>
                          <SelectItem value="UseZGC">UseZGC</SelectItem>
                          <SelectItem value="UseParallelGC">UseParallelGC</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm font-mono">{garbageCollector}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Memory Percent (%)</Label>
                    {editMode ? (
                      <Input
                        type="number"
                        value={memoryPercent}
                        onChange={(e) => setMemoryPercent(parseInt(e.target.value) || 95)}
                        min="1"
                        max="100"
                      />
                    ) : (
                      <p className="text-sm">{memoryPercent}%</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Min Memory</Label>
                    {editMode ? (
                      <Input
                        value={minMemory}
                        onChange={(e) => setMinMemory(e.target.value)}
                        placeholder="128M"
                      />
                    ) : (
                      <p className="text-sm font-mono">{minMemory}</p>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Additional JVM Arguments</Label>
                  {editMode ? (
                    <Textarea
                      value={additionalArgs}
                      onChange={(e) => setAdditionalArgs(e.target.value)}
                      placeholder="Additional JVM arguments"
                      rows={3}
                    />
                  ) : (
                    <p className="text-sm font-mono whitespace-pre-wrap">{additionalArgs || "None"}</p>
                  )}
                </div>
              </>
            )}
            
            {/* Common settings for all game types */}
            <div className="space-y-2">
              <Label>Time Zone</Label>
              {editMode ? (
                <Input
                  value={timeZone}
                  onChange={(e) => setTimeZone(e.target.value)}
                  placeholder="Europe/Moscow"
                />
              ) : (
                <p className="text-sm">{timeZone}</p>
              )}
            </div>
            
            {/* Additional arguments for non-Java servers */}
            {(server.gameType !== "minecraft" && server.gameType !== "custom") && (
              <div className="space-y-2">
                <Label>Additional Arguments</Label>
                {editMode ? (
                  <Textarea
                    value={additionalArgs}
                    onChange={(e) => setAdditionalArgs(e.target.value)}
                    placeholder="Additional command line arguments"
                    rows={3}
                  />
                ) : (
                  <p className="text-sm font-mono whitespace-pre-wrap">{additionalArgs || "None"}</p>
                )}
              </div>
            )}
            
            {/* Custom startup command (available for all game types) */}
            <div className="space-y-2">
              <Label>Custom Startup Command (optional - overrides auto-generated command)</Label>
              {editMode ? (
                <Textarea
                  value={startupCommand}
                  onChange={(e) => setStartupCommand(e.target.value)}
                  placeholder={runtimeId === "image" ? "Leave empty to use the image's own command" : "Custom startup command (leave empty to use auto-generated command based on game type)"}
                  rows={4}
                  className="font-mono text-xs"
                />
              ) : (
                <p className="text-sm font-mono whitespace-pre-wrap bg-muted p-2 rounded">{startupCommand || (runtimeId === "image" ? "Image default" : "Auto-generated based on game type")}</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t">
          <h3 className="text-base font-semibold">System information</h3>
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
              <Label className="text-muted-foreground">Server ID</Label>
              <p className="font-mono mt-1 text-xs">{server.id}</p>
          </div>
          <div>
              <Label className="text-muted-foreground">Container ID</Label>
              <p className="font-mono mt-1 text-xs">{server.containerId || "Not created"}</p>
          </div>
          <div>
              <Label className="text-muted-foreground">Status</Label>
              <div className="mt-1">
                <StatusBadge status={server.status} />
          </div>
          </div>
          <div>
              <Label className="text-muted-foreground">Created</Label>
              <p className="font-medium mt-1">{new Date(server.createdAt).toLocaleString()}</p>
          </div>
          </div>
        </div>
      </div>

      {/* Панель сохранения прилипает к низу экрана, пока форма длинная. */}
      {editMode && (
        <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 rounded-b-lg border-t bg-card/95 px-5 py-3 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6">
          <Button variant="outline" onClick={handleCancel} disabled={updateMutation.isPending}>
            Discard changes
          </Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            <Save /> {updateMutation.isPending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      )}
    </div>
  );
}

interface Backup {
  id: string;
  serverId: string;
  name: string;
  description?: string | null;
  size: number;
  path: string;
  createdAt: string;
}

function BackupsTab({ serverId, server }: { serverId: string; server: Server }) {
  const can = useCan();
  const { data: backups = [], refetch } = useQuery<Backup[]>({
    queryKey: ["/api/servers", serverId, "backups"],
  });
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [backupName, setBackupName] = useState("");
  const [backupDescription, setBackupDescription] = useState("");
  const [confirm, setConfirm] = useState<{ action: "restore" | "delete"; backup: Backup } | null>(null);

  const createBackupMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/servers/${serverId}/backups`, { name: backupName, description: backupDescription });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Backup created", description: "Backup has been created successfully" });
      setCreateDialogOpen(false);
      setBackupName("");
      setBackupDescription("");
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "Failed to create backup", description: error.message || "An error occurred", variant: "destructive" });
    },
  });

  const restoreBackupMutation = useMutation({
    mutationFn: async (backupId: string) => {
      const response = await apiRequest("POST", `/api/servers/${serverId}/backups/${backupId}/restore`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Backup restored", description: "Backup has been restored successfully" });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "Failed to restore backup", description: error.message || "An error occurred", variant: "destructive" });
    },
  });

  const deleteBackupMutation = useMutation({
    mutationFn: async (backupId: string) => {
      const response = await apiRequest("DELETE", `/api/servers/${serverId}/backups/${backupId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Backup deleted", description: "Backup has been deleted successfully" });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete backup", description: error.message || "An error occurred", variant: "destructive" });
    },
  });

  const maxBackups = server.limits?.maxBackups;
  const defaultName = () => `backup-${new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "")}`;
  const formatSize = (bytes: number) => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`);

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Backups"
        description={
          maxBackups !== undefined
            ? `${backups.length} of ${maxBackups} kept. When the limit is reached, the oldest backup is removed.`
            : "A full copy of the server files. Restoring stops the server for a moment."
        }
        actions={
          <Button
            size="sm"
            onClick={() => {
              setBackupName(defaultName());
              setCreateDialogOpen(true);
            }}
          >
            <Database /> Create backup
          </Button>
        }
      />

      <BackupScheduleCard serverId={serverId} canManage={can("servers.backups", "backups.manage")} />

      {backups.length === 0 ? (
        <EmptyState icon={Database} title="No backups yet" description="Create one before updates or big changes, or turn on automatic backups above." />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {backups.map((backup) => (
            <li key={backup.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{backup.name}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(backup.createdAt).toLocaleString()}, {formatSize(backup.size)}
                  {backup.description ? `. ${backup.description}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" asChild aria-label={`Download ${backup.name}`}>
                  <a href={`/api/servers/${serverId}/backups/${backup.id}/download`} download>
                    <Download />
                  </a>
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirm({ action: "restore", backup })} disabled={restoreBackupMutation.isPending}>
                  <RotateCw /> Restore
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setConfirm({ action: "delete", backup })} aria-label={`Delete ${backup.name}`}>
                  <Trash />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create backup</DialogTitle>
            <DialogDescription>All server files are packed into one archive on the panel host.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={backupName} onChange={(e) => setBackupName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Input value={backupDescription} onChange={(e) => setBackupDescription(e.target.value)} placeholder="Before updating to 1.21" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => createBackupMutation.mutate()} disabled={createBackupMutation.isPending || !backupName.trim()}>
                {createBackupMutation.isPending ? "Creating…" : "Create backup"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === "restore" ? `Restore ${confirm.backup.name}?` : `Delete ${confirm?.backup.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === "restore"
                ? "The server is stopped, its current files are replaced with this backup, and it is started again if it was running."
                : "The archive is deleted from the panel host. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirm?.action === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
              onClick={() => {
                if (!confirm) return;
                if (confirm.action === "restore") restoreBackupMutation.mutate(confirm.backup.id);
                else deleteBackupMutation.mutate(confirm.backup.id);
                setConfirm(null);
              }}
            >
              {confirm?.action === "restore" ? "Restore backup" : "Delete backup"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface ServerPort {
  id: string;
  serverId: string;
  port: number;
  protocol: string;
  name?: string | null;
  description?: string | null;
  isPublic: boolean;
  createdAt: string;
}

function PortsTab({ serverId, server }: { serverId: string; server: Server }) {
  const { data: ports = [], refetch } = useQuery<ServerPort[]>({
    queryKey: ["/api/servers", serverId, "ports"],
  });
  const { toast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<ServerPort | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [portNumber, setPortNumber] = useState("");
  const [protocol, setProtocol] = useState<"tcp" | "udp">("tcp");
  const [portName, setPortName] = useState("");
  const [portDescription, setPortDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);

  const createPortMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/servers/${serverId}/ports`, {
          port: parseInt(portNumber),
          protocol,
          name: portName || null,
          description: portDescription || null,
          isPublic,
        });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Port added", description: "Port has been added successfully" });
      setCreateDialogOpen(false);
      setPortNumber("");
      setPortName("");
      setPortDescription("");
      setIsPublic(false);
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "Failed to add port", description: error.message || "An error occurred", variant: "destructive" });
    },
  });

  const deletePortMutation = useMutation({
    mutationFn: async (portId: string) => {
      const response = await apiRequest("DELETE", `/api/servers/${serverId}/ports/${portId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Port deleted", description: "Port has been deleted successfully" });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete port", description: error.message || "An error occurred", variant: "destructive" });
    },
  });

  const maxPorts = server.limits?.maxPorts;
  const canCreatePort = maxPorts === undefined || ports.length < maxPorts;
  const portValid = Boolean(portNumber) && parseInt(portNumber) >= 1 && parseInt(portNumber) <= 65535;

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Ports"
        description={
          maxPorts !== undefined
            ? `${ports.length} of ${maxPorts} extra ports used. New ports open after the next restart.`
            : "Extra ports for RCON, queries, voice chat or web maps. New ports open after the next restart."
        }
        actions={
          <Button size="sm" onClick={() => setCreateDialogOpen(true)} disabled={!canCreatePort}>
            <Network /> Add port
          </Button>
        }
      />

      <ul className="divide-y rounded-lg border bg-card">
        <li className="flex items-center gap-4 px-4 py-3">
          <span className="w-28 font-mono text-sm font-medium">{server.port}/tcp</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Main port</p>
            <p className="text-xs text-muted-foreground">Players and clients connect here. Change it on the Settings tab.</p>
          </div>
        </li>
        {ports.map((port) => (
          <li key={port.id} className="flex items-center gap-4 px-4 py-3">
            <span className="w-28 font-mono text-sm font-medium">
              {port.port}/{port.protocol.toLowerCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {port.name || "Extra port"}
                {port.isPublic && <Badge variant="outline" className="ml-2 px-1.5 py-0 text-[11px]">Public</Badge>}
              </p>
              {port.description && <p className="truncate text-xs text-muted-foreground">{port.description}</p>}
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(port)} aria-label={`Remove port ${port.port}`}>
              <Trash />
            </Button>
          </li>
        ))}
      </ul>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add port</DialogTitle>
            <DialogDescription>The port is published on the node after the server restarts. Open it in the node firewall too.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <div className="space-y-2">
                <Label>Port</Label>
                <Input type="number" value={portNumber} onChange={(e) => setPortNumber(e.target.value)} placeholder="25575" min="1" max="65535" />
              </div>
              <div className="space-y-2">
                <Label>Protocol</Label>
                <Select value={protocol} onValueChange={(v) => setProtocol(v as "tcp" | "udp")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tcp">TCP</SelectItem>
                    <SelectItem value="udp">UDP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Name (optional)</Label>
              <Input value={portName} onChange={(e) => setPortName(e.target.value)} placeholder="RCON" />
            </div>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Input value={portDescription} onChange={(e) => setPortDescription(e.target.value)} placeholder="Remote console for admins" />
            </div>
            <label className="flex items-center justify-between gap-4 text-sm">
              <span>
                Public port
                <span className="block text-xs text-muted-foreground">Reachable from the internet, not only from the node</span>
              </span>
              <Switch checked={isPublic} onCheckedChange={setIsPublic} />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => createPortMutation.mutate()} disabled={createPortMutation.isPending || !portValid}>
                {createPortMutation.isPending ? "Adding…" : "Add port"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove port {deleteTarget?.port}?</AlertDialogTitle>
            <AlertDialogDescription>The port closes after the next restart of the server.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) deletePortMutation.mutate(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Remove port
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface SftpUser {
  id: string;
  serverId: string;
  username: string;
  homeDirectory: string;
  isActive: boolean;
  createdAt: string;
}

function SftpTab({ serverId, server }: { serverId: string; server: Server }) {
  const { data: sftpUsers = [], refetch } = useQuery<SftpUser[]>({
    queryKey: ["/api/servers", serverId, "sftp"],
  });
  const { data: node } = useQuery<Node>({
    queryKey: ["/api/nodes", server.nodeId],
  });
  const { toast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<SftpUser | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SftpUser | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [homeDirectory, setHomeDirectory] = useState("/data");
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editHomeDirectory, setEditHomeDirectory] = useState("/data");
  const [editIsActive, setEditIsActive] = useState(true);

  const createSftpUserMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/servers/${serverId}/sftp`, { username, password, homeDirectory });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "SFTP user created", description: "SFTP user has been created successfully" });
      setCreateDialogOpen(false);
      setUsername("");
      setPassword("");
      setHomeDirectory("/data");
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "Failed to create SFTP user", description: error.message || "An error occurred", variant: "destructive" });
    },
  });

  const updateSftpUserMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: { username?: string; password?: string; homeDirectory?: string; isActive?: boolean } }) => {
      const payload: any = {};
      if (data.username !== undefined) payload.username = data.username;
      if (data.password !== undefined && data.password.length > 0) payload.password = data.password;
      if (data.homeDirectory !== undefined) payload.homeDirectory = data.homeDirectory;
      if (data.isActive !== undefined) payload.isActive = data.isActive;

      const response = await apiRequest("PUT", `/api/servers/${serverId}/sftp/${userId}`, payload);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "SFTP user updated", description: "SFTP user has been updated successfully" });
      setEditDialogOpen(false);
      setEditingUser(null);
      setEditUsername("");
      setEditPassword("");
      setEditHomeDirectory("/data");
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "Failed to update SFTP user", description: error.message || "An error occurred", variant: "destructive" });
    },
  });

  const deleteSftpUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("DELETE", `/api/servers/${serverId}/sftp/${userId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "SFTP user deleted", description: "SFTP user has been deleted successfully" });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete SFTP user", description: error.message || "An error occurred", variant: "destructive" });
    },
  });

  const handleEdit = (user: SftpUser) => {
    setEditingUser(user);
    setEditUsername(user.username);
    setEditPassword("");
    setEditHomeDirectory(user.homeDirectory);
    setEditIsActive(user.isActive);
    setEditDialogOpen(true);
  };

  const maxSftpUsers = server.limits?.maxSftpUsers;
  const canCreateUser = maxSftpUsers === undefined || sftpUsers.length < maxSftpUsers;
  const host = node && ["127.0.0.1", "localhost", "::1", "local"].includes(node.ip) ? window.location.hostname : node?.ip;
  const sftpPort = (server.config as { sftpPort?: number } | null)?.sftpPort;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <SectionHeader title="Connection" description="Use FileZilla, WinSCP or any SFTP client to copy many files at once." />
        <dl className="grid gap-px overflow-hidden rounded-lg border bg-border text-sm sm:grid-cols-3">
          {[
            { label: "Host", value: host ?? "—" },
            { label: "Port", value: sftpPort ? String(sftpPort) : "Assigned with the first user" },
            { label: "Protocol", value: "SFTP" },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-2 bg-card px-4 py-3">
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{item.label}</dt>
                <dd className="truncate font-mono">{item.value}</dd>
              </div>
              {item.label !== "Protocol" && /^[\w.:-]+$/.test(item.value) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  aria-label={`Copy ${item.label.toLowerCase()}`}
                  onClick={() => {
                    navigator.clipboard.writeText(item.value);
                    toast({ title: `${item.label} copied` });
                  }}
                >
                  <Copy />
                </Button>
              )}
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">The port must be open in the firewall of the node.</p>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="SFTP accounts"
          description={maxSftpUsers !== undefined ? `${sftpUsers.length} of ${maxSftpUsers} accounts used` : "Each account sees only the files of this server."}
          actions={
            <Button size="sm" onClick={() => setCreateDialogOpen(true)} disabled={!canCreateUser}>
              <Key /> Add account
            </Button>
          }
        />
        {sftpUsers.length === 0 ? (
          <EmptyState icon={Key} title="No SFTP accounts" description="Add an account to connect with an SFTP client." />
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {sftpUsers.map((user) => (
              <li key={user.id} className="flex items-center gap-4 px-4 py-3">
                <StatusLed status={user.isActive ? "running" : "stopped"} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm">{user.username}</p>
                  <p className="text-xs text-muted-foreground">
                    {user.isActive ? "Active" : "Disabled"}, folder <span className="font-mono">{user.homeDirectory}</span>
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(user)} aria-label={`Edit ${user.username}`}>
                  <Edit />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(user)} aria-label={`Delete ${user.username}`}>
                  <Trash />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add SFTP account</DialogTitle>
            <DialogDescription>Login and password for an SFTP client.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="builder" autoComplete="off" />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="space-y-2">
              <Label>Folder</Label>
              <Input value={homeDirectory} onChange={(e) => setHomeDirectory(e.target.value)} placeholder="/data" className="font-mono" />
              <p className="text-xs text-muted-foreground">The account cannot leave this folder. /data is the whole server.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => createSftpUserMutation.mutate()} disabled={createSftpUserMutation.isPending || !username.trim() || !password.trim()}>
                {createSftpUserMutation.isPending ? "Adding…" : "Add account"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {editingUser && (
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit {editingUser.username}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Username</Label>
                <Input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} autoComplete="off" />
              </div>
              <div className="space-y-2">
                <Label>New password</Label>
                <Input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="Leave empty to keep the current one" autoComplete="new-password" />
              </div>
              <div className="space-y-2">
                <Label>Folder</Label>
                <Input value={editHomeDirectory} onChange={(e) => setEditHomeDirectory(e.target.value)} className="font-mono" />
              </div>
              <label className="flex items-center justify-between gap-4 text-sm">
                <span>
                  Account active
                  <span className="block text-xs text-muted-foreground">A disabled account cannot connect</span>
                </span>
                <Switch checked={editIsActive} onCheckedChange={setEditIsActive} />
              </label>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() =>
                    updateSftpUserMutation.mutate({
                      userId: editingUser.id,
                      data: { username: editUsername, password: editPassword, homeDirectory: editHomeDirectory, isActive: editIsActive },
                    })
                  }
                  disabled={updateSftpUserMutation.isPending || !editUsername.trim()}
                >
                  {updateSftpUserMutation.isPending ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.username}?</AlertDialogTitle>
            <AlertDialogDescription>The account can no longer connect. Server files are not touched.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) deleteSftpUserMutation.mutate(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Delete account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface ServerVariable {
  key: string;
  value: string;
  secret?: boolean;
  hasValue?: boolean;
}

/** Переменные окружения: токены ботов, строки подключения к базе, настройки приложения. */
function VariablesTab({ server }: { server: Server }) {
  const { toast } = useToast();
  const { data: saved = [], isLoading } = useQuery<ServerVariable[]>({ queryKey: [`/api/servers/${server.id}/variables`] });
  const [rows, setRows] = useState<ServerVariable[] | null>(null);
  const list = rows ?? saved;
  const dirty = rows !== null;

  const save = useMutation({
    mutationFn: async () => (await apiRequest("PUT", `/api/servers/${server.id}/variables`, { variables: list.filter((v) => v.key.trim()) })).json(),
    onSuccess: (data: ServerVariable[]) => {
      queryClient.setQueryData([`/api/servers/${server.id}/variables`], data);
      queryClient.invalidateQueries({ queryKey: ["/api/servers", server.id] });
      setRows(null);
      toast({ title: "Variables saved", description: server.status === "running" ? "Restart the server to apply them." : "They apply on the next start." });
    },
    onError: (error: any) => toast({ title: "Variables not saved", description: error.message, variant: "destructive" }),
  });

  const update = (index: number, patch: Partial<ServerVariable>) => setRows(list.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Variables"
        description="Environment variables the server process sees: bot tokens, database passwords, app settings. Secret values are hidden after saving."
        actions={
          <Button variant="outline" size="sm" onClick={() => setRows([...list, { key: "", value: "", secret: false }])}>
            <Plus /> Add variable
          </Button>
        }
      />

      {isLoading ? (
        <Skeleton className="h-24" />
      ) : list.length === 0 ? (
        <EmptyState icon={Key} title="No variables" description="For example BOT_TOKEN for a Telegram bot or DATABASE_URL for a website." />
      ) : (
        <div className="rounded-lg border bg-card">
          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_5.5rem_2.5rem] gap-3 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground sm:grid">
            <span>Name</span>
            <span>Value</span>
            <span>Secret</span>
            <span />
          </div>
          <ul className="divide-y">
            {list.map((row, index) => (
              <li key={index} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_5.5rem_2.5rem] sm:items-center">
                <Input
                  value={row.key}
                  onChange={(e) => update(index, { key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })}
                  placeholder="BOT_TOKEN"
                  className="font-mono"
                  aria-label="Variable name"
                />
                <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive sm:order-last" onClick={() => setRows(list.filter((_, i) => i !== index))} aria-label={`Remove ${row.key || "variable"}`}>
                  <Trash />
                </Button>
                <Input
                  value={row.value}
                  onChange={(e) => update(index, { value: e.target.value })}
                  type={row.secret ? "password" : "text"}
                  placeholder={row.secret && row.hasValue ? "Saved — type to replace" : "value"}
                  className="col-span-2 font-mono sm:col-span-1"
                  autoComplete="off"
                  aria-label={`Value of ${row.key || "variable"}`}
                />
                <label className="col-span-2 flex items-center gap-2 text-sm text-muted-foreground sm:col-span-1">
                  <Switch checked={Boolean(row.secret)} onCheckedChange={(secret) => update(index, { secret })} />
                  <span className="sm:hidden">Secret</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {dirty && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setRows(null)}>
            Discard changes
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save /> {save.isPending ? "Saving…" : "Save variables"}
          </Button>
        </div>
      )}
    </div>
  );
}

interface GitView {
  url: string;
  branch: string;
  hasToken: boolean;
  webhookSecret: string;
  webhookUrl: string;
  restartAfterDeploy: boolean;
  lastDeploy?: { at: string; ok: boolean; commit?: string; message: string };
}

/** Деплой кода бота или сайта из репозитория: вручную или автоматически по вебхуку при каждом push. */
function GitTab({ server }: { server: Server }) {
  const { toast } = useToast();
  const queryKey = [`/api/servers/${server.id}/git`];
  const { data: git, isLoading } = useQuery<GitView | null>({ queryKey });
  const [form, setForm] = useState<{ url: string; branch: string; token: string; restartAfterDeploy: boolean } | null>(null);
  const editing = form !== null || git === null;
  const values = form ?? { url: git?.url ?? "", branch: git?.branch ?? "main", token: "", restartAfterDeploy: git?.restartAfterDeploy ?? true };

  const save = useMutation({
    mutationFn: async (extra: { regenerateSecret?: boolean } = {}) => (await apiRequest("PUT", `/api/servers/${server.id}/git`, { ...values, ...extra })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setForm(null);
      toast({ title: "Repository saved" });
    },
    onError: (error: any) => toast({ title: "Not saved", description: error.message, variant: "destructive" }),
  });
  const deploy = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/servers/${server.id}/git/deploy`, {})).json(),
    onSuccess: (data: { commit: string }) => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Deployed", description: data.commit });
    },
    onError: (error: any) => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Deploy failed", description: error.message, variant: "destructive" });
    },
  });
  const disconnect = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/servers/${server.id}/git`),
    onSuccess: () => {
      queryClient.setQueryData(queryKey, null);
      toast({ title: "Repository disconnected", description: "Server files were not changed." });
    },
  });
  const copy = (text: string, what: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${what} copied` });
  };

  if (isLoading) return <Skeleton className="h-40" />;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <SectionHeader
          title="Repository"
          description="Code from the repository is copied into the server folder. Files that are not in the repository, such as databases or .env, stay untouched."
          actions={
            git && !form && (
              <Button size="sm" onClick={() => deploy.mutate()} disabled={deploy.isPending}>
                <Download /> {deploy.isPending ? "Deploying…" : "Deploy now"}
              </Button>
            )
          }
        />
        {editing ? (
          <div className="space-y-4 rounded-lg border bg-card p-5">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
              <div className="space-y-1.5">
                <Label>Repository address</Label>
                <Input value={values.url} onChange={(e) => setForm({ ...values, url: e.target.value })} placeholder="https://github.com/you/telegram-bot.git" className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label>Branch</Label>
                <Input value={values.branch} onChange={(e) => setForm({ ...values, branch: e.target.value })} className="font-mono" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Access token (for private repositories)</Label>
              <Input
                type="password"
                value={values.token}
                onChange={(e) => setForm({ ...values, token: e.target.value })}
                placeholder={git?.hasToken ? "Saved — type to replace" : "Leave empty for a public repository"}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">GitHub: Settings → Developer settings → Fine-grained tokens, read access to Contents.</p>
            </div>
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={values.restartAfterDeploy} onCheckedChange={(restartAfterDeploy) => setForm({ ...values, restartAfterDeploy })} />
              Restart the server after each deploy if it is running
            </label>
            <div className="flex justify-end gap-2">
              {git && (
                <Button variant="outline" onClick={() => setForm(null)}>
                  Cancel
                </Button>
              )}
              <Button onClick={() => save.mutate({})} disabled={save.isPending || !values.url.trim()}>
                {save.isPending ? "Saving…" : git ? "Save repository" : "Connect repository"}
              </Button>
            </div>
          </div>
        ) : (
          git && (
            <div className="divide-y rounded-lg border bg-card text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="min-w-0 truncate font-mono">
                  {git.url} <span className="text-muted-foreground">({git.branch})</span>
                </span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setForm({ url: git.url, branch: git.branch, token: "", restartAfterDeploy: git.restartAfterDeploy })}>
                    <Edit /> Change
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => disconnect.mutate()}>
                    Disconnect
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <StatusLed status={!git.lastDeploy ? "stopped" : git.lastDeploy.ok ? "running" : "error"} />
                <span className="min-w-0 flex-1 truncate">
                  {git.lastDeploy ? git.lastDeploy.message : "Not deployed yet"}
                  {git.lastDeploy && <span className="ml-2 text-xs text-muted-foreground">{new Date(git.lastDeploy.at).toLocaleString()}</span>}
                </span>
              </div>
            </div>
          )
        )}
      </section>

      {git && !form && (
        <section className="space-y-3">
          <SectionHeader title="Automatic deploys" description="Add this webhook to the repository and every push to the branch deploys the server." />
          <dl className="divide-y rounded-lg border bg-card text-sm">
            {[
              { label: "Payload URL", value: git.webhookUrl },
              { label: "Secret", value: git.webhookSecret },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-3 px-4 py-3">
                <dt className="w-28 shrink-0 text-muted-foreground">{row.label}</dt>
                <dd className="min-w-0 flex-1 truncate font-mono text-xs">{row.value}</dd>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copy(row.value, row.label)} aria-label={`Copy ${row.label}`}>
                  <Copy />
                </Button>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">
            GitHub: repository Settings → Webhooks → Add webhook, content type application/json, paste the URL and the secret. GitLab: Settings → Webhooks, put the secret into “Secret
            token”. The webhook only works if the panel is reachable from the internet.
          </p>
          <Button variant="outline" size="sm" onClick={() => save.mutate({ regenerateSecret: true })} disabled={save.isPending}>
            Generate a new secret
          </Button>
        </section>
      )}
    </div>
  );
}

/**
 * Адрес, который игроки и клиенты вводят для подключения. Если у локальной ноды не задан публичный адрес,
 * подставляется адрес, по которому открыта панель, — обычно это тот же сервер.
 */
function ConnectAddress({ host, port, gameType }: { host: string | null; port: number; gameType: string }) {
  const { toast } = useToast();
  const hostname = host ?? window.location.hostname;
  const address = `${hostname}:${port}`;
  const profile = isProfiledGame(gameType) ? GAME_PROFILES[gameType] : null;
  const howTo = profile?.connect.replace("{address}", address).replace("{query}", `${hostname}:${port + (profile.queryOffset ?? 0)}`);
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      Address
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-0.5 font-mono text-sm text-foreground hover:bg-muted"
        onClick={() => navigator.clipboard?.writeText(address).then(() => toast({ title: "Address copied", description: address }))}
        title={host ? "Copy the address" : "This is the panel's address. Set the public address of the node on the Nodes page if players connect elsewhere."}
      >
        <span translate="no">{address}</span>
        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {profile?.steamConnect && (
        <a href={`steam://connect/${address}`} className="text-sm text-primary hover:underline">
          Join via Steam
        </a>
      )}
      {howTo && <span className="basis-full text-xs text-muted-foreground">{howTo}</span>}
    </span>
  );
}
