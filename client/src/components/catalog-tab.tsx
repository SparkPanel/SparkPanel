import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Download, Package, Search } from "lucide-react";
import type { Server } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface CatalogItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  downloads: number;
  iconUrl: string | null;
  installed: boolean;
  /** Страница проекта в каталоге (у Modrinth строится по slug). */
  url?: string;
  tags?: string[];
}

interface CatalogPage {
  items: CatalogItem[];
  total: number;
  /** Modrinth, uMod или Thunderstore. */
  source: string;
  folder: string;
  gameVersion?: string;
  serverType?: string;
}

const compact = new Intl.NumberFormat("en", { notation: "compact" });

/** Плагины и моды из каталога игры: Modrinth (Minecraft), uMod (Rust + Oxide), Thunderstore (Valheim + BepInEx). */
export function CatalogTab({ server }: { server: Server }) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(text.trim());
      setOffset(0);
    }, 350);
    return () => clearTimeout(timer);
  }, [text]);

  const queryKey = [`/api/servers/${server.id}/catalog?q=${encodeURIComponent(query)}&offset=${offset}`];
  const { data, isLoading, error } = useQuery<CatalogPage>({ queryKey, retry: false, staleTime: 60_000 });

  const install = useMutation({
    mutationFn: async (item: CatalogItem) => (await apiRequest("POST", `/api/servers/${server.id}/catalog/install`, { projectId: item.id })).json(),
    onSuccess: (result: { file: string; restartRequired: boolean; note?: string }) => {
      toast({ title: `${result.file} installed`, description: result.note ?? (result.restartRequired ? "Restart the server to load it." : "It loads on the next start.") });
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith(`/api/servers/${server.id}/catalog`) });
    },
    onError: (err: Error) => toast({ title: "Not installed", description: err.message, variant: "destructive" }),
  });

  if (error) return <EmptyState icon={Package} title="The catalog is not available for this server" description={(error as Error).message} />;

  const noun = data?.folder === "mods" || data?.source === "Thunderstore" ? "mods" : "plugins";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Search ${noun} on ${data?.source ?? "the catalog"}`} className="pl-9" aria-label="Search the catalog" />
        </div>
        {data && (
          <p className="text-sm text-muted-foreground">
            {`${data.total} ${noun} on ${data.source}${data.serverType && data.gameVersion ? ` for ${data.serverType.charAt(0) + data.serverType.slice(1).toLowerCase()} ${data.gameVersion}` : ""}, installed to`}{" "}
            <span className="font-mono">/{data.folder}</span>
          </p>
        )}
      </div>

      {isLoading || !data ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState icon={Search} title={`No ${noun} found`} description="Try another name. Only projects that support this server's version are shown." />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {data.items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3">
              {item.iconUrl ? (
                <img src={item.iconUrl} alt="" className="h-10 w-10 shrink-0 rounded-md bg-muted object-cover" loading="lazy" />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                  <Package className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  <a href={item.url ?? `https://modrinth.com/project/${item.slug}`} target="_blank" rel="noreferrer" className="hover:underline">
                    {item.title}
                  </a>
                  <span className="ml-2 font-normal text-muted-foreground">by {item.author}</span>
                </p>
                <p className="truncate text-sm text-muted-foreground">{item.description}</p>
                {item.tags && item.tags.length > 0 && (
                  <p className="mt-0.5 flex flex-wrap gap-1">
                    {item.tags.map((tag) => (
                      <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                  </p>
                )}
              </div>
              <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:block">{compact.format(item.downloads)} downloads</span>
              {item.installed ? (
                <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                  <Check className="h-4 w-4" /> Installed
                </span>
              ) : (
                <Button size="sm" variant="outline" className="shrink-0" disabled={install.isPending} onClick={() => install.mutate(item)}>
                  <Download /> {install.isPending && install.variables?.id === item.id ? "Installing…" : "Install"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {data && data.total > 20 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>
            Previous
          </Button>
          <span className="tabular-nums text-muted-foreground">
            {offset + 1}–{Math.min(offset + 20, data.total)} of {data.total}
          </span>
          <Button variant="outline" size="sm" disabled={offset + 20 >= data.total} onClick={() => setOffset(offset + 20)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
