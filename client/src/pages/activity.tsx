
import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, HardDrive, Play, Square, Plus, Trash2, RotateCw, LogIn, KeyRound, Terminal, ShieldAlert, UserPlus, UserMinus, UserCog, User, Database, Network, Key, Settings, ShieldCheck, ShieldX, Search, Filter, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Activity as ActivityEntry, ActivityType, User as UserType, Server as ServerType } from "@shared/schema";
import type { LucideIcon } from "lucide-react";

interface EnrichedActivity extends ActivityEntry {
  performedBy?: string;
}

const iconMap: Record<ActivityType, LucideIcon> = {
  server_start: Play,
  server_stop: Square,
  server_restart: RotateCw,
  server_create: Plus,
  server_delete: Trash2,
  server_command: Terminal,
  backup_create: Database,
  backup_restore: Database,
  backup_delete: Database,
  port_create: Network,
  port_delete: Network,
  sftp_user_create: Key,
  sftp_user_delete: Key,
  node_add: HardDrive,
  node_delete: Trash2,
  user_login: LogIn,
  password_change: KeyRound,
  user_create: UserPlus,
  user_update: UserCog,
  user_delete: UserMinus,
  profile_update: Settings,
  "2fa_enable": ShieldCheck,
  "2fa_disable": ShieldX,
  security_event: ShieldAlert,
};

const activityTypeGroups: Record<string, ActivityType[]> = {
  "Server": ["server_start", "server_stop", "server_restart", "server_create", "server_delete", "server_command"],
  "Backup": ["backup_create", "backup_restore", "backup_delete"],
  "Network": ["port_create", "port_delete"],
  "SFTP": ["sftp_user_create", "sftp_user_delete"],
  "Node": ["node_add", "node_delete"],
  "User": ["user_login", "password_change", "user_create", "user_update", "user_delete", "profile_update"],
  "Security": ["2fa_enable", "2fa_disable", "security_event"],
};

export default function ActivityPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [selectedServer, setSelectedServer] = useState<string>("all");

  const { data: activities = [], isLoading } = useQuery<EnrichedActivity[]>({
    queryKey: ["/api/activity"],
    refetchInterval: 5000,
  });

  const { data: users = [] } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });

  const { data: servers = [] } = useQuery<ServerType[]>({
    queryKey: ["/api/servers"],
  });

  // Фильтрация активности
  const filteredActivities = useMemo(() => {
    let filtered = activities;

    // Фильтр по типу
    if (selectedType !== "all") {
      const groupTypes = activityTypeGroups[selectedType] || [];
      if (groupTypes.length > 0) {
        filtered = filtered.filter(activity => groupTypes.includes(activity.type));
      } else {
        filtered = filtered.filter(activity => activity.type === selectedType);
      }
    }

    // Фильтр по пользователю
    if (selectedUser !== "all") {
      filtered = filtered.filter(activity => activity.performedBy === selectedUser);
    }

    // Фильтр по серверу (поиск в описании)
    if (selectedServer !== "all") {
      const server = servers.find(s => s.id === selectedServer);
      if (server) {
        filtered = filtered.filter(activity => 
          activity.description?.toLowerCase().includes(server.name.toLowerCase()) ||
          activity.title?.toLowerCase().includes(server.name.toLowerCase())
        );
      }
    }

    // Поиск по тексту
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(activity =>
        activity.title?.toLowerCase().includes(query) ||
        activity.description?.toLowerCase().includes(query) ||
        activity.performedBy?.toLowerCase().includes(query) ||
        activity.type?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [activities, selectedType, selectedUser, selectedServer, searchQuery, servers]);

  const hasActiveFilters = selectedType !== "all" || selectedUser !== "all" || selectedServer !== "all" || searchQuery.trim() !== "";

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedType("all");
    setSelectedUser("all");
    setSelectedServer("all");
  };

  // Получаем уникальные типы активности
  const allActivityTypes = Object.keys(activityTypeGroups).concat(
    Object.values(activityTypeGroups).flat().filter((type, index, arr) => arr.indexOf(type) === index)
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Activity Log</h1>
        <p className="text-sm text-muted-foreground">
          Recent actions and system events
        </p>
      </div>

      {/* Фильтры */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <CardTitle>Filters</CardTitle>
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="w-4 h-4 mr-2" />
                Clear filters
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Поиск */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search activities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Фильтр по типу */}
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger>
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.keys(activityTypeGroups).map(group => (
                  <SelectItem key={group} value={group}>{group}</SelectItem>
                ))}
                <SelectItem value="divider" disabled>──────────</SelectItem>
                {Object.values(activityTypeGroups).flat().filter((type, index, arr) => arr.indexOf(type) === index).map(type => (
                  <SelectItem key={type} value={type}>{type.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Фильтр по пользователю */}
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger>
                <SelectValue placeholder="All users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                <SelectItem value="System">System</SelectItem>
                {users.map(user => (
                  <SelectItem key={user.id} value={user.username}>{user.username}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Фильтр по серверу */}
            <Select value={selectedServer} onValueChange={setSelectedServer}>
              <SelectTrigger>
                <SelectValue placeholder="All servers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Servers</SelectItem>
                {servers.map(server => (
                  <SelectItem key={server.id} value={server.id}>{server.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Активные фильтры */}
          {hasActiveFilters && (
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
              <span className="text-sm text-muted-foreground">Active filters:</span>
              {selectedType !== "all" && (
                <Badge variant="secondary" className="gap-1">
                  Type: {selectedType}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => setSelectedType("all")} />
                </Badge>
              )}
              {selectedUser !== "all" && (
                <Badge variant="secondary" className="gap-1">
                  User: {selectedUser}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => setSelectedUser("all")} />
                </Badge>
              )}
              {selectedServer !== "all" && (
                <Badge variant="secondary" className="gap-1">
                  Server: {servers.find(s => s.id === selectedServer)?.name || selectedServer}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => setSelectedServer("all")} />
                </Badge>
              )}
              {searchQuery.trim() && (
                <Badge variant="secondary" className="gap-1">
                  Search: {searchQuery}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => setSearchQuery("")} />
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Список активности */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
                <Activity className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>
                  {filteredActivities.length} of {activities.length} activities
                  {hasActiveFilters && " (filtered)"}
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              Loading activities...
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              {hasActiveFilters ? (
                <>
                  <Filter className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No activities match your filters</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                    Clear filters
                  </Button>
                </>
              ) : (
                <>
                  <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No activities yet. Start by creating servers or nodes.</p>
                </>
              )}
            </div>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="space-y-4 pr-4">
                {filteredActivities.map((activity, index) => {
                  const Icon = iconMap[activity.type] || Activity;
                  return (
                    <div key={activity.id} className="flex gap-4">
                      <div className="relative">
                        <div className="flex items-center justify-center w-10 h-10 rounded-md bg-muted">
                          <Icon className="w-4 h-4 text-muted-foreground" />
                        </div>
                        {index < filteredActivities.length - 1 && (
                          <div className="absolute left-1/2 top-10 w-px h-full -translate-x-1/2 bg-border" />
                        )}
                      </div>
                      <div className="flex-1 pb-4">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-medium">{activity.title}</h3>
                            <Badge variant="outline" className="text-xs">
                              {activity.type.replace(/_/g, " ")}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatTimeAgo(new Date(activity.timestamp))}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          {activity.description}
                        </p>
                        {activity.performedBy && (
                          <div className="flex items-center gap-2">
                            <User className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              Performed by: <span className="font-medium">{activity.performedBy}</span>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
