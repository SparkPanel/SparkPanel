import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Shield, ShieldCheck, ShieldAlert, ExternalLink, Copy, RefreshCw, Unplug, Plug, BookOpen, Server, Globe, CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

interface CloudflareStatus {
  connected: boolean;
  connectedAt?: string;
  error?: string;
  zone?: { name: string; status: string; plan?: string; id: string };
}

interface TcpShieldNetwork {
  id: number;
  name: string;
  domain?: string;
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
      title="Скопировать"
    >
      {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
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

export default function AntiDdosPage() {
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
    enabled: tsStatus?.connected === true,
  });

  const connectCloudflare = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ddos/cloudflare/connect", { zoneId: cfZoneId, apiToken: cfApiToken }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ddos/cloudflare/status"] });
      setCfZoneId("");
      setCfApiToken("");
      toast({ title: "Cloudflare подключён", description: "Зона успешно верифицирована" });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const disconnectCloudflare = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/ddos/cloudflare/disconnect", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ddos/cloudflare/status"] });
      toast({ title: "Cloudflare отключён" });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const connectTcpShield = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ddos/tcpshield/connect", { apiKey: tsApiKey }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ddos/tcpshield/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ddos/tcpshield/ips"] });
      setTsApiKey("");
      toast({ title: "TCPShield подключён", description: "API ключ верифицирован" });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const disconnectTcpShield = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/ddos/tcpshield/disconnect", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ddos/tcpshield/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ddos/tcpshield/ips"] });
      toast({ title: "TCPShield отключён" });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6 p-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="w-8 h-8" />
          Защита от DDoS
        </h1>
        <p className="text-muted-foreground mt-1">
          Подключение к Cloudflare или TCPShield для защиты ваших серверов
        </p>
      </div>

      <Tabs defaultValue="cloudflare" className="space-y-4">
        <TabsList>
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
            Инструкция
          </TabsTrigger>
        </TabsList>

        {/* ── CLOUDFLARE TAB ─────────────────────────────────────────────── */}
        <TabsContent value="cloudflare" className="space-y-4">
          {/* Status card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  Статус Cloudflare
                </CardTitle>
                <button
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/ddos/cloudflare/status"] })}
                  className="text-muted-foreground hover:text-foreground"
                  title="Обновить"
                >
                  <RefreshCw className={`w-4 h-4 ${cfLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {cfLoading ? (
                <p className="text-muted-foreground text-sm">Проверка соединения...</p>
              ) : cfStatus?.connected ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <span className="font-medium text-green-600 dark:text-green-400">Подключено</span>
                    <Badge variant="secondary">{cfStatus.zone?.plan || "Free"}</Badge>
                  </div>
                  {cfStatus.zone && (
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Домен:</span>
                        <span className="ml-2 font-mono font-medium">{cfStatus.zone.name}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Статус зоны:</span>
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
                      Подключено: {new Date(cfStatus.connectedAt).toLocaleString("ru-RU")}
                    </p>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => disconnectCloudflare.mutate()}
                    disabled={disconnectCloudflare.isPending}
                  >
                    <Unplug className="w-4 h-4 mr-2" />
                    Отключить
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-muted-foreground" />
                  <span className="text-muted-foreground">Не подключено</span>
                  {cfStatus?.error && (
                    <span className="text-destructive text-sm">— {cfStatus.error}</span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Connect form */}
          {!cfStatus?.connected && (
            <Card>
              <CardHeader>
                <CardTitle>Подключить Cloudflare</CardTitle>
                <CardDescription>
                  Введите данные вашей зоны Cloudflare. Токен проходит верификацию через Cloudflare API.
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
                    Cloudflare Dashboard → ваш домен → правая колонка → Zone ID
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cf-token">API Token</Label>
                  <Input
                    id="cf-token"
                    type="password"
                    placeholder="Scoped API Token с правом Zone:Read"
                    value={cfApiToken}
                    onChange={(e) => setCfApiToken(e.target.value)}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    My Profile → API Tokens → Create Token. Минимальные права: Zone → Zone → Read
                  </p>
                </div>
                <Button
                  onClick={() => connectCloudflare.mutate()}
                  disabled={!cfZoneId || !cfApiToken || connectCloudflare.isPending}
                >
                  <Plug className="w-4 h-4 mr-2" />
                  {connectCloudflare.isPending ? "Проверка..." : "Подключить"}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Info about what you get */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Info className="w-4 h-4" />
                Что даёт интеграция с Cloudflare
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="grid gap-2">
                <div className="flex gap-2">
                  <ShieldCheck className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  <span><strong className="text-foreground">WAF (Web Application Firewall)</strong> — фильтрация HTTP/HTTPS трафика, блокировка ботов и сканеров</span>
                </div>
                <div className="flex gap-2">
                  <ShieldCheck className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  <span><strong className="text-foreground">Cloudflare Spectrum</strong> (Pro+) — проксирование TCP/UDP трафика для игровых серверов (Minecraft, CS:GO и др.)</span>
                </div>
                <div className="flex gap-2">
                  <ShieldCheck className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  <span><strong className="text-foreground">Rate Limiting</strong> — ограничение запросов на уровне Cloudflare, до достижения сервера</span>
                </div>
                <div className="flex gap-2">
                  <ShieldCheck className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  <span><strong className="text-foreground">DDoS L3/L4 Protection</strong> — включена автоматически на всех планах (включая Free)</span>
                </div>
              </div>
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Важно для игровых серверов</AlertTitle>
                <AlertDescription>
                  Cloudflare по умолчанию проксирует только HTTP/HTTPS (порты 80, 443, 8080 и т.д.). 
                  Для защиты TCP/UDP портов (например, Minecraft 25565) нужен план <strong>Pro или выше</strong> и 
                  включить <strong>Spectrum</strong> в настройках зоны.
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
                  Статус TCPShield
                </CardTitle>
                <button
                  onClick={() => {
                    queryClient.invalidateQueries({ queryKey: ["/api/ddos/tcpshield/status"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/ddos/tcpshield/ips"] });
                  }}
                  className="text-muted-foreground hover:text-foreground"
                  title="Обновить"
                >
                  <RefreshCw className={`w-4 h-4 ${tsLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {tsLoading ? (
                <p className="text-muted-foreground text-sm">Проверка соединения...</p>
              ) : tsStatus?.connected ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <span className="font-medium text-green-600 dark:text-green-400">Подключено</span>
                  </div>

                  {tsStatus.networks && tsStatus.networks.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Ваши сети ({tsStatus.networks.length}):</p>
                      <div className="space-y-1">
                        {tsStatus.networks.map((n) => (
                          <div key={n.id} className="flex items-center gap-2 text-sm bg-muted rounded-md px-3 py-2">
                            <Server className="w-4 h-4 text-muted-foreground shrink-0" />
                            <span className="font-medium">{n.name}</span>
                            {n.domain && <span className="text-muted-foreground font-mono text-xs">({n.domain})</span>}
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
                        IP-адреса TCPShield — разрешить в фаерволе:
                      </p>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {tsIps.map((ip) => (
                          <CodeBlock key={ip} code={ip} />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Только эти IP должны иметь доступ к игровым портам. Всё остальное — заблокировать.
                      </p>
                    </div>
                  )}

                  {tsStatus.connectedAt && (
                    <p className="text-xs text-muted-foreground">
                      Подключено: {new Date(tsStatus.connectedAt).toLocaleString("ru-RU")}
                    </p>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => disconnectTcpShield.mutate()}
                    disabled={disconnectTcpShield.isPending}
                  >
                    <Unplug className="w-4 h-4 mr-2" />
                    Отключить
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-muted-foreground" />
                  <span className="text-muted-foreground">Не подключено</span>
                  {tsStatus?.error && (
                    <span className="text-destructive text-sm">— {tsStatus.error}</span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Connect form */}
          {!tsStatus?.connected && (
            <Card>
              <CardHeader>
                <CardTitle>Подключить TCPShield</CardTitle>
                <CardDescription>
                  Введите API ключ из панели TCPShield. После подключения вы увидите IP-адреса прокси для настройки фаервола.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ts-apikey">API ключ</Label>
                  <Input
                    id="ts-apikey"
                    type="password"
                    placeholder="Ваш TCPShield API ключ"
                    value={tsApiKey}
                    onChange={(e) => setTsApiKey(e.target.value)}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    panel.tcpshield.com → профиль (правый верхний угол) → Settings → API Access → Regenerate
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => connectTcpShield.mutate()}
                    disabled={!tsApiKey || connectTcpShield.isPending}
                  >
                    <Plug className="w-4 h-4 mr-2" />
                    {connectTcpShield.isPending ? "Проверка..." : "Подключить"}
                  </Button>
                  <a
                    href="https://panel.tcpshield.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    Открыть Dashboard <ExternalLink className="w-3 h-3" />
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
                Что даёт TCPShield
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="grid gap-2">
                <div className="flex gap-2">
                  <ShieldCheck className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  <span><strong className="text-foreground">Специализирован для игровых серверов</strong> — Minecraft, FiveM, GTA:O, Rust и др.</span>
                </div>
                <div className="flex gap-2">
                  <ShieldCheck className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  <span><strong className="text-foreground">TCP/UDP проксирование</strong> — реальный IP сервера скрыт, игроки подключаются через прокси-сеть TCPShield</span>
                </div>
                <div className="flex gap-2">
                  <ShieldCheck className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  <span><strong className="text-foreground">Бесплатный план</strong> доступен — защищает до нескольких серверов</span>
                </div>
                <div className="flex gap-2">
                  <ShieldCheck className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  <span><strong className="text-foreground">Автоматическая фильтрация</strong> DDoS атак L3/L4 до достижения VDS</span>
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
                Как подключить Cloudflare
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="space-y-3">
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">1</span>
                  <div>
                    <p className="font-medium">Зарегистрируйтесь на Cloudflare и добавьте домен</p>
                    <p className="text-muted-foreground">Перейдите на <code className="bg-muted px-1 rounded">dash.cloudflare.com</code> → <strong>Add a domain</strong>. Следуйте инструкциям: смените NS-записи на Cloudflare у вашего регистратора домена и дождитесь активации.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">2</span>
                  <div>
                    <p className="font-medium">Получите Zone ID</p>
                    <p className="text-muted-foreground">На <code className="bg-muted px-1 rounded">dash.cloudflare.com</code> выберите ваш домен → на странице <strong>Overview</strong> в правой колонке найдите блок <strong>API</strong> → скопируйте <strong>Zone ID</strong>.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">3</span>
                  <div>
                    <p className="font-medium">Создайте API Token</p>
                    <p className="text-muted-foreground">
                      На <code className="bg-muted px-1 rounded">dash.cloudflare.com</code> нажмите на иконку профиля (правый верхний угол) → <strong>My Profile</strong> → в левом меню <strong>API Tokens</strong> → кнопка <strong>Create Token</strong> → выберите <strong>Create Custom Token</strong>.
                    </p>
                    <p className="text-muted-foreground mt-1">В разделе <strong>Permissions</strong> выставьте три выпадающих меню так:</p>
                    <ul className="mt-1 space-y-1 text-muted-foreground list-disc list-inside">
                      <li>1-й столбец: <strong>Zone</strong> → 2-й столбец: <strong>Zone</strong> → 3-й столбец: <strong>Read</strong> (не Edit!)</li>
                    </ul>
                    <p className="text-muted-foreground mt-1 text-xs">⚠️ Выбирайте именно <strong>Read</strong>, не Edit — SparkPanel только читает данные зоны, Edit не нужен и небезопасен.</p>
                    <p className="text-muted-foreground mt-1 text-xs">⚠️ После создания токен показывается <strong>только один раз</strong> — сразу скопируйте его и вставьте в SparkPanel. Если закроете страницу без копирования, придётся создавать новый.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">4</span>
                  <div>
                    <p className="font-medium">Настройте DNS-запись для вашего сервера</p>
                    <p className="text-muted-foreground">На <code className="bg-muted px-1 rounded">dash.cloudflare.com</code> → ваш домен → <strong>DNS → Records</strong> → добавьте <strong>A-запись</strong>, указывающую на IP вашего VDS. <strong>Важно:</strong> для Minecraft и других TCP-игр нужен план <strong>Pro+</strong> и включить <strong>Spectrum</strong> — без этого Cloudflare защищает только HTTP/HTTPS.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">5</span>
                  <div>
                    <p className="font-medium">Усильте защиту от DDoS <span className="text-xs font-normal text-muted-foreground">(необязательно)</span></p>
                    <p className="text-muted-foreground">Ваш домен → <strong>Security → DDoS</strong> → <strong>HTTP DDoS Attack Protection</strong> → <strong>Deploy a DDoS Override</strong> → установите чувствительность <strong>High</strong>. Базовая защита работает и без этого шага.</p>
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
                Как подключить TCPShield
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="space-y-3">
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">1</span>
                  <div>
                    <p className="font-medium">Зарегистрируйтесь и войдите в панель TCPShield</p>
                    <p className="text-muted-foreground">Перейдите на <code className="bg-muted px-1 rounded">panel.tcpshield.com</code> → кнопка <strong>Sign Up</strong>. Бесплатный план доступен без карты. После регистрации вы окажетесь в <strong>Account Dashboard</strong>.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">2</span>
                  <div>
                    <p className="font-medium">Создайте сеть и добавьте бэкенд (сервер)</p>
                    <p className="text-muted-foreground">На главной странице нажмите <strong>Add Service</strong> — это создаст новую сеть. В левом меню появится раздел <strong>Networks</strong>. Перейдите в <strong>Networks → Backends</strong> → <strong>Add Backend</strong> → укажите IP и порт вашего VDS (например, порт 25565 для Minecraft).</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">3</span>
                  <div>
                    <p className="font-medium">Получите API ключ</p>
                    <p className="text-muted-foreground">На <code className="bg-muted px-1 rounded">panel.tcpshield.com</code> нажмите на <strong>иконку профиля</strong> (правый верхний угол) → <strong>Settings</strong> → в левом меню вкладка <strong>API Access</strong>. Нажмите <strong>Show Key</strong> чтобы увидеть ключ, или <strong>Regenerate</strong> чтобы создать новый. Скопируйте ключ и вставьте в SparkPanel.</p>
                    <p className="text-muted-foreground mt-1 text-xs">⚠️ <strong>API Access</strong> доступен только на платном плане TCPShield от <strong>$25/мес</strong>. На бесплатном плане кнопка Regenerate вернёт ошибку "API Access Denied". Без API ключа интеграцию со SparkPanel использовать нельзя.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">4</span>
                  <div>
                    <p className="font-medium">Заблокируйте прямой доступ — разрешите только IP TCPShield</p>
                    <p className="text-muted-foreground">Это главная часть настройки. После подключения SparkPanel покажет список IP TCPShield. На VDS выполните команды ниже:</p>
                    <div className="mt-2 space-y-2">
                      <p className="text-muted-foreground font-medium">Через ufw (Ubuntu/Debian):</p>
                      <CodeBlock code="ufw default deny incoming" />
                      <CodeBlock code="ufw allow ssh" />
                      <CodeBlock code="# Для каждого IP из списка TCPShield:" />
                      <CodeBlock code="ufw allow from <TCPSHIELD_IP> to any port 25565" />
                      <CodeBlock code="ufw enable" />
                    </div>
                    <div className="mt-2 space-y-2">
                      <p className="text-muted-foreground font-medium">Через iptables:</p>
                      <CodeBlock code="iptables -A INPUT -p tcp --dport 25565 -j DROP" />
                      <CodeBlock code="iptables -I INPUT -p tcp -s <TCPSHIELD_IP> --dport 25565 -j ACCEPT" />
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">5</span>
                  <div>
                    <p className="font-medium">Настройте домен</p>
                    <p className="text-muted-foreground">В левом меню <strong>Networks → Domains</strong> → добавьте ваш домен. Затем у регистратора домена создайте <strong>CNAME</strong> запись на адрес, который показывает TCPShield, или <strong>SRV</strong>-запись для Minecraft:</p>
                    <div className="mt-2 space-y-1">
                      <CodeBlock code="_minecraft._tcp.play.ваш-домен.ru  SRV  0 5 25565  <адрес из TCPShield>" />
                    </div>
                  </div>
                </div>
              </div>
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Не забудьте</AlertTitle>
                <AlertDescription>
                  IP-адреса TCPShield периодически обновляются. Проверяйте актуальный список в панели или через API — вкладка <strong>TCPShield</strong> выше автоматически показывает текущие IP.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Comparison */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Что выбрать?</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="font-medium flex items-center gap-1"><Globe className="w-4 h-4" /> Cloudflare</p>
                  <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                    <li>Веб-сайты, HTTP/HTTPS API</li>
                    <li>Бесплатно для HTTP трафика</li>
                    <li>TCP/UDP игровые серверы — только Pro+</li>
                    <li>Глобальная CDN сеть</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <p className="font-medium flex items-center gap-1"><Shield className="w-4 h-4" /> TCPShield</p>
                  <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                    <li>Игровые серверы (Minecraft, FiveM и др.)</li>
                    <li>Заточен под игровой трафик</li>
                    <li>Защищает TCP/UDP бесплатно</li>
                    <li>Интеграция со SparkPanel — от $25/мес</li>
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
