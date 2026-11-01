import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  HardDrive,
  Play,
  Square,
  Plus,
  Trash2,
  RotateCw,
  LogIn,
  KeyRound,
  Terminal,
  ShieldAlert,
  UserPlus,
  UserMinus,
  UserCog,
  Database,
  Network,
  Key,
  Settings,
  ShieldCheck,
  ShieldX,
  Search,
  FileText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Activity as ActivityEntry, ActivityType, User as UserType, Server as ServerType } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, PageShell } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { PaginationBar, usePagination } from "@/components/pagination-bar";
import { useCan } from "@/lib/use-me";

interface EnrichedActivity extends ActivityEntry {
  performedBy?: string;
}

const iconMap: Record<ActivityType, LucideIcon> = {
  server_start: Play,
  server_stop: Square,
  server_restart: RotateCw,
  server_create: Plus,
  server_update: Settings,
  server_migrate: HardDrive,
  file_change: FileText,
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
  settings_update: Settings,
  sftp_user_update: Key,
  security_event: ShieldAlert,
};

const TYPE_GROUPS: Record<string, ActivityType[]> = {
  Servers: ["server_start", "server_stop", "server_restart", "server_create", "server_update", "server_migrate", "server_delete", "server_command", "file_change"],
  Backups: ["backup_create", "backup_restore", "backup_delete"],
  "Ports and SFTP": ["port_create", "port_delete", "sftp_user_create", "sftp_user_update", "sftp_user_delete"],
  Nodes: ["node_add", "node_delete"],
  Users: ["user_login", "password_change", "user_create", "user_update", "user_delete", "profile_update"],
  Security: ["2fa_enable", "2fa_disable", "settings_update", "security_event"],
};

/** Подпись дня для группировки: «Today», «Yesterday» или дата. */
function dayLabel(date: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

export default function ActivityPage() {
  const can = useCan();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [selectedUser, setSelectedUser] = useState("all");
  const [selectedServer, setSelectedServer] = useState("all");

  const { data: activities = [], isLoading } = useQuery<EnrichedActivity[]>({
    queryKey: ["/api/activity?limit=1000"],
    refetchInterval: 10000,
  });
  const { data: users = [] } = useQuery<UserType[]>({ queryKey: ["/api/users"], enabled: can("users.view", "users.manage") });
  const { data: servers = [] } = useQuery<ServerType[]>({ queryKey: ["/api/servers"], enabled: can("servers.view") });

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const groupTypes = TYPE_GROUPS[selectedGroup];
    const serverName = servers.find((s) => s.id === selectedServer)?.name.toLowerCase();
    return activities.filter(
      (a) =>
        (!groupTypes || groupTypes.includes(a.type)) &&
        (selectedUser === "all" || a.performedBy === selectedUser) &&
        (!serverName || a.description?.toLowerCase().includes(serverName) || a.title?.toLowerCase().includes(serverName)) &&
        (!query || a.title?.toLowerCase().includes(query) || a.description?.toLowerCase().includes(query) || a.performedBy?.toLowerCase().includes(query)),
    );
  }, [activities, selectedGroup, selectedUser, selectedServer, searchQuery, servers]);

  const filtersActive = selectedGroup !== "all" || selectedUser !== "all" || selectedServer !== "all" || searchQuery.trim() !== "";
  const pagination = usePagination(filtered, 50, `${searchQuery}|${selectedGroup}|${selectedUser}|${selectedServer}`);

  const days = useMemo(() => {
    const groups: { label: string; items: EnrichedActivity[] }[] = [];
    for (const item of pagination.pageItems) {
      const label = dayLabel(new Date(item.timestamp));
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(item);
      else groups.push({ label, items: [item] });
    }
    return groups;
  }, [pagination.pageItems]);

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedGroup("all");
    setSelectedUser("all");
    setSelectedServer("all");
  };

  return (
    <PageShell>
      <PageHeader title="Activity" description="Who did what in the panel, newest first" />

      <div className="flex flex-col gap-2 lg:flex-row">
        <div className="relative flex-1 lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" placeholder="Search events" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
        <Select value={selectedGroup} onValueChange={setSelectedGroup}>
          <SelectTrigger className="lg:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            {Object.keys(TYPE_GROUPS).map((group) => (
              <SelectItem key={group} value={group}>
                {group}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {users.length > 0 && (
          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger className="lg:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              <SelectItem value="System">System</SelectItem>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.username}>
                  {user.username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {servers.length > 0 && (
          <Select value={selectedServer} onValueChange={setSelectedServer}>
            <SelectTrigger className="lg:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All servers</SelectItem>
              {servers.map((server) => (
                <SelectItem key={server.id} value={server.id}>
                  {server.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {filtersActive && (
          <Button variant="ghost" onClick={clearFilters}>
            Reset filters
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Activity}
          title={filtersActive ? "No events match" : "No events yet"}
          description={filtersActive ? "Change the search or filters." : "Actions such as starting servers, sign-ins and changes to settings appear here."}
          action={
            filtersActive && (
              <Button variant="outline" onClick={clearFilters}>
                Reset filters
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-5">
          {days.map((day) => (
            <section key={day.label} className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">{day.label}</h2>
              <ul className="divide-y rounded-lg border bg-card">
                {day.items.map((activity) => {
                  const Icon = iconMap[activity.type] || Activity;
                  const time = new Date(activity.timestamp);
                  return (
                    <li key={activity.id} className="flex gap-3 px-4 py-3">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{activity.title}</p>
                        {activity.description && <p className="break-words text-sm text-muted-foreground">{activity.description}</p>}
                      </div>
                      <div className="shrink-0 text-right text-xs text-muted-foreground">
                        <time dateTime={time.toISOString()} title={time.toLocaleString()} className="block tabular-nums">
                          {time.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                        </time>
                        {activity.performedBy && <span className="block max-w-[8rem] truncate">{activity.performedBy}</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <PaginationBar {...pagination} noun="events" />
        </div>
      )}
    </PageShell>
  );
}
