import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Globe, Lock, Trash2 } from "lucide-react";
import type { Server } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/page-header";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface DomainsView {
  domains: { domain: string; addresses: string[]; pointsToNode: boolean | null; certificate: "issued" | "pending" }[];
  nodeIp: string | null;
  email: string;
}

/** Домены сайта на этом сервере: HTTPS-сертификат выпускается автоматически. */
export function DomainsCard({ server }: { server: Server }) {
  const { toast } = useToast();
  const queryKey = ["/api/servers", server.id, "domains"];
  const { data } = useQuery<DomainsView>({ queryKey, refetchInterval: (q) => (q.state.data?.domains.some((d) => d.certificate === "pending") ? 10000 : false) });
  const [domain, setDomain] = useState("");

  const save = useMutation({
    mutationFn: async (domains: string[]) => (await apiRequest("PUT", `/api/servers/${server.id}/domains`, { domains })).json(),
    onSuccess: (next: DomainsView) => {
      queryClient.setQueryData(queryKey, next);
      setDomain("");
    },
    onError: (error: Error) => toast({ title: "Domains not saved", description: error.message, variant: "destructive" }),
  });

  if (!data) return null;
  const list = data.domains.map((d) => d.domain);

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Domains"
        description={`Open a website or web app on this server at your own domain with HTTPS. Point the domain's A record to ${data.nodeIp ?? "the node"}; ports 80 and 443 on the node must be free. Requests go to port ${server.port}.`}
      />
      {data.domains.length > 0 && (
        <ul className="divide-y rounded-lg border bg-card">
          {data.domains.map((d) => (
            <li key={d.domain} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <a href={`https://${d.domain}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                {d.domain}
              </a>
              <span className="text-muted-foreground">
                {d.pointsToNode === false
                  ? d.addresses.length
                    ? `DNS points to ${d.addresses.join(", ")}, not to this node`
                    : "DNS has no A record yet"
                  : d.certificate === "issued"
                    ? "HTTPS works"
                    : "Getting a certificate…"}
              </span>
              {d.certificate === "issued" && <Lock className="h-3.5 w-3.5 text-success" aria-label="Certificate issued" />}
              <Button variant="ghost" size="icon" className="ml-auto h-8 w-8 text-destructive" disabled={save.isPending} onClick={() => save.mutate(list.filter((x) => x !== d.domain))} aria-label={`Remove ${d.domain}`}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (domain.trim()) save.mutate([...list, domain.trim()]);
        }}
      >
        <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="shop.example.com" className="sm:w-72" aria-label="Domain" />
        <Button type="submit" variant="outline" disabled={!domain.trim() || save.isPending}>
          {save.isPending ? "Applying…" : "Add domain"}
        </Button>
      </form>
      {!data.email && <p className="text-xs text-muted-foreground">Tip: add an email for Let's Encrypt in Settings → HTTPS so you get warned before a certificate expires.</p>}
    </section>
  );
}
