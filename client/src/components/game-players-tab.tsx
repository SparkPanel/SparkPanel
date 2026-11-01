import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ban, LogOut, MessageSquare, ShieldCheck, Trash2, Undo2, Users } from "lucide-react";
import type { Server } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCan } from "@/lib/use-me";

type Command = "kick" | "ban" | "unban" | "say";
type ListName = "admins" | "banned" | "permitted";

interface GamePlayersInfo {
  mode: "rcon" | "console" | "lists";
  online: { id: string; name: string; details?: string }[] | null;
  actions: Command[];
  unbanBy?: "SteamID" | "name";
  lists?: Record<ListName, string[]>;
  notice?: string;
}

const LIST_LABELS: Record<ListName, { title: string; help: string }> = {
  admins: { title: "Admins", help: "Can use admin commands in the game console (F5)." },
  banned: { title: "Banned", help: "Cannot join the server." },
  permitted: { title: "Allowed players", help: "When not empty, only these players can join." },
};

/** Игроки CS2, Rust, ARK, Garry's Mod и Terraria (кто в сети, кик, бан, сообщение) и списки доступа Valheim. */
export function GamePlayersTab({ server }: { server: Server }) {
  const { toast } = useToast();
  const can = useCan();
  const canAct = can("servers.command");
  const running = server.status === "running";
  const queryKey = ["/api/servers", server.id, "players"];
  const { data, isLoading, error } = useQuery<GamePlayersInfo>({ queryKey, refetchInterval: running ? 15000 : false, retry: false });
  const [message, setMessage] = useState("");
  const [unbanId, setUnbanId] = useState("");
  const [listInput, setListInput] = useState<Record<ListName, string>>({ admins: "", banned: "", permitted: "" });

  const command = useMutation({
    mutationFn: async (input: { command: Command; target?: string; reason?: string }) => (await apiRequest("POST", `/api/servers/${server.id}/game-players`, input)).json(),
    onSuccess: (result: { message: string }, input) => {
      toast({ title: input.command === "say" ? "Message sent" : "Done", description: result.message.slice(0, 200) });
      if (input.command === "say") setMessage("");
      if (input.command === "unban") setUnbanId("");
      setTimeout(() => queryClient.invalidateQueries({ queryKey }), 800);
    },
    onError: (err: Error) => toast({ title: "Command not run", description: err.message, variant: "destructive" }),
  });
  const list = useMutation({
    mutationFn: async (input: { list: ListName; steamId: string; add: boolean }) => (await apiRequest("PUT", `/api/servers/${server.id}/game-players/lists`, input)).json(),
    onSuccess: (_r, input) => {
      setListInput((prev) => ({ ...prev, [input.list]: "" }));
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "List saved", description: running ? "Restart the server to apply it." : "It applies on the next start." });
    },
    onError: (err: Error) => toast({ title: "List not saved", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <Skeleton className="h-64" />;
  if (error || !data) return <EmptyState icon={Users} title="Players are not available" description={(error as Error | null)?.message ?? "Try again in a moment."} />;

  const busy = !canAct || command.isPending;
  const has = (c: Command) => data.actions.includes(c);

  if (data.mode === "lists") {
    return (
      <div className="space-y-6">
        {data.notice && <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{data.notice}</p>}
        {(Object.keys(LIST_LABELS) as ListName[]).map((name) => (
          <section key={name} className="space-y-3">
            <SectionHeader title={`${LIST_LABELS[name].title} — ${data.lists?.[name].length ?? 0}`} description={LIST_LABELS[name].help} />
            {(data.lists?.[name] ?? []).length > 0 && (
              <ul className="divide-y rounded-lg border bg-card">
                {data.lists![name].map((id) => (
                  <li key={id} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="font-mono">{id}</span>
                    {canAct && (
                      <Button size="sm" variant="ghost" className="ml-auto" disabled={list.isPending} onClick={() => list.mutate({ list: name, steamId: id, add: false })}>
                        <Trash2 /> Remove
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canAct && (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  list.mutate({ list: name, steamId: listInput[name].trim(), add: true });
                }}
              >
                <Input value={listInput[name]} onChange={(e) => setListInput({ ...listInput, [name]: e.target.value })} placeholder="SteamID64, for example 76561198000000000" className="sm:w-80" aria-label="SteamID64" />
                <Button type="submit" variant="outline" disabled={!listInput[name].trim() || list.isPending}>
                  {name === "banned" ? <Ban /> : <ShieldCheck />} Add
                </Button>
              </form>
            )}
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!running && <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">The server is stopped. Start it to see who is playing and to kick or ban players.</p>}
      {data.notice && <p className="text-sm text-muted-foreground">{data.notice}</p>}

      <section className="space-y-3">
        <SectionHeader title={data.online ? `Online now — ${data.online.length}` : "Online now"} />
        {data.online && data.online.length > 0 ? (
          <ul className="divide-y rounded-lg border bg-card">
            {data.online.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
                <span className="font-medium">{p.name}</span>
                {p.details && <span className="text-muted-foreground">{p.details}</span>}
                <span className="font-mono text-xs text-muted-foreground" translate="no">
                  {p.id !== p.name ? p.id : ""}
                </span>
                <div className="ml-auto flex gap-1">
                  {has("kick") && (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => command.mutate({ command: "kick", target: p.id })}>
                      <LogOut /> Kick
                    </Button>
                  )}
                  {has("ban") && (
                    <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => command.mutate({ command: "ban", target: p.id })}>
                      <Ban /> Ban
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{data.online ? "Nobody is playing right now." : "Shown while the server is running."}</p>
        )}
      </section>

      {canAct && has("say") && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            command.mutate({ command: "say", reason: message.trim() });
          }}
        >
          <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message to everyone on the server" className="sm:w-96" maxLength={200} aria-label="Message to players" />
          <Button type="submit" variant="outline" disabled={!running || !message.trim() || busy}>
            <MessageSquare /> Send to chat
          </Button>
        </form>
      )}

      {canAct && has("unban") && (
        <section className="space-y-2">
          <SectionHeader title="Unban a player" description="Banned players are not online, so enter their SteamID." />
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              command.mutate({ command: "unban", target: unbanId.trim() });
            }}
          >
            <Input value={unbanId} onChange={(e) => setUnbanId(e.target.value)} placeholder="76561198000000000 or STEAM_0:1:123" className="sm:w-80" aria-label="SteamID" />
            <Button type="submit" variant="outline" disabled={!running || !unbanId.trim() || busy}>
              <Undo2 /> Unban
            </Button>
          </form>
        </section>
      )}
    </div>
  );
}
