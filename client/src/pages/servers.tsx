import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { Server, Plus, Search, Trash2, Play, Square, RotateCw, MoreHorizontal, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusLed, StatusBadge } from "@/components/status-badge";
import { PageHeader, PageShell } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { PaginationBar, usePagination } from "@/components/pagination-bar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertServerSchema, type InsertServer, type Server as ServerType, type ServerStats, type Node, gameTypes } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useCan, useCanCreateServers } from "@/lib/use-me";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { RUNTIMES, findRuntime, type RuntimeVersion } from "@shared/runtimes";
import { GAME_LABELS, GAME_PROFILES, isProfiledGame, resolveGameSettings, type GameSettings } from "@shared/game-profiles";
import { GameSettingsFields } from "@/components/game-settings-fields";

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

/** Фильтры по состоянию: переходные состояния объединены, как на главной. */
const STATUS_FILTERS: { key: string; label: string; statuses?: string[] }[] = [
  { key: "all", label: "All" },
  { key: "running", label: "Running", statuses: ["running"] },
  { key: "starting", label: "Starting", statuses: ["starting", "stopping"] },
  { key: "stopped", label: "Stopped", statuses: ["stopped"] },
  { key: "error", label: "Errors", statuses: ["error"] },
];

type SortKey = "name" | "status" | "created";
const STATUS_ORDER: Record<string, number> = { error: 0, starting: 1, stopping: 1, running: 2, stopped: 3 };
const PAGE_SIZE = 25;

/** Сохранённые настройки сервера (GET /api/server-templates). */
interface ServerTemplate {
  id: string;
  name: string;
  gameType: InsertServer["gameType"];
  cpuLimit: number;
  ramLimit: number;
  diskLimit: number;
  config: Record<string, unknown>;
}

type PowerAction = "start" | "stop" | "restart";
const BULK_LABELS: Record<PowerAction, { verb: string; done: string; applies: (s: ServerType) => boolean }> = {
  start: { verb: "Start", done: "started", applies: (s) => s.status === "stopped" || s.status === "error" },
  stop: { verb: "Stop", done: "stopped", applies: (s) => s.status === "running" },
  restart: { verb: "Restart", done: "restarted", applies: (s) => s.status === "running" },
};

export default function ServersPage() {
  const params = new URLSearchParams(useSearch());
  const can = useCan();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(params.get("status") ?? "all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [nodeFilter, setNodeFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [dialogOpen, setDialogOpen] = useState(params.get("create") === "1");
  const [toDelete, setToDelete] = useState<ServerType | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const { data: servers = [], isLoading } = useQuery<ServerType[]>({
    queryKey: ["/api/servers"],
    refetchInterval: 5000,
  });
  const { data: stats } = useQuery<Record<string, ServerStats>>({
    queryKey: ["/api/stats/servers"],
    refetchInterval: 5000,
  });
  const canCreate = useCanCreateServers();
  const { data: panelNodes = [] } = useQuery<Node[]>({
    queryKey: ["/api/nodes"],
    enabled: can("nodes.view", "nodes.manage", "servers.manage"),
  });
  const selfService = canCreate && !can("servers.manage");
  const { data: myQuota } = useQuery<{ quota: { maxServers: number; maxRamGb: number; maxCpuPercent: number; maxDiskGb: number } | null; usage?: { servers: number; ramGb: number; cpuPercent: number; diskGb: number }; nodes?: Node[] }>({
    queryKey: ["/api/me/quota"],
    enabled: selfService,
  });
  const nodes = panelNodes.length > 0 ? panelNodes : (myQuota?.nodes ?? []);
  const nodeNames = useMemo(() => new Map(nodes.map((n) => [n.id, n.name])), [nodes]);

  const createMutation = useMutation({
    mutationFn: (data: InsertServer) => apiRequest("POST", "/api/servers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/nodes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/quota"] });
      setDialogOpen(false);
      toast({ title: "Server created", description: "Start it when you are ready — the image is downloaded on first start." });
    },
    onError: (error: any) => {
      toast({ title: "Server not created", description: error.message || "Check the form and try again", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (server: ServerType) => apiRequest("DELETE", `/api/servers/${server.id}`, {}),
    onSuccess: (_res, server) => {
      queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
      setToDelete(null);
      toast({ title: "Server deleted", description: `${server.name} and its files were removed` });
    },
    onError: (error: Error) => toast({ title: "Server not deleted", description: error.message, variant: "destructive" }),
  });

  const bulkMutation = useMutation({
    mutationFn: async (action: PowerAction) => {
      const targets = servers.filter((s) => selected.has(s.id) && BULK_LABELS[action].applies(s));
      const results = await Promise.allSettled(targets.map((s) => apiRequest("POST", `/api/servers/${s.id}/${action}`, {})));
      const failed = targets.filter((_, i) => results[i].status === "rejected").map((s) => s.name);
      return { action, ok: targets.length - failed.length, failed, skipped: selected.size - targets.length };
    },
    onSuccess: ({ action, ok, failed, skipped }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
      const parts = [`${ok} ${ok === 1 ? "server" : "servers"} ${BULK_LABELS[action].done}`];
      if (skipped) parts.push(`${skipped} skipped (already in that state)`);
      toast({ title: parts.join(", ") });
      if (failed.length) toast({ title: `${failed.length} failed`, description: failed.join(", "), variant: "destructive" });
      setSelected(new Set());
    },
  });

  const counts = useMemo(
    () => Object.fromEntries(STATUS_FILTERS.map((f) => [f.key, f.statuses ? servers.filter((s) => f.statuses!.includes(s.status)).length : servers.length])),
    [servers],
  );
  const types = useMemo(() => Array.from(new Set(servers.map((s) => s.gameType))).sort(), [servers]);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const statuses = STATUS_FILTERS.find((f) => f.key === statusFilter)?.statuses;
    const list = servers.filter(
      (s) =>
        (!statuses || statuses.includes(s.status)) &&
        (typeFilter === "all" || s.gameType === typeFilter) &&
        (nodeFilter === "all" || s.nodeId === nodeFilter) &&
        (!query || s.name.toLowerCase().includes(query) || String(s.port).includes(query) || s.id.startsWith(query)),
    );
    return list.sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "status"
          ? (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || a.name.localeCompare(b.name)
          : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [servers, searchQuery, statusFilter, typeFilter, nodeFilter, sort]);

  const pagination = usePagination(filtered, PAGE_SIZE, `${searchQuery}|${statusFilter}|${typeFilter}|${nodeFilter}|${sort}`);
  const filtersActive = searchQuery || statusFilter !== "all" || typeFilter !== "all" || nodeFilter !== "all";

  return (
    <PageShell>
      <PageHeader
        title="Servers"
        description={
          servers.length > 0 ? `${counts.running} of ${servers.length} running` : "Game servers, bots and websites, each in its own container"
        }
        actions={
          canCreate && (
            <Button onClick={() => setDialogOpen(true)} data-testid="button-create-server">
              <Plus /> New server
            </Button>
          )
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {dialogOpen && (
            <CreateServerForm
              nodes={nodes}
              onSubmit={(data) => createMutation.mutate(data)}
              isLoading={createMutation.isPending}
              quotaNote={
                selfService && myQuota?.quota && myQuota.usage
                  ? `Your quota: ${myQuota.usage.servers} of ${myQuota.quota.maxServers} servers, ${myQuota.quota.maxRamGb - myQuota.usage.ramGb} GB memory, ${myQuota.quota.maxCpuPercent - myQuota.usage.cpuPercent}% CPU and ${myQuota.quota.maxDiskGb - myQuota.usage.diskGb} GB disk left.`
                  : undefined
              }
            />
          )}
        </DialogContent>
      </Dialog>

      {servers.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Filter by status">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                role="tab"
                aria-selected={statusFilter === f.key}
                onClick={() => setStatusFilter(f.key)}
                className={cn(
                  "inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm transition-colors",
                  statusFilter === f.key ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {f.label}
                <span className={cn("tabular-nums text-xs", statusFilter === f.key ? "opacity-70" : "opacity-80")}>{counts[f.key]}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1 sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search by name, port or ID"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-servers"
              />
            </div>
            {types.length > 1 && (
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {types.map((t) => (
                    <SelectItem key={t} value={t}>
                      {GAME_LABELS[t] ?? t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {nodes.length > 1 && (
              <Select value={nodeFilter} onValueChange={setNodeFilter}>
                <SelectTrigger className="sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All nodes</SelectItem>
                  {nodes.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="sm:ml-auto sm:w-48">
                <ArrowUpDown className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Sort by name</SelectItem>
                <SelectItem value="status">Problems first</SelectItem>
                <SelectItem value="created">Newest first</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : servers.length === 0 ? (
        <EmptyState
          icon={Server}
          title="No servers yet"
          description="Create a Minecraft or other game server, a Telegram bot or a website. Each one runs in its own Docker container."
          action={
            canCreate && (
              <Button onClick={() => setDialogOpen(true)} data-testid="button-create-first-server">
                <Plus /> New server
              </Button>
            )
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No servers match"
          description="Change the search or filters to see more servers."
          action={
            filtersActive && (
              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                  setTypeFilter("all");
                  setNodeFilter("all");
                }}
              >
                Reset filters
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-2">
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <span className="font-medium tabular-nums">{selected.size} selected</span>
              <div className="ml-auto flex flex-wrap gap-2">
                {(Object.keys(BULK_LABELS) as PowerAction[]).map((action) => {
                  const Icon = action === "start" ? Play : action === "stop" ? Square : RotateCw;
                  return (
                    <Button key={action} variant="outline" size="sm" disabled={bulkMutation.isPending} onClick={() => bulkMutation.mutate(action)}>
                      <Icon /> {BULK_LABELS[action].verb}
                    </Button>
                  );
                })}
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                  Clear selection
                </Button>
              </div>
            </div>
          )}
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_8.5rem] gap-4 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground md:grid">
              <span className="flex items-center gap-3">
                {can("servers.control") && (
                  <Checkbox
                    checked={pagination.pageItems.length > 0 && pagination.pageItems.every((s) => selected.has(s.id)) ? true : selected.size > 0 ? "indeterminate" : false}
                    onCheckedChange={(on) => setSelected(on === true ? new Set(pagination.pageItems.map((s) => s.id)) : new Set())}
                    aria-label="Select all servers on this page"
                  />
                )}
                Server
              </span>
              <span>Node</span>
              <span>Port</span>
              <span>Load</span>
              <span className="text-right">Actions</span>
            </div>
            <ul className="divide-y">
              {pagination.pageItems.map((server) => (
                <ServerRow
                  key={server.id}
                  server={server}
                  stats={stats?.[server.id]}
                  nodeName={nodeNames.get(server.nodeId)}
                  canControl={can("servers.control")}
                  canDelete={can("servers.manage")}
                  onDelete={() => setToDelete(server)}
                  selected={selected.has(server.id)}
                  onSelect={(on) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (on) next.add(server.id);
                      else next.delete(server.id);
                      return next;
                    })
                  }
                />
              ))}
            </ul>
          </div>
          <PaginationBar {...pagination} setPage={pagination.setPage} noun="servers" />
        </div>
      )}

      <AlertDialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {toDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The container, all server files and its backups will be removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep server</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => toDelete && deleteMutation.mutate(toDelete)}
            >
              Delete server
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

function ServerRow({
  server,
  stats,
  nodeName,
  canControl,
  canDelete,
  onDelete,
  selected,
  onSelect,
}: {
  server: ServerType;
  stats?: ServerStats;
  nodeName?: string;
  canControl: boolean;
  canDelete: boolean;
  onDelete: () => void;
  selected: boolean;
  onSelect: (on: boolean) => void;
}) {
  const { toast } = useToast();
  const Icon = gameIcons[server.gameType] || gameIcons.custom;
  const busy = server.status === "starting" || server.status === "stopping";

  const control = useMutation({
    mutationFn: (action: "start" | "stop" | "restart") => apiRequest("POST", `/api/servers/${server.id}/${action}`, {}),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/servers"] }),
    onError: (error: Error) => toast({ title: "Action failed", description: error.message, variant: "destructive" }),
  });

  return (
    <li
      className={cn("relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/40", selected && "bg-primary/5", "md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_8.5rem]")}
      data-testid={`server-card-${server.id}`}
    >
      <div className="flex min-w-0 items-center gap-3">
      {canControl && <Checkbox checked={selected} onCheckedChange={(on) => onSelect(on === true)} aria-label={`Select ${server.name}`} className="relative z-10" />}
      <Link href={`/servers/${server.id}`} className="flex min-w-0 items-center gap-3 after:absolute after:inset-0 after:content-['']">
        <StatusLed status={server.status} />
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{server.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {GAME_LABELS[server.gameType] ?? server.gameType}
            <span className="md:hidden"> on port {server.port}</span>
          </p>
        </div>
      </Link>
      </div>
      <span className="hidden truncate text-sm text-muted-foreground md:block">{nodeName ?? "—"}</span>
      <span className="hidden font-mono text-sm md:block">{server.port}</span>
      <span className="hidden text-sm md:block">
        {server.status === "running" && stats ? (
          <span className="tabular-nums text-muted-foreground">
            <span className="text-foreground">{stats.cpuUsage.toFixed(0)}%</span> CPU,{" "}
            <span className="text-foreground">{stats.ramUsage.toFixed(1)}</span> / {server.ramLimit} GB
          </span>
        ) : (
          <StatusBadge status={server.status} />
        )}
      </span>
      {/* Кнопки лежат над ссылкой строки (relative z-10), чтобы клик по ним не открывал сервер. */}
      <div className="relative z-10 flex items-center justify-end gap-1">
        {canControl &&
          (server.status === "running" ? (
            <Button size="sm" variant="outline" onClick={() => control.mutate("stop")} disabled={control.isPending} data-testid={`button-stop-${server.id}`}>
              <Square /> Stop
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => control.mutate("start")} disabled={busy || control.isPending} data-testid={`button-start-${server.id}`}>
              <Play /> Start
            </Button>
          ))}
        {(canControl || canDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`More actions for ${server.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/servers/${server.id}`}>Open</Link>
              </DropdownMenuItem>
              {canControl && server.status === "running" && (
                <DropdownMenuItem onSelect={() => control.mutate("restart")} data-testid={`button-restart-${server.id}`}>
                  <RotateCw className="mr-2 h-4 w-4" /> Restart
                </DropdownMenuItem>
              )}
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive" data-testid={`button-delete-${server.id}`}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </li>
  );
}

function CreateServerForm({
  nodes,
  onSubmit,
  isLoading,
  quotaNote,
}: {
  nodes: Node[];
  onSubmit: (data: InsertServer) => void;
  isLoading: boolean;
  /** Остаток квоты для пользователя без servers.manage; шаблоны и диапазоны портов ему недоступны. */
  quotaNote?: string;
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

  useEffect(() => {
    if (nodes.length > 0 && !form.getValues("nodeId")) {
      form.setValue("nodeId", nodes[0].id);
    }
  }, [nodes, form]);

  const gameType = form.watch("gameType");
  const nodeId = form.watch("nodeId");
  const { data: freePort } = useQuery<{ port: number | null }>({ queryKey: ["/api/nodes", nodeId, "free-port"], enabled: Boolean(nodeId) && !quotaNote });
  const { data: templates = [] } = useQuery<ServerTemplate[]>({ queryKey: ["/api/server-templates"], enabled: !quotaNote });
  const [templateId, setTemplateId] = useState("none");
  const [gameSettings, setGameSettings] = useState<GameSettings | null>(null);
  useEffect(() => {
    if (!isProfiledGame(gameType)) return setGameSettings(null);
    setGameSettings(resolveGameSettings(gameType, null));
    if (templateId === "none") {
      const profile = GAME_PROFILES[gameType];
      form.setValue("port", profile.defaultPort);
      form.setValue("ramLimit", profile.recommended.ramGb);
      form.setValue("diskLimit", profile.recommended.diskGb);
      form.setValue("cpuLimit", profile.recommended.cpuPercent);
    }
  }, [gameType]);
  const template = templates.find((t) => t.id === templateId);

  const deleteTemplate = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/server-templates/${id}`, {}),
    onSuccess: () => {
      setTemplateId("none");
      queryClient.invalidateQueries({ queryKey: ["/api/server-templates"] });
    },
  });

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const next = templates.find((t) => t.id === id);
    if (!next) return;
    form.setValue("gameType", next.gameType);
    form.setValue("cpuLimit", next.cpuLimit);
    form.setValue("ramLimit", next.ramLimit);
    form.setValue("diskLimit", next.diskLimit);
  };
  const [runtimeId, setRuntimeId] = useState(RUNTIMES[0].id);
  const [runtimeImage, setRuntimeImage] = useState(RUNTIMES[0].versions[0].image);
  const [versionPicked, setVersionPicked] = useState(false);
  const [customImage, setCustomImage] = useState("");
  const runtime = findRuntime(runtimeId);

  const { data: versionList, isFetching: versionsLoading } = useQuery<{ versions: RuntimeVersion[]; live: boolean }>({
    queryKey: [`/api/runtimes/${runtimeId}/versions`],
    enabled: gameType === "custom" && Boolean(runtime),
    staleTime: 60 * 60 * 1000,
  });
  const versions = versionList?.versions ?? runtime?.versions ?? [];
  const latest = versions.find((v) => !v.prerelease) ?? versions[0];

  useEffect(() => {
    if (!versionPicked && latest && latest.image !== runtimeImage) setRuntimeImage(latest.image);
  }, [latest, versionPicked, runtimeImage]);

  const selectRuntime = (id: string) => {
    setRuntimeId(id);
    setVersionPicked(false);
    const next = findRuntime(id);
    if (next) setRuntimeImage(next.versions[0].image);
  };

  const pickVersion = (image: string) => {
    setVersionPicked(true);
    setRuntimeImage(image);
  };

  /** Для custom в настройки запуска сразу записываются образ и команда выбранной среды — дальше их можно менять в настройках сервера. */
  const runtimeSettings = (): Record<string, unknown> => {
    if (runtimeId === "image") return { runtime: "image", dockerImage: customImage.trim() };
    if (!runtime) return {};
    const version = versions.find((v) => v.image === runtimeImage) ?? versions[0];
    if (runtime.id === "java") return { runtime: "java", javaVersion: version.label };
    return { runtime: runtime.id, dockerImage: version.image, startupCommand: runtime.defaultCommand ?? "" };
  };

  const handleSubmit = (data: InsertServer) => {
    if (template) return onSubmit({ ...data, config: template.config });
    if (isProfiledGame(data.gameType) && gameSettings) return onSubmit({ ...data, config: { ...((data.config as Record<string, unknown>) ?? {}), gameSettings } });
    if (data.gameType !== "custom") return onSubmit(data);
    onSubmit({ ...data, config: { ...((data.config as Record<string, unknown>) ?? {}), startupSettings: runtimeSettings() } });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Create New Server</DialogTitle>
        <DialogDescription>{quotaNote ?? "Configure your game server container settings"}</DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {templates.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Start from</label>
              <Select value={templateId} onValueChange={applyTemplate}>
                <SelectTrigger data-testid="select-template">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Empty server</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {template && (
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Uses the template's image, startup command and variables. Secret variable values are not stored in templates — set them after creating the server.
                  </p>
                  <Button type="button" variant="ghost" size="sm" className="shrink-0 text-destructive" disabled={deleteTemplate.isPending} onClick={() => deleteTemplate.mutate(template.id)}>
                    Delete template
                  </Button>
                </div>
              )}
            </div>
          )}
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
                            <span>{isProfiledGame(type) ? GAME_PROFILES[type].label : GAME_LABELS[type] ?? type}</span>
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

          {isProfiledGame(gameType) && gameSettings && !template && (
            <div className="rounded-md border p-3">
              <GameSettingsFields gameType={gameType} value={gameSettings} onChange={setGameSettings} />
            </div>
          )}

          {gameType === "custom" && !template && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Runtime</label>
                <Select value={runtimeId} onValueChange={selectRuntime}>
                  <SelectTrigger data-testid="select-runtime">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RUNTIMES.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                    <SelectItem value="image">Other Docker image</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {runtime ? runtime.description : "Any image from Docker Hub or another registry, started with its own command"}
                </p>
              </div>
              {runtime ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Version</label>
                  <Select value={runtimeImage} onValueChange={pickVersion}>
                    <SelectTrigger data-testid="select-runtime-version">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {versions.map((v) => (
                        <SelectItem key={v.image} value={v.image}>
                          {v.label}
                          {v === latest && versionList?.live ? " (latest)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {versionsLoading
                      ? "Loading available versions…"
                      : versionList?.live
                        ? `${versions.length} versions available, newest first`
                        : "Registry is unavailable — showing the built-in list"}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Docker image</label>
                  <Input value={customImage} onChange={(e) => setCustomImage(e.target.value)} placeholder="e.g. redis:7-alpine" />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                The image is downloaded on first start. Upload your files in the Files tab and adjust the startup command in Settings.
              </p>
            </div>
          )}

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
                  {freePort?.port != null && field.value !== freePort.port && (
                    <button type="button" className="text-xs text-primary hover:underline" onClick={() => field.onChange(freePort.port)}>
                      Use free port {freePort.port} from this node's range
                    </button>
                  )}
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
            <Button type="submit" disabled={isLoading || nodes.length === 0 || (gameType === "custom" && runtimeId === "image" && !customImage.trim())} data-testid="button-submit-server">
              {isLoading ? "Creating..." : "Create Server"}
            </Button>
          </div>
        </form>
      </Form>
    </>
  );
}
