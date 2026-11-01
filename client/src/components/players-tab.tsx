import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ban, Crown, LogOut, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import type { Server } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCan } from "@/lib/use-me";

interface PlayersInfo {
  rconReady: boolean;
  restartRequired: boolean;
  online: string[] | null;
  max: number | null;
  whitelistEnabled: boolean;
  whitelist: { name: string }[];
  ops: { name: string; level?: number }[];
  banned: { name: string; reason?: string; source?: string; created?: string }[];
}

type Action = "whitelist_add" | "whitelist_remove" | "op" | "deop" | "ban" | "pardon" | "kick" | "whitelist_on" | "whitelist_off";

/** Игроки Minecraft-сервера: кто онлайн, белый список, операторы и баны. */
export function PlayersTab({ server }: { server: Server }) {
  const { toast } = useToast();
  const can = useCan();
  const canAct = can("servers.command");
  const running = server.status === "running";
  const queryKey = ["/api/servers", server.id, "players"];
  const { data, isLoading, error } = useQuery<PlayersInfo>({ queryKey, refetchInterval: running ? 10000 : false });
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");

  const act = useMutation({
    mutationFn: async (input: { action: Action; player?: string; reason?: string }) => {
      const response = await apiRequest("POST", `/api/servers/${server.id}/players`, input);
      return (await response.json()) as { message: string };
    },
    onSuccess: (result) => {
      toast({ title: result.message });
      setTimeout(() => queryClient.invalidateQueries({ queryKey }), 600);
    },
    onError: (err: Error) => toast({ title: "Command not run", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <Skeleton className="h-64" />;
  if (error || !data) return <EmptyState icon={Users} title="Players are not available" description={(error as Error | null)?.message ?? "Try again in a moment."} />;

  const run = (action: Action, player?: string) => act.mutate({ action, player, reason: reason.trim() || undefined });
  const typed = name.trim();
  const disabled = !canAct || !running || !data.rconReady || act.isPending;

  return (
    <div className="space-y-6">
      {!running ? (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          The server is stopped. Lists below are read from its files; start it to change them or see who is online.
        </p>
      ) : data.restartRequired ? (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm">Restart the server once to turn on player management.</p>
      ) : !data.rconReady ? (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm">The server is still starting or does not accept console commands (proxies like Velocity do not).</p>
      ) : null}

      <section className="space-y-3">
        <SectionHeader title={data.online ? `Online now — ${data.online.length}${data.max ? ` of ${data.max}` : ""}` : "Online now"} />
        {data.online && data.online.length > 0 ? (
          <ul className="divide-y rounded-lg border bg-card">
            {data.online.map((player) => (
              <li key={player} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
                <span className="font-medium">{player}</span>
                {data.ops.some((o) => o.name.toLowerCase() === player.toLowerCase()) && <Crown className="h-3.5 w-3.5 text-amber-500" aria-label="Operator" />}
                <div className="ml-auto flex gap-1">
                  <Button size="sm" variant="ghost" disabled={disabled} onClick={() => run("kick", player)}>
                    <LogOut /> Kick
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" disabled={disabled} onClick={() => run("ban", player)}>
                    <Ban /> Ban
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{data.online ? "Nobody is playing right now." : "Shown while the server is running."}</p>
        )}
      </section>

      {canAct && (
        <section className="space-y-3 rounded-lg border bg-card p-4">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Player name" aria-label="Player name" maxLength={17} />
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for a ban or kick (optional)" aria-label="Reason" maxLength={200} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={disabled || !typed} onClick={() => run("whitelist_add", typed)}>
              <UserPlus /> Add to whitelist
            </Button>
            <Button size="sm" variant="outline" disabled={disabled || !typed} onClick={() => run("op", typed)}>
              <Crown /> Make operator
            </Button>
            <Button size="sm" variant="outline" disabled={disabled || !typed} onClick={() => run("kick", typed)}>
              <LogOut /> Kick
            </Button>
            <Button size="sm" variant="outline" className="text-destructive" disabled={disabled || !typed} onClick={() => run("ban", typed)}>
              <Ban /> Ban
            </Button>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionHeader title={`Whitelist — ${data.whitelist.length}`} />
          <label className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            Only whitelisted players can join
            <Switch checked={data.whitelistEnabled} disabled={disabled} onCheckedChange={(on) => run(on ? "whitelist_on" : "whitelist_off")} />
          </label>
        </div>
        <NameList items={data.whitelist.map((p) => ({ name: p.name }))} empty="Nobody is on the whitelist." action={canAct ? { label: "Remove", onClick: (n) => run("whitelist_remove", n), disabled } : undefined} />
      </section>

      <section className="space-y-3">
        <SectionHeader title={`Operators — ${data.ops.length}`} />
        <NameList items={data.ops.map((p) => ({ name: p.name, note: p.level ? `level ${p.level}` : undefined }))} empty="No operators." action={canAct ? { label: "Remove operator", onClick: (n) => run("deop", n), disabled } : undefined} />
      </section>

      <section className="space-y-3">
        <SectionHeader title={`Banned — ${data.banned.length}`} />
        <NameList
          items={data.banned.map((p) => ({ name: p.name, note: [p.reason, p.source && `by ${p.source}`].filter(Boolean).join(", ") || undefined }))}
          empty="No banned players."
          action={canAct ? { label: "Unban", onClick: (n) => run("pardon", n), disabled } : undefined}
        />
      </section>
    </div>
  );
}

function NameList({
  items,
  empty,
  action,
}: {
  items: { name: string; note?: string }[];
  empty: string;
  action?: { label: string; onClick: (name: string) => void; disabled: boolean };
}) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {items.map((item) => (
        <li key={item.name} className="flex items-center gap-3 px-4 py-2 text-sm">
          <span className="font-medium">{item.name}</span>
          {item.note && <span className="min-w-0 truncate text-muted-foreground">{item.note}</span>}
          {action && (
            <Button size="sm" variant="ghost" className="ml-auto" disabled={action.disabled} onClick={() => action.onClick(item.name)}>
              <Trash2 /> {action.label}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
