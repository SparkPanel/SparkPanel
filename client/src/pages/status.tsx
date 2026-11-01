import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";

interface PublicServer {
  name: string;
  game: string;
  state: "online" | "starting" | "offline" | "problem";
  players: { online: number; max: number | null } | null;
  address: string | null;
}

interface PublicStatus {
  title: string;
  description: string;
  updatedAt: string;
  servers: PublicServer[];
}

const GAME_LABELS: Record<string, string> = {
  minecraft: "Minecraft",
  csgo: "CS2",
  rust: "Rust",
  ark: "ARK",
  valheim: "Valheim",
  terraria: "Terraria",
  gmod: "Garry's Mod",
  custom: "Service",
};

const STATE: Record<PublicServer["state"], { label: string; led: string }> = {
  online: { label: "Online", led: "hsl(157 57% 42%)" },
  starting: { label: "Starting", led: "hsl(40 90% 50%)" },
  offline: { label: "Offline", led: "hsl(215 11% 55%)" },
  problem: { label: "Having problems", led: "hsl(0 72% 55%)" },
};

/** Публичная страница состояния серверов — открывается без входа в панель. */
export default function StatusPage() {
  const { data, error, isLoading } = useQuery<PublicStatus>({
    queryKey: ["/api/public/status"],
    refetchInterval: 30000,
    retry: false,
  });

  const online = data?.servers.filter((s) => s.state === "online").length ?? 0;
  const allUp = data ? data.servers.length > 0 && online === data.servers.length : false;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
        {isLoading ? (
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-label="Loading" />
        ) : error || !data ? (
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">Status page is not available</h1>
            <p className="text-muted-foreground">The panel owner has not turned it on.</p>
          </div>
        ) : (
          <>
            <header className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight">{data.title}</h1>
              {data.description && <p className="text-muted-foreground">{data.description}</p>}
              {data.servers.length > 0 && (
                <p className="flex items-center gap-2 text-sm">
                  <span className="status-led" style={{ ["--led" as string]: allUp ? STATE.online.led : STATE.starting.led }} />
                  {allUp ? "All servers are online" : `${online} of ${data.servers.length} servers online`}
                </p>
              )}
            </header>

            {data.servers.length === 0 ? (
              <p className="mt-10 text-muted-foreground">No servers are listed yet.</p>
            ) : (
              <ul className="mt-8 divide-y rounded-lg border bg-card">
                {data.servers.map((server, i) => (
                  <li key={`${server.name}-${i}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5">
                    <span className="status-led" style={{ ["--led" as string]: STATE[server.state].led }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{server.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {GAME_LABELS[server.game] ?? server.game}
                        {server.address && (
                          <button
                            className="ml-2 inline-flex items-center gap-1 font-mono text-xs hover:text-foreground"
                            onClick={() => navigator.clipboard?.writeText(server.address!)}
                            title="Copy address"
                          >
                            {server.address} <Copy className="h-3 w-3" />
                          </button>
                        )}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p>{STATE[server.state].label}</p>
                      {server.players && (
                        <p className="tabular-nums text-muted-foreground">
                          {server.players.online}
                          {server.players.max ? ` / ${server.players.max}` : ""} playing
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-6 text-xs text-muted-foreground">Updated {new Date(data.updatedAt).toLocaleTimeString()}. Refreshes every 30 seconds.</p>
          </>
        )}
      </main>
    </div>
  );
}
