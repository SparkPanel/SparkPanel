import { useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Shield, ShieldCheck, ExternalLink, Copy, RefreshCw, Unplug, Plug, BookOpen, Server, Globe, CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";

interface DdosSettings {
  l3Enabled: boolean;
  l3MaxPacketsPerSecond: number | null;
  l3BlockDuration: number | null;
  l4Enabled: boolean;
  l4MaxConnectionsPerIp: number | null;
  l4SynFloodProtection: boolean;
  l7Enabled: boolean;
  l7MaxRequestsPerMinute: number | null;
  l7ChallengeMode: boolean;
  l7UserAgentBlocking: boolean;
}

interface DdosStats {
  blockedIPs: { ip: string; reason: string; until: string }[];
  activeConnections: number;
  trackedIPs: number;
}

interface CloudflareStatus {
  connected: boolean;
  connectedAt?: string;
  error?: string;
  zone?: { name: string; status: string; plan?: string; id: string };
}

interface TcpShieldNetwork {
  id: number;
  name: string;
  protectedCname?: string;
  domains: { name: string; verified: boolean }[];
}

interface TcpShieldStatus {
  connected: boolean;
  connectedAt?: string;
  error?: string;
  networks?: TcpShieldNetwork[];
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="ml-2 p-1 rounded hover:bg-muted transition-colors"
      title="Copy"
    >
      {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
    </button>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="flex items-center justify-between bg-muted rounded-md px-3 py-2 font-mono text-sm">
      <span className="break-all">{code}</span>
      <CopyButton text={code} />
    </div>
  );
}

function GuideStep({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">{n}</span>
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        {children}
      </div>
    </div>
  );
}

/** canManage=false — режим только просмотра (право ddos.view): формы подключения и изменения скрыты. */
export default function AntiDdosPage({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [cfZoneId, setCfZoneId] = useState("");
  const [cfApiToken, setCfApiToken] = useState("");
  const [tsApiKey, setTsApiKey] = useState("");

  const { data: cfStatus, isLoading: cfLoading } = useQuery<CloudflareStatus>({
    queryKey: ["/api/ddos/cloudflare/status"],
    refetchInterval: 60000,
  });

  const { data: tsStatus, isLoading: tsLoading } = useQuery<TcpShieldStatus>({
    queryKey: ["/api/ddos/tcpshield/status"],
    refetchInterval: 60000,
  });

  const { data: tsIps } = useQuery<string[]>({
    queryKey: ["/api/ddos/tcpshield/ips"],
    staleTime: 10 * 60 * 1000,
  });

  const connectCloudflare = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ddos/cloudflare/connect", { zoneId: cfZoneId, apiToken: cfApiToken }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ddos/cloudflare/status"] });
      setCfZoneId("");
      setCfApiToken("");
      toast({ title: "Cloudflare connected", description: "The zone was verified" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const disconnectCloudflare = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/ddos/cloudflare/disconnect", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ddos/cloudflare/status"] });
      toast({ title: "Cloudflare disconnected" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const connectTcpShield = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ddos/tcpshield/connect", { apiKey: tsApiKey }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ddos/tcpshield/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ddos/tcpshield/ips"] });
      setTsApiKey("");
      toast({ title: "TCPShield connected", description: "The API key was verified" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const disconnectTcpShield = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/ddos/tcpshield/disconnect", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ddos/tcpshield/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ddos/tcpshield/ips"] });
      toast({ title: "TCPShield disconnected" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-[1.6rem] font-semibold leading-tight">
          DDoS protection
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect Cloudflare or TCPShield to protect your servers
        </p>
      </div>

      <Tabs defaultValue="builtin" className="space-y-4">
        <TabsList>
          <TabsTrigger value="builtin" className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            Built-in protection
          </TabsTrigger>
          <TabsTrigger value="cloudflare" className="flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Cloudflare
          </TabsTrigger>
          <TabsTrigger value="tcpshield" className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            TCPShield
          </TabsTrigger>
          <TabsTrigger value="guide" className="flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            Guide
          </TabsTrigger>
        </TabsList>

        <TabsContent value="builtin" className="space-y-4">
          <BuiltinProtection canManage={canManage} />
        </TabsContent>

        {/* ── CLOUDFLARE TAB ─────────────────────────────────────────────── */}
        <TabsContent value="cloudflare" className="space-y-4">
          {/* Status card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  Cloudflare status
                </CardTitle>
                <button
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/ddos/cloudflare/status"] })}
                  className="text-muted-foreground hover:text-foreground"
                  title="Refresh"
                >
                  <RefreshCw className={`w-4 h-4 ${cfLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {cfLoading ? (
                <p className="text-muted-foreground text-sm">Checking the connection…</p>
              ) : cfStatus?.connected ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                    <span className="font-medium text-primary">Connected</span>
                    <Badge variant="secondary">{cfStatus.zone?.plan || "Free"}</Badge>
                  </div>
                  {cfStatus.zone && (
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Domain:</span>
                        <span className="ml-2 font-mono font-medium">{cfStatus.zone.name}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Zone status:</span>
                        <Badge className="ml-2" variant={cfStatus.zone.status === "active" ? "default" : "secondary"}>
                          {cfStatus.zone.status}
                        </Badge>
                      </div>
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Zone ID:</span>
                        <span className="ml-2 font-mono text-xs">{cfStatus.zone.id}</span>
                      </div>
                    </div>
                  )}
                  {cfStatus.connectedAt && (
                    <p className="text-xs text-muted-foreground">
                      Connected: {new Date(cfStatus.connectedAt).toLocaleString("ru-RU")}
                    </p>
                  )}
                  {canManage && <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => disconnectCloudflare.mutate()}
                    disabled={disconnectCloudflare.isPending}
                  >
                    <Unplug className="w-4 h-4 mr-2" />
                    Disconnect
                  </Button>}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-muted-foreground" />
                  <span className="text-muted-foreground">Not connected</span>
                  {cfStatus?.error && (
                    <span className="text-destructive text-sm">— {cfStatus.error}</span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Connect form */}
          {!cfStatus?.connected && canManage && (
            <Card>
              <CardHeader>
                <CardTitle>Connect Cloudflare</CardTitle>
                <CardDescription>
                  Enter your Cloudflare zone details. The token is verified through the Cloudflare API.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="cf-zone">Zone ID</Label>
                  <Input
                    id="cf-zone"
                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={cfZoneId}
                    onChange={(e) => setCfZoneId(e.target.value)}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Cloudflare Dashboard → Domains → your domain → Overview → API block at the bottom of the page → Zone ID
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cf-token">API Token</Label>
                  <Input
                    id="cf-token"
                    type="password"
                    placeholder="Scoped API token with Zone:Read permission"
                    value={cfApiToken}
                    onChange={(e) => setCfApiToken(e.target.value)}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    My Profile → API Tokens → Create Token. Minimum permissions: Zone → Zone → Read
                  </p>
                </div>
                <Button
                  onClick={() => connectCloudflare.mutate()}
                  disabled={!cfZoneId || !cfApiToken || connectCloudflare.isPending}
                >
                  <Plug className="w-4 h-4 mr-2" />
                  {connectCloudflare.isPending ? "Checking…" : "Connect"}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Info about what you get */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Info className="w-4 h-4" />
                What the Cloudflare integration gives you
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="grid gap-2">
                <div className="flex gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span><strong className="text-foreground">WAF (Web Application Firewall)</strong> — filtering of HTTP/HTTPS traffic, blocking of bots and scanners</span>
                </div>
                <div className="flex gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span><strong className="text-foreground">Cloudflare Spectrum</strong> — proxying of game traffic. On Pro and Business it is a paid add-on and only for one Minecraft application (or SSH; RDP with Business). Arbitrary TCP/UDP ports (CS2, Rust and others) are Enterprise only</span>
                </div>
                <div className="flex gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span><strong className="text-foreground">Rate Limiting</strong> — request limits at Cloudflare, before traffic reaches the server</span>
                </div>
                <div className="flex gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span><strong className="text-foreground">DDoS protection</strong> — on automatically on every plan (Free included) for traffic that goes through Cloudflare (records with the orange cloud)</span>
                </div>
              </div>
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Important for game servers</AlertTitle>
                <AlertDescription>
                  Cloudflare proxies only HTTP ports (80, 8080, 8880, 2052, 2082, 2086, 2095) and HTTPS ports (443, 2053, 2083, 2087, 2096, 8443). A game port (for example Minecraft 25565) does not work through the orange cloud: the game record must be <strong>DNS only</strong> (grey cloud), and then it is not protected, or you need an application <strong>Spectrum</strong>. The Free plan does not include Spectrum.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TCPSHIELD TAB ─────────────────────────────────────────────── */}
        <TabsContent value="tcpshield" className="space-y-4">
          {/* Status card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  TCPShield status
                </CardTitle>
                <button
                  onClick={() => {
                    queryClient.invalidateQueries({ queryKey: ["/api/ddos/tcpshield/status"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/ddos/tcpshield/ips"] });
                  }}
                  className="text-muted-foreground hover:text-foreground"
                  title="Refresh"
                >
                  <RefreshCw className={`w-4 h-4 ${tsLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {tsLoading ? (
                <p className="text-muted-foreground text-sm">Checking the connection…</p>
              ) : tsStatus?.connected ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                    <span className="font-medium text-primary">Connected</span>
                  </div>

                  {tsStatus.networks && tsStatus.networks.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Your networks ({tsStatus.networks.length}):</p>
                      <div className="space-y-1">
                        {tsStatus.networks.map((n) => (
                          <div key={n.id} className="text-sm bg-muted rounded-md px-3 py-2 space-y-1">
                            <div className="flex items-center gap-2">
                              <Server className="w-4 h-4 text-muted-foreground shrink-0" />
                              <span className="font-medium">{n.name}</span>
                            </div>
                            {n.protectedCname && (
                              <div className="text-xs text-muted-foreground">
                                Protected CNAME: <span className="font-mono">{n.protectedCname}</span>
                                <CopyButton text={n.protectedCname} />
                              </div>
                            )}
                            {n.domains.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {n.domains.map((d) => (
                                  <Badge key={d.name} variant={d.verified ? "default" : "secondary"} className="font-mono">
                                    {d.name} {d.verified ? "✓" : "— not verified"}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground">No domains — add them in the TCPShield panel</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Proxy IPs */}
                  {tsIps && tsIps.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium flex items-center gap-1">
                        <Shield className="w-4 h-4" />
                        TCPShield IP ranges (tcpshield.com/v4) to allow in the firewall:
                      </p>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {tsIps.map((ip) => (
                          <CodeBlock key={ip} code={ip} />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Only these IPs should reach the game ports. Block everything else.
                      </p>
                    </div>
                  )}

                  {tsStatus.connectedAt && (
                    <p className="text-xs text-muted-foreground">
                      Connected: {new Date(tsStatus.connectedAt).toLocaleString("ru-RU")}
                    </p>
                  )}
                  {canManage && <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => disconnectTcpShield.mutate()}
                    disabled={disconnectTcpShield.isPending}
                  >
                    <Unplug className="w-4 h-4 mr-2" />
                    Disconnect
                  </Button>}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-muted-foreground" />
                  <span className="text-muted-foreground">Not connected</span>
                  {tsStatus?.error && (
                    <span className="text-destructive text-sm">— {tsStatus.error}</span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Connect form */}
          {!tsStatus?.connected && canManage && (
            <Card>
              <CardHeader>
                <CardTitle>Connect TCPShield</CardTitle>
                <CardDescription>
                  Enter the API key from the TCPShield panel. After connecting you will see the proxy IP addresses for the firewall.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ts-apikey">API key</Label>
                  <Input
                    id="ts-apikey"
                    type="password"
                    placeholder="Your TCPShield API key"
                    value={tsApiKey}
                    onChange={(e) => setTsApiKey(e.target.value)}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    The key is on the profile settings page: panel.tcpshield.com/pages/profile. The API is available only on the Pro plan ($25/month) and higher.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => connectTcpShield.mutate()}
                    disabled={!tsApiKey || connectTcpShield.isPending}
                  >
                    <Plug className="w-4 h-4 mr-2" />
                    {connectTcpShield.isPending ? "Checking…" : "Connect"}
                  </Button>
                  <a
                    href="https://panel.tcpshield.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    Open the dashboard <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </CardContent>
            </Card>
          )}

          {/* What TCPShield gives you */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Info className="w-4 h-4" />
                What TCPShield gives you
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="grid gap-2">
                <div className="flex gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span><strong className="text-foreground">Made for Minecraft</strong> — Java Edition on every plan; Bedrock (Geyser) only on Premium; other TCP/UDP games (FiveM, CS2 and others) through the separate Sentry Tunnel product</span>
                </div>
                <div className="flex gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span><strong className="text-foreground">Proxying</strong> — the real server IP is hidden, players connect through the TCPShield proxy network</span>
                </div>
                <div className="flex gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span><strong className="text-foreground">Free plan</strong> — 1 network, 3 domains, 1 TB of traffic a month (no API)</span>
                </div>
                <div className="flex gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span><strong className="text-foreground">Automatic filtering</strong> of L3/L4 DDoS attacks before they reach the VDS</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── GUIDE TAB ─────────────────────────────────────────────────── */}
        <TabsContent value="guide" className="space-y-4">

          {/* Cloudflare guide */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5" />
                How to connect Cloudflare
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="space-y-3">
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">1</span>
                  <div>
                    <p className="font-medium">Sign up at Cloudflare and add your domain</p>
                    <p className="text-muted-foreground">Go to <code className="bg-muted px-1 rounded">dash.cloudflare.com</code> → <strong>Add a domain</strong>. Follow the steps: switch the NS records to Cloudflare at your domain registrar and wait for activation.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">2</span>
                  <div>
                    <p className="font-medium">Get the Zone ID</p>
                    <p className="text-muted-foreground">On <code className="bg-muted px-1 rounded">dash.cloudflare.com</code> open <strong>Domains</strong> → choose your domain → on the page <strong>Overview</strong> find the block at the bottom <strong>API</strong> → press the copy button next to <strong>Zone ID</strong>.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">3</span>
                  <div>
                    <p className="font-medium">Create an API token</p>
                    <p className="text-muted-foreground">
                      Navigate to <code className="bg-muted px-1 rounded">dash.cloudflare.com/profile/api-tokens</code> (<strong>My Profile</strong> → <strong>API Tokens</strong>) → <strong>Create Token</strong> → instead of a template, create your own token (custom token).
                    </p>
                    <p className="text-muted-foreground mt-1">Set the token up like this:</p>
                    <ul className="mt-1 space-y-1 text-muted-foreground list-disc list-inside">
                      <li><strong>Permissions</strong>: <strong>Zone</strong> → <strong>Zone</strong> → <strong>Read</strong> (not Edit!)</li>
                      <li><strong>Zone Resources</strong>: access to your domain only</li>
                    </ul>
                    <p className="text-muted-foreground mt-1 text-xs">⚠️ Choose exactly <strong>Read</strong>, not Edit — SparkPanel only reads zone data; Edit is not needed and is unsafe.</p>
                    <p className="text-muted-foreground mt-1 text-xs">⚠️ After creation the token is shown <strong>only once</strong> — copy it right away and paste it into SparkPanel. If you close the page without copying it, you will have to create a new one.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">4</span>
                  <div>
                    <p className="font-medium">Set up DNS records</p>
                    <p className="text-muted-foreground">Your domain → <strong>DNS → Records</strong> → add <strong>A records</strong> with the IP of your VDS:</p>
                    <ul className="mt-1 space-y-1 text-muted-foreground list-disc list-inside">
                      <li><strong>Panel</strong> (for example <code className="bg-muted px-1 rounded">panel</code>) — <strong>Proxied</strong> (orange cloud). Cloudflare proxies only standard HTTP/HTTPS ports, so the panel must be reachable through nginx on 80/443 (see the README), not directly on port 5000.</li>
                      <li><strong>Game server</strong> (for example <code className="bg-muted px-1 rounded">play</code>) — <strong>DNS only</strong> (grey cloud). A game port does not work through the orange cloud. In Cloudflare it can be protected only by an application <strong>Spectrum</strong>: for Minecraft it is a paid add-on on Pro/Business (one application), for other games Enterprise only.</li>
                    </ul>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">5</span>
                  <div>
                    <p className="font-medium">Pass the real visitor IP to the panel</p>
                    <p className="text-muted-foreground">When the panel is behind Cloudflare and nginx, there are two proxies in front of it. Set <code className="bg-muted px-1 rounded">.env</code> <code className="bg-muted px-1 rounded">TRUST_PROXY=2</code> and restart the panel — otherwise the built-in protection and the activity log see the IPs of Cloudflare servers instead of visitors and may block Cloudflare itself.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">6</span>
                  <div>
                    <p className="font-medium">HTTP DDoS protection settings <span className="text-xs font-normal text-muted-foreground">(optional)</span></p>
                    <p className="text-muted-foreground">HTTP DDoS protection is on automatically. To change its sensitivity or action: your domain → <strong>Security rules</strong> → tab <strong>DDoS protection</strong> → <strong>HTTP DDoS attack protection</strong> → <strong>Create override</strong> → <strong>Ruleset sensitivity</strong> → <strong>Save</strong>. Without the Advanced DDoS Protection subscription you can create only one such rule.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* TCPShield guide */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                How to connect TCPShield
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="space-y-3">
                <GuideStep n={1} title="Sign up at TCPShield">
                  <p className="text-muted-foreground">Go to <code className="bg-muted px-1 rounded">panel.tcpshield.com</code> and create an account. The free plan protects Minecraft Java Edition: 1 network, 3 domains, 1 TB of traffic a month. Bedrock (Geyser) is supported only on Premium.</p>
                </GuideStep>
                <GuideStep n={2} title="Create a network and a backend set">
                  <p className="text-muted-foreground">Create a network (any name). Then open the page <strong>Backend sets</strong> → <strong>Add Set</strong> and enter <code className="bg-muted px-1 rounded">VDS_IP:port</code> of the game server — the port is shown on the server page in SparkPanel (for example <code className="bg-muted px-1 rounded">203.0.113.10:25565</code>). Enter only what accepts player connections: if you have BungeeCord/Velocity, enter it, not the servers behind it.</p>
                </GuideStep>
                <GuideStep n={3} title="Install the TCPShield plugin or turn on Proxy Protocol">
                  <p className="text-muted-foreground">Without this, the server sees every player with the same IP. Options:</p>
                  <ul className="mt-1 space-y-1 text-muted-foreground list-disc list-inside">
                    <li><strong>TCPShield plugin</strong> (Paper/Spigot need ProtocolLib; BungeeCord, Velocity, Waterfall). Upload it to the folder <code className="bg-muted px-1 rounded">plugins</code> on the server's Files tab and restart the server. Install it only on the entry server (the proxy or the only server), not on both. In the plugin config keep <code className="bg-muted px-1 rounded">only-allow-proxy-connections: true</code> — otherwise the server is not protected.</li>
                    <li><strong>Proxy Protocol</strong> instead of the plugin: turn on proxy-protocol in the TCPShield backend set and on the server (for Velocity — <code className="bg-muted px-1 rounded">haproxy-protocol = true</code>). Do not install the plugin in this case.</li>
                  </ul>
                </GuideStep>
                <GuideStep n={4} title="Add and verify the domain">
                  <p className="text-muted-foreground">Page <strong>Domains</strong> → <strong>Add Domain</strong> → choose the backend set you created → <strong>Begin verification</strong> and add the shown TXT record at the domain root at your registrar or DNS.</p>
                </GuideStep>
                <GuideStep n={5} title="Point the domain to TCPShield">
                  <p className="text-muted-foreground"><strong>Protected CNAME</strong> is shown in the top right corner of the Domains page (after you connect the API it also appears on the TCPShield tab above). Delete old records that point straight to the VDS and create a CNAME (in Cloudflare with proxying off, grey cloud):</p>
                  <div className="mt-2 space-y-1">
                    <CodeBlock code="play.your-domain.com. CNAME <protected CNAME>" />
                  </div>
                  <p className="text-muted-foreground mt-2">For players to join on the bare domain without a subdomain: create a CNAME <code className="bg-muted px-1 rounded">tcpshield</code> → protected CNAME and an SRV record at the root. The SRV target is your subdomain, not the protected CNAME itself (otherwise the client says «Invalid host»), and the port must be 25565:</p>
                  <div className="mt-2 space-y-1">
                    <CodeBlock code="tcpshield.your-domain.com. CNAME <protected CNAME>" />
                    <CodeBlock code="_minecraft._tcp.your-domain.com. SRV 0 5 25565 tcpshield.your-domain.com." />
                  </div>
                </GuideStep>
                <GuideStep n={6} title="Close direct access to the port — allow only TCPShield IPs">
                  <p className="text-muted-foreground">Otherwise an attacker connects to the server directly by the VDS IP. <strong>ufw and INPUT chain rules do not work here</strong>: Docker forwards traffic of published container ports before ufw sees it. Add the rule to the chain <code className="bg-muted px-1 rounded">DOCKER-USER</code>. Run on the node as root, replacing 25565 with the port of your server:</p>
                  <div className="mt-2 space-y-2">
                    <CodeBlock code="apt install -y ipset" />
                    <CodeBlock code="ipset create tcpshield hash:net -exist" />
                    {(tsIps && tsIps.length > 0 ? tsIps : ["<range from tcpshield.com/v4>"]).map((ip) => (
                      <CodeBlock key={ip} code={`ipset add tcpshield ${ip} -exist`} />
                    ))}
                    <CodeBlock code="iptables -I DOCKER-USER -p tcp -m conntrack --ctorigdstport 25565 --ctdir ORIGINAL -m set ! --match-set tcpshield src -j DROP" />
                  </div>
                  <p className="text-muted-foreground mt-2">The TCPShield list has IPv4 only. If the VDS has an IPv6 address, close the port for IPv6 too:</p>
                  <div className="mt-2 space-y-2">
                    <CodeBlock code="ip6tables -I INPUT -p tcp --dport 25565 -j DROP" />
                    <CodeBlock code="ip6tables -I DOCKER-USER -p tcp -m conntrack --ctorigdstport 25565 --ctdir ORIGINAL -j DROP" />
                  </div>
                  <p className="text-muted-foreground mt-2 text-xs">The option <code>--ctorigdstport</code> is needed because in DOCKER-USER the packet already carries the container port, and <code>--ctdir ORIGINAL</code> keeps the server's replies to players from being dropped. iptables and ipset rules last until a reboot: run the commands again after a reboot or add them to a startup script.</p>
                </GuideStep>
                <GuideStep n={7} title="Connect the API to SparkPanel (optional, Pro plan and higher)">
                  <p className="text-muted-foreground">The API key is on the profile settings page <code className="bg-muted px-1 rounded">panel.tcpshield.com/pages/profile</code>. Paste it on the tab <strong>TCPShield</strong> — the panel shows your networks, domains and the protected CNAME. The API is not available on the free plan, but steps 1–6 work without it.</p>
                </GuideStep>
              </div>
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Do not forget</AlertTitle>
                <AlertDescription>
                  The TCPShield IP list can change. The commands above are built from the current list <code>tcpshield.com/v4</code> when the page opens — check it from time to time and update the ipset set.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Comparison */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Which one to choose?</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="font-medium flex items-center gap-1"><Globe className="w-4 h-4" /> Cloudflare</p>
                  <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                    <li>Websites, HTTP/HTTPS APIs</li>
                    <li>Free for HTTP/HTTPS — good for protecting the panel itself</li>
                    <li>Minecraft — Spectrum, a paid add-on to Pro/Business</li>
                    <li>Other games (TCP/UDP) — Enterprise only</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <p className="font-medium flex items-center gap-1"><Shield className="w-4 h-4" /> TCPShield</p>
                  <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                    <li>Minecraft Java — free</li>
                    <li>Bedrock — Premium plan</li>
                    <li>Other games — the Sentry Tunnel product</li>
                    <li>API integration with SparkPanel — from the Pro plan ($25/month)</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BuiltinProtection({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery<DdosSettings>({ queryKey: ["/api/ddos-settings/panel"] });
  const { data: stats } = useQuery<DdosStats>({ queryKey: ["/api/ddos/stats"], refetchInterval: 5000 });
  const [draft, setDraft] = useState<DdosSettings | null>(null);
  const current = draft ?? settings;

  const save = useMutation({
    mutationFn: (payload: DdosSettings) => apiRequest("PUT", "/api/ddos-settings/panel", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ddos-settings/panel"] });
      setDraft(null);
      toast({ title: "Saved", description: "Panel protection settings updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const unblock = useMutation({
    mutationFn: (ip: string) => apiRequest("DELETE", `/api/ddos/blocked/${encodeURIComponent(ip)}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/ddos/stats"] }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!current) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const update = (patch: Partial<DdosSettings>) => setDraft({ ...current, ...patch });
  const numberField = (key: keyof DdosSettings, label: string, hint: string) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        type="number"
        min={1}
        value={(current[key] as number | null) ?? ""}
        disabled={!canManage}
        onChange={(e) => update({ [key]: e.target.value ? Number(e.target.value) : null } as Partial<DdosSettings>)}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
  const toggle = (key: keyof DdosSettings, label: string, hint: string) => (
    <div className="flex items-center justify-between gap-4">
      <div>
        <Label>{label}</Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={Boolean(current[key])} disabled={!canManage} onCheckedChange={(checked) => update({ [key]: checked } as Partial<DdosSettings>)} />
    </div>
  );

  return (
    <>
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Web panel protection</AlertTitle>
        <AlertDescription>
          These rules work at the application level and protect the panel itself from request floods. To protect game ports from volumetric attacks, use Cloudflare Spectrum or TCPShield.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Request rate limit (L3)</CardTitle>
          <CardDescription>Blocks an IP that exceeds the number of requests per second</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {toggle("l3Enabled", "Enabled", "Limit requests from one IP")}
          <div className="grid md:grid-cols-2 gap-4">
            {numberField("l3MaxPacketsPerSecond", "Requests per second", "Blocking threshold")}
            {numberField("l3BlockDuration", "Block duration (sec)", "Used by every protection level")}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connections (L4)</CardTitle>
          <CardDescription>Limits concurrent TCP connections and the rate of new connections</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {toggle("l4Enabled", "Enabled", "Track connections from one IP")}
          {numberField("l4MaxConnectionsPerIp", "Maximum connections per IP", "Open at the same time")}
          {toggle("l4SynFloodProtection", "Connection flood protection", "Block an IP that opens more than 20 connections per second")}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>HTTP (L7)</CardTitle>
          <CardDescription>Requests per minute limit, bot filter and browser check</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {toggle("l7Enabled", "Enabled", "Apply HTTP-level rules")}
          {numberField("l7MaxRequestsPerMinute", "Requests per minute per IP", "Open panel tabs refresh data all the time — do not set the limit too low (default 600)")}
          {toggle("l7UserAgentBlocking", "Block bots", "Reject curl, wget, python and similar clients (requests with an API key are not affected)")}
          {toggle("l7ChallengeMode", "Browser check", "The visitor solves a sum and gets a cookie for 24 hours")}
        </CardContent>
      </Card>

      {canManage && <div className="flex gap-2">
        <Button onClick={() => save.mutate(current)} disabled={!draft || save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        {draft && (
          <Button variant="outline" onClick={() => setDraft(null)}>
            Cancel
          </Button>
        )}
      </div>}

      <Card>
        <CardHeader>
          <CardTitle>Blocked IPs</CardTitle>
          <CardDescription>
            Active connections: {stats?.activeConnections ?? 0} · Tracked IPs: {stats?.trackedIPs ?? 0}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!stats || stats.blockedIPs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No blocked addresses</p>
          ) : (
            <div className="space-y-2">
              {stats.blockedIPs.map((entry) => (
                <div key={entry.ip} className="flex items-center justify-between border rounded p-2 text-sm">
                  <div>
                    <div className="font-mono">{entry.ip}</div>
                    <div className="text-xs text-muted-foreground">
                      {entry.reason} · until {new Date(entry.until).toLocaleString()}
                    </div>
                  </div>
                  {canManage && <Button size="sm" variant="outline" onClick={() => unblock.mutate(entry.ip)} disabled={unblock.isPending}>
                    Unblock
                  </Button>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
