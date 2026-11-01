import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, DatabaseZap, Eye, EyeOff } from "lucide-react";
import type { Server } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusLed } from "@/components/status-badge";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCan } from "@/lib/use-me";

interface DatabaseView {
  database: { engine: string; label: string; host: string; port: number; name: string; user: string; password: string; createdAt: string } | null;
  status?: { state: "running" | "starting" | "stopped" | "missing"; ready: boolean; sizeBytes: number | null };
  restartRequired?: boolean;
  engines: { id: string; label: string }[];
}

const STATE_LABEL = { running: "Ready", starting: "Starting", stopped: "Stopped — starts with the server", missing: "Container missing — starts with the server" };

/** База данных сервера: создание, данные для подключения, удаление. */
export function DatabaseTab({ server }: { server: Server }) {
  const { toast } = useToast();
  const can = useCan();
  const canManage = can("servers.manage");
  const queryKey = ["/api/servers", server.id, "database"];
  const { data, isLoading } = useQuery<DatabaseView>({ queryKey, refetchInterval: (q) => (q.state.data?.status && !q.state.data.status.ready ? 3000 : false) });
  const [engine, setEngine] = useState("postgres");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const create = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/servers/${server.id}/database`, { engine })).json(),
    onSuccess: (next: DatabaseView) => {
      queryClient.setQueryData(queryKey, next);
      queryClient.invalidateQueries({ queryKey: ["/api/servers", server.id] });
      toast({ title: "Database created", description: server.status === "running" ? "Restart the server so it can connect." : "The server connects to it on the next start." });
    },
    onError: (error: Error) => toast({ title: "Database not created", description: error.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/servers/${server.id}/database`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/servers", server.id] });
      setConfirmDelete(false);
      toast({ title: "Database deleted" });
    },
    onError: (error: Error) => toast({ title: "Database not deleted", description: error.message, variant: "destructive" }),
  });

  if (isLoading || !data) return <Skeleton className="h-48" />;

  if (!data.database) {
    return (
      <div className="max-w-xl space-y-4 rounded-lg border bg-card p-5">
        <div className="flex items-start gap-3">
          <DatabaseZap className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div className="space-y-1">
            <p className="font-medium">No database yet</p>
            <p className="text-sm text-muted-foreground">
              Plugins like LuckPerms or CoreProtect, bots and websites often need one. It runs in its own container next to this server and is reachable only from it, by the name{" "}
              <span className="font-mono">database</span>.
            </p>
          </div>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Select value={engine} onValueChange={setEngine}>
              <SelectTrigger className="w-48" aria-label="Database type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.engines.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? "Creating… (downloading the image)" : "Create database"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Ask someone who manages servers to create one.</p>
        )}
      </div>
    );
  }

  const db = data.database;
  const url = `${db.engine === "postgres" ? "postgresql" : "mysql"}://${db.user}:${encodeURIComponent(db.password)}@${db.host}:${db.port}/${db.name}`;
  const rows: [string, string, boolean?][] = [
    ["Host", db.host],
    ["Port", String(db.port)],
    ["Database", db.name],
    ["User", db.user],
    ["Password", db.password, true],
  ];
  const copy = (value: string) => navigator.clipboard?.writeText(value).then(() => toast({ title: "Copied" }));

  return (
    <div className="max-w-2xl space-y-4">
      {data.restartRequired && (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm">Restart the server so it can reach the database.</p>
      )}
      <div className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <StatusLed status={data.status?.ready ? "running" : data.status?.state === "starting" ? "starting" : "stopped"} />
          <p className="font-medium">{db.label}</p>
          <span className="text-sm text-muted-foreground">
            {STATE_LABEL[data.status?.state ?? "missing"]}
            {data.status?.sizeBytes != null && `, ${(data.status.sizeBytes / 1024 ** 2).toFixed(1)} MB`}
          </span>
        </div>
        <dl className="divide-y">
          {rows.map(([label, value, secret]) => (
            <div key={label} className="flex items-center gap-3 px-4 py-2 text-sm">
              <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
              <dd className="min-w-0 flex-1 truncate font-mono">{secret && !showPassword ? "•".repeat(16) : value}</dd>
              {secret && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff /> : <Eye />}
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copy(value)} aria-label={`Copy ${label.toLowerCase()}`}>
                <Copy />
              </Button>
            </div>
          ))}
        </dl>
      </div>
      <p className="text-sm text-muted-foreground">
        The server also gets these as variables: <span className="font-mono">DB_HOST</span>, <span className="font-mono">DB_PORT</span>, <span className="font-mono">DB_NAME</span>,{" "}
        <span className="font-mono">DB_USER</span>, <span className="font-mono">DB_PASSWORD</span> and <span className="font-mono">DATABASE_URL</span>.{" "}
        <button className="text-primary hover:underline" onClick={() => copy(url)}>
          Copy connection URL
        </button>
      </p>
      {canManage && (
        <Button variant="outline" className="text-destructive" onClick={() => setConfirmDelete(true)}>
          Delete database
        </Button>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the database?</AlertDialogTitle>
            <AlertDialogDescription>All its tables and data are deleted. Server backups do not include the database, so this cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep database</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                remove.mutate();
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete database"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
