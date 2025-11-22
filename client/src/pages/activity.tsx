
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, HardDrive, Play, Square, Plus, Trash2, RotateCw, LogIn, KeyRound, Terminal, ShieldAlert, UserPlus, UserMinus, UserCog, User, Database, Network, Key } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Activity as ActivityEntry, ActivityType } from "@shared/schema";
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
  security_event: ShieldAlert,
};

export default function ActivityPage() {
  const { data: activities = [], isLoading } = useQuery<EnrichedActivity[]>({
    queryKey: ["/api/activity"],
    refetchInterval: 5000,
  });

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Activity Log</h1>
        <p className="text-sm text-muted-foreground">
          Recent actions and system events
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
              <Activity className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>System events from recent operations</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              Loading activities...
            </div>
          ) : activities.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              No activities yet. Start by creating servers or nodes.
            </div>
          ) : (
            <div className="space-y-4">
              {activities.map((activity, index) => {
                const Icon = iconMap[activity.type] || Activity;
                return (
                  <div key={activity.id} className="flex gap-4">
                    <div className="relative">
                      <div className="flex items-center justify-center w-10 h-10 rounded-md bg-muted">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                      </div>
                      {index < activities.length - 1 && (
                        <div className="absolute left-1/2 top-10 w-px h-full -translate-x-1/2 bg-border" />
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-sm font-medium">{activity.title}</h3>
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
