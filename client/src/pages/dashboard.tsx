import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { HardDrive, Server, ShieldCheck } from "lucide-react";
import type { Server as ServerType, Node, ServerStats, NodeStats } from "@shared/schema";
import { PageHeader, PageShell, SectionHeader } from "@/components/page-header";
import { NodeBoard, serverToUnit } from "@/components/node-board";
import { STATUS_META, StatusLed, type Status } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { GAME_LABELS } from "@shared/game-profiles";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** Группы состояний для полосы парка: переходные состояния объединены. */
const FLEET_GROUPS: { key: string; statuses: string[]; led: Status; label: string }[] = [
  { key: "running", statuses: ["running"], led: "running", label: "running" },
  { key: "starting", statuses: ["starting", "stopping"], led: "starting", label: "starting or stopping" },
  { key: "stopped", statuses: ["stopped"], led: "stopped", label: "stopped" },
  { key: "error", statuses: ["error"], led: "error", label: "with errors" },
];

/** Главная страница показывает только то, на что у пользователя есть права (серверы и/или ноды). */
export default function Dashboard({ permissions }: { permissions: string[] }) {
  const canServers = permissions.includes("servers.view");
  const canCreateServers = permissions.includes("servers.manage");
  const canNodes = permissions.includes("nodes.view");

  const { data: servers = [], isLoading: serversLoading } = useQuery<ServerType[]>({
    queryKey: ["/api/servers"],
    enabled: canServers,
    refetchInterval: 10000,
  });
  const { data: nodes = [], isLoading: nodesLoading } = useQuery<Node[]>({
    queryKey: ["/api/nodes"],
    enabled: canNodes,
  });
  const { data: serverStats } = useQuery<Record<string, ServerStats>>({
    queryKey: ["/api/stats/servers"],
    refetchInterval: 5000,
    enabled: canServers,
  });
  const { data: serverLoad } = useQuery<Record<string, number[]>>({
    queryKey: ["/api/stats/servers/load"],
    refetchInterval: 60000,
    enabled: canServers,
  });
  const { data: nodeStats } = useQuery<Record<string, NodeStats>>({
    queryKey: ["/api/stats/nodes"],
    refetchInterval: 5000,
    enabled: canNodes,
  });

  if (!canServers && !canNodes) {
    return (
      <PageShell>
        <PageHeader title="Overview" />
        <EmptyState icon={ShieldCheck} title="Nothing to show yet" description="Your account has no access to servers or nodes. Ask an administrator to grant permissions." />
      </PageShell>
    );
  }

  if ((canServers && serversLoading) || (canNodes && nodesLoading)) {
    return (
      <PageShell>
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-36" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </PageShell>
    );
  }

  const groups = FLEET_GROUPS.map((g) => ({ ...g, count: servers.filter((s) => g.statuses.includes(s.status)).length }));
  const failing = servers.filter((s) => s.status === "error");
  const recent = [...servers].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 6);
  const onlineNodes = nodes.filter((n) => n.status === "online").length;

  const nodeIds = canNodes ? nodes.map((n) => n.id) : Array.from(new Set(servers.map((s) => s.nodeId)));
  const boards = nodeIds.map((nodeId, index) => {
    const node = nodes.find((n) => n.id === nodeId);
    const stats = nodeStats?.[nodeId];
    const units = servers
      .filter((s) => s.nodeId === nodeId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => serverToUnit(s, serverLoad?.[s.id] ?? []));
    const footer =
      node && stats && node.status === "online" ? (
        <>
          <span>CPU {stats.cpuUsage.toFixed(0)}%</span>
          <span>
            RAM {stats.ramUsage.toFixed(1)} / {node.ramTotal} GB
          </span>
          <span>
            Disk {stats.diskUsage.toFixed(0)} / {node.diskTotal} GB
          </span>
        </>
      ) : node && node.status !== "online" ? (
        <span>Node is offline</span>
      ) : undefined;
    return {
      id: nodeId,
      title: node?.name ?? (nodeIds.length > 1 ? `Node ${index + 1}` : "Servers"),
      subtitle: node ? [node.location, node.ip].filter(Boolean).join(", ") : undefined,
      units,
      footer,
    };
  });

  return (
    <PageShell>
      <PageHeader
        title="Overview"
        description={canServers ? "What is running right now and what needs your attention" : "Health of your nodes"}
        actions={
          canCreateServers && (
            <Button asChild>
              <Link href="/servers?create=1">New server</Link>
            </Button>
          )
        }
      />

      {canServers && (
        <section className="rounded-lg border bg-card p-5" aria-label="Servers by status">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <p className="text-sm text-muted-foreground">
              <span className="mr-2 text-3xl font-semibold tabular-nums text-foreground">{servers.length}</span>
              {servers.length === 1 ? "server" : "servers"}
            </p>
            {canNodes && (
              <p className="text-sm text-muted-foreground tabular-nums">
                {onlineNodes} of {nodes.length} {nodes.length === 1 ? "node" : "nodes"} online
              </p>
            )}
          </div>

          {/* Полоса парка: доли состояний цветами светодиодов. */}
          <div className="mt-4 flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
            {servers.length > 0 &&
              groups
                .filter((g) => g.count > 0)
                .map((g) => (
                  <div
                    key={g.key}
                    className="h-full first:rounded-l-full last:rounded-r-full"
                    style={{ width: `${(g.count / servers.length) * 100}%`, background: STATUS_META[g.led].color }}
                    title={`${g.count} ${g.label}`}
                  />
                ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            {groups.map((g) => (
              <Link
                key={g.key}
                href={`/servers?status=${g.key}`}
                className="inline-flex items-center gap-2 rounded-sm text-sm text-muted-foreground hover:text-foreground"
              >
                <StatusLed status={g.led} />
                <span className="font-semibold tabular-nums text-foreground">{g.count}</span>
                {g.label}
              </Link>
            ))}
          </div>
        </section>
      )}

      {(canServers || canNodes) && (
        <section className="space-y-3">
          <SectionHeader
            title="Nodes"
            actions={
              canNodes && (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/nodes">Manage</Link>
                </Button>
              )
            }
          />
          {boards.length === 0 ? (
            <EmptyState icon={HardDrive} title="No nodes" description="A node is a machine with Docker where servers run." />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {boards.map((board) => (
                <NodeBoard
                  key={board.id}
                  title={board.title}
                  subtitle={board.subtitle}
                  units={board.units}
                  footer={board.footer}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {canServers && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <SectionHeader title="Needs attention" description={failing.length ? "These servers stopped with an error" : undefined} />
            {failing.length === 0 ? (
              <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
                <StatusLed status="running" />
                No servers with errors.
              </div>
            ) : (
              <ServerList servers={failing.slice(0, 8)} stats={serverStats} />
            )}
          </section>

          <section className="space-y-3">
            <SectionHeader
              title="Recently created"
              actions={
                servers.length > 0 && (
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/servers">All servers</Link>
                  </Button>
                )
              }
            />
            {recent.length === 0 ? (
              <EmptyState
                icon={Server}
                title="No servers yet"
                description="Create a game server, bot or website — it runs in its own Docker container."
                action={
                  canCreateServers && (
                    <Button asChild size="sm">
                      <Link href="/servers?create=1">New server</Link>
                    </Button>
                  )
                }
              />
            ) : (
              <ServerList servers={recent} stats={serverStats} />
            )}
          </section>
        </div>
      )}
    </PageShell>
  );
}

function ServerList({ servers, stats }: { servers: ServerType[]; stats?: Record<string, ServerStats> }) {
  return (
    <div className="divide-y rounded-lg border bg-card">
      {servers.map((server) => {
        const s = stats?.[server.id];
        return (
          <Link
            key={server.id}
            href={`/servers/${server.id}`}
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
            data-testid={`server-item-${server.id}`}
          >
            <StatusLed status={server.status} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{server.name}</p>
              <p className="text-xs text-muted-foreground">{GAME_LABELS[server.gameType] ?? server.gameType}</p>
            </div>
            {s && (
              <span className="hidden text-xs tabular-nums text-muted-foreground sm:block">
                CPU {s.cpuUsage.toFixed(0)}%, RAM {s.ramUsage.toFixed(1)} GB
              </span>
            )}
            <span className="font-mono text-xs text-muted-foreground">:{server.port}</span>
          </Link>
        );
      })}
    </div>
  );
}
