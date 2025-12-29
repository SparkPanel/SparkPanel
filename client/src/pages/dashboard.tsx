import { useQuery } from "@tanstack/react-query";
import { StatCard } from "@/components/stat-card";
import { Server, HardDrive, Activity, Cpu } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResourceMeter } from "@/components/resource-meter";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import type { Server as ServerType, Node, ServerStats, NodeStats } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: servers, isLoading: serversLoading } = useQuery<ServerType[]>({
    queryKey: ["/api/servers"],
  });

  const { data: nodes, isLoading: nodesLoading } = useQuery<Node[]>({
    queryKey: ["/api/nodes"],
  });

  const { data: serverStats } = useQuery<Record<string, ServerStats>>({
    queryKey: ["/api/stats/servers"],
    refetchInterval: 5000,
  });

  const { data: nodeStats } = useQuery<Record<string, NodeStats>>({
    queryKey: ["/api/stats/nodes"],
    refetchInterval: 5000,
  });

  const runningServers = servers?.filter((s) => s.status === "running").length || 0;
  const totalServers = servers?.length || 0;
  const onlineNodes = nodes?.filter((n) => n.status === "online").length || 0;
  const totalNodes = nodes?.length || 0;

  // Calculate total resource usage across all nodes
  const totalCpuUsage = nodes && nodeStats
    ? nodes.reduce((acc, node) => {
        const stats = nodeStats[node.id];
        return acc + (stats?.cpuUsage || 0);
      }, 0) / (nodes.length || 1)
    : 0;

  const totalRamUsage = nodes && nodeStats
    ? nodes.reduce((acc, node) => {
        const stats = nodeStats[node.id];
        return acc + (stats?.ramUsage || 0);
      }, 0)
    : 0;

  const totalRamAvailable = nodes
    ? nodes.reduce((acc, node) => acc + node.ramTotal, 0)
    : 0;

  if (serversLoading || nodesLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of your game servers and infrastructure
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Servers"
          value={totalServers}
          icon={Server}
          description={`${runningServers} running`}
        />
        <StatCard
          title="Active Nodes"
          value={onlineNodes}
          icon={HardDrive}
          description={`${totalNodes} total`}
        />
        <StatCard
          title="CPU Usage"
          value={`${totalCpuUsage.toFixed(1)}%`}
          icon={Cpu}
          description="Average across nodes"
        />
        <StatCard
          title="Memory Usage"
          value={`${((totalRamUsage / totalRamAvailable) * 100).toFixed(1)}%`}
          icon={Activity}
          description={`${totalRamUsage.toFixed(1)} / ${totalRamAvailable.toFixed(1)} GB`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
            <div>
              <CardTitle>Recent Servers</CardTitle>
              <CardDescription>Your most recently created servers</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm" data-testid="button-view-all-servers">
              <Link href="/servers">View All</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {!servers || servers.length === 0 ? (
              <div className="text-center py-8">
                <Server className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground mb-4">No servers yet</p>
                <Button asChild size="sm" data-testid="button-create-first-server">
                  <Link href="/servers">Create Server</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {servers.slice(0, 5).map((server) => {
                  const stats = serverStats?.[server.id];
                  return (
                    <Link key={server.id} href={`/servers/${server.id}`}>
                      <div className="flex items-center justify-between p-3 rounded-md border border-border hover-elevate active-elevate-2" data-testid={`server-item-${server.id}`}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex items-center justify-center w-10 h-10 rounded-md bg-muted shrink-0">
                            <Server className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{server.name}</p>
                            <p className="text-xs text-muted-foreground capitalize">{server.gameType}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {stats && (
                            <div className="text-xs text-muted-foreground hidden sm:block">
                              CPU: {stats.cpuUsage.toFixed(0)}% | RAM: {stats.ramUsage.toFixed(1)}GB
                            </div>
                          )}
                          <StatusBadge status={server.status as any} />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
            <div>
              <CardTitle>Node Status</CardTitle>
              <CardDescription>Infrastructure health overview</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm" data-testid="button-view-all-nodes">
              <Link href="/nodes">Manage</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {!nodes || nodes.length === 0 ? (
              <div className="text-center py-8">
                <HardDrive className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground mb-4">No nodes configured</p>
                <Button asChild size="sm" data-testid="button-add-first-node">
                  <Link href="/nodes">Add Node</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {nodes.slice(0, 3).map((node) => {
                  const stats = nodeStats?.[node.id];
                  return (
                    <div key={node.id} className="space-y-3 p-3 rounded-md border border-border" data-testid={`node-item-${node.id}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <HardDrive className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{node.name}</span>
                        </div>
                        <StatusBadge status={node.status as any} />
                      </div>
                      {stats && (
                        <div className="space-y-2">
                          <ResourceMeter
                            label="CPU"
                            value={stats.cpuUsage}
                            max={100}
                            unit="%"
                          />
                          <ResourceMeter
                            label="Memory"
                            value={stats.ramUsage}
                            max={node.ramTotal}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
