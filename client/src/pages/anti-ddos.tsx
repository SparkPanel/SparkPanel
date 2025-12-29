import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Shield, ShieldAlert, ShieldCheck, Server, AlertTriangle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Server as ServerType } from "@shared/schema";
import { Separator } from "@/components/ui/separator";

interface DdosSettings {
  id: string;
  targetType: string;
  targetId: string | null;
  
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
  
  updatedAt: Date;
  updatedBy?: string | null;
}

export default function AntiDdosPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedServer, setSelectedServer] = useState<string | null>(null);

  const { data: servers = [] } = useQuery<ServerType[]>({
    queryKey: ["/api/servers"],
  });

  const { data: panelSettings, isLoading: panelLoading } = useQuery<DdosSettings>({
    queryKey: ["/api/ddos-settings/panel"],
  });

  const { data: serverSettings, isLoading: serverLoading } = useQuery<DdosSettings>({
    queryKey: ["/api/ddos-settings/server", selectedServer],
    enabled: !!selectedServer,
  });

  const updatePanelSettings = useMutation({
    mutationFn: (updates: Partial<DdosSettings>) =>
      apiRequest("PUT", "/api/ddos-settings/panel", updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ddos-settings/panel"] });
      toast({
        title: "Настройки обновлены",
        description: "Настройки защиты панели обновлены",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка обновления",
        description: error.message || "Произошла ошибка",
        variant: "destructive",
      });
    },
  });

  const updateServerSettings = useMutation({
    mutationFn: ({ serverId, updates }: { serverId: string; updates: Partial<DdosSettings> }) =>
      apiRequest("PUT", `/api/ddos-settings/server/${serverId}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ddos-settings/server", selectedServer] });
      toast({
        title: "Настройки обновлены",
        description: "Настройки защиты сервера обновлены",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка обновления",
        description: error.message || "Произошла ошибка",
        variant: "destructive",
      });
    },
  });

  const renderProtectionCard = (
    title: string,
    description: string,
    layer: "l3" | "l4" | "l7",
    settings: DdosSettings | undefined,
    isPanel: boolean
  ) => {
    if (!settings) return null;

    const enabled = settings[`${layer}Enabled`] as boolean;
    const icon = enabled ? <ShieldCheck className="w-5 h-5 text-green-500" /> : <ShieldAlert className="w-5 h-5 text-muted-foreground" />;

    const handleToggle = (checked: boolean) => {
      const updates = { [`${layer}Enabled`]: checked };
      if (isPanel) {
        updatePanelSettings.mutate(updates);
      } else if (selectedServer) {
        updateServerSettings.mutate({ serverId: selectedServer, updates });
      }
    };

    const handleUpdate = (field: string, value: any) => {
      const updates = { [field]: value };
      if (isPanel) {
        updatePanelSettings.mutate(updates);
      } else if (selectedServer) {
        updateServerSettings.mutate({ serverId: selectedServer, updates });
      }
    };

    return (
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                {icon}
                {title}
              </CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={handleToggle}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {enabled && (
            <>
              {layer === "l3" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor={`${layer}-packets`}>Максимум пакетов в секунду</Label>
                    <Input
                      id={`${layer}-packets`}
                      type="number"
                      value={settings.l3MaxPacketsPerSecond ?? 10000}
                      onChange={(e) => handleUpdate("l3MaxPacketsPerSecond", parseInt(e.target.value))}
                    />
                    <p className="text-sm text-muted-foreground">
                      Лимит пакетов в секунду для защиты от флуда
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${layer}-duration`}>Длительность блокировки (сек)</Label>
                    <Input
                      id={`${layer}-duration`}
                      type="number"
                      value={settings.l3BlockDuration ?? 3600}
                      onChange={(e) => handleUpdate("l3BlockDuration", parseInt(e.target.value))}
                    />
                    <p className="text-sm text-muted-foreground">
                      Время блокировки IP после обнаружения атаки
                    </p>
                  </div>
                </>
              )}

              {layer === "l4" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor={`${layer}-connections`}>Максимум соединений на IP</Label>
                    <Input
                      id={`${layer}-connections`}
                      type="number"
                      value={settings.l4MaxConnectionsPerIp ?? 100}
                      onChange={(e) => handleUpdate("l4MaxConnectionsPerIp", parseInt(e.target.value))}
                    />
                    <p className="text-sm text-muted-foreground">
                      Максимальное количество одновременных соединений с одного IP
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Защита от SYN Flood</Label>
                      <p className="text-sm text-muted-foreground">
                        Защита от атак SYN флудом
                      </p>
                    </div>
                    <Switch
                      checked={settings.l4SynFloodProtection}
                      onCheckedChange={(checked) => handleUpdate("l4SynFloodProtection", checked)}
                    />
                  </div>
                </>
              )}

              {layer === "l7" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor={`${layer}-requests`}>Максимум запросов в минуту</Label>
                    <Input
                      id={`${layer}-requests`}
                      type="number"
                      value={settings.l7MaxRequestsPerMinute ?? 60}
                      onChange={(e) => handleUpdate("l7MaxRequestsPerMinute", parseInt(e.target.value))}
                    />
                    <p className="text-sm text-muted-foreground">
                      Лимит HTTP/HTTPS запросов в минуту на IP
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>JavaScript Challenge</Label>
                      <p className="text-sm text-muted-foreground">
                        Проверка браузера через JavaScript
                      </p>
                    </div>
                    <Switch
                      checked={settings.l7ChallengeMode}
                      onCheckedChange={(checked) => handleUpdate("l7ChallengeMode", checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Блокировка подозрительных User-Agent</Label>
                      <p className="text-sm text-muted-foreground">
                        Блокировка ботов и сканеров
                      </p>
                    </div>
                    <Switch
                      checked={settings.l7UserAgentBlocking}
                      onCheckedChange={(checked) => handleUpdate("l7UserAgentBlocking", checked)}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="w-8 h-8" />
            Защита от DDoS атак
          </h1>
          <p className="text-muted-foreground mt-1">
            Управление защитой от DDoS атак для панели и серверов
          </p>
        </div>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Важно</AlertTitle>
        <AlertDescription>
          Защита от DDoS работает на уровне сетевого стека. Изменение настроек может повлиять на производительность.
          Рекомендуется тестировать настройки перед применением в продакшен.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="panel" className="space-y-4">
        <TabsList>
          <TabsTrigger value="panel">Защита панели</TabsTrigger>
          <TabsTrigger value="servers">Защита серверов</TabsTrigger>
        </TabsList>

        <TabsContent value="panel" className="space-y-4">
          {panelLoading ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-muted-foreground text-center">Загрузка...</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Обзор защиты панели</CardTitle>
                  <CardDescription>
                    Текущий статус защиты панели управления от различных типов DDoS атак
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      {panelSettings?.l3Enabled ? (
                        <ShieldCheck className="w-5 h-5 text-green-500" />
                      ) : (
                        <ShieldAlert className="w-5 h-5 text-muted-foreground" />
                      )}
                      <span className="text-sm">L3 {panelSettings?.l3Enabled ? "Активна" : "Выключена"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {panelSettings?.l4Enabled ? (
                        <ShieldCheck className="w-5 h-5 text-green-500" />
                      ) : (
                        <ShieldAlert className="w-5 h-5 text-muted-foreground" />
                      )}
                      <span className="text-sm">L4 {panelSettings?.l4Enabled ? "Активна" : "Выключена"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {panelSettings?.l7Enabled ? (
                        <ShieldCheck className="w-5 h-5 text-green-500" />
                      ) : (
                        <ShieldAlert className="w-5 h-5 text-muted-foreground" />
                      )}
                      <span className="text-sm">L7 {panelSettings?.l7Enabled ? "Активна" : "Выключена"}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 md:grid-cols-1">
                {renderProtectionCard(
                  "L3 - Сетевой уровень",
                  "Защита от атак на сетевом уровне (IP, ICMP флуд)",
                  "l3",
                  panelSettings,
                  true
                )}
                {renderProtectionCard(
                  "L4 - Транспортный уровень",
                  "Защита от атак на транспортном уровне (TCP/UDP флуд, SYN Flood)",
                  "l4",
                  panelSettings,
                  true
                )}
                {renderProtectionCard(
                  "L7 - Прикладной уровень",
                  "Защита от атак на уровне приложений (HTTP флуд, slowloris)",
                  "l7",
                  panelSettings,
                  true
                )}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="servers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Выберите сервер</CardTitle>
              <CardDescription>
                Настройте защиту от DDoS для конкретного сервера
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={selectedServer || ""} onValueChange={setSelectedServer}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите сервер" />
                </SelectTrigger>
                <SelectContent>
                  {servers.map((server) => (
                    <SelectItem key={server.id} value={server.id}>
                      <div className="flex items-center gap-2">
                        <Server className="w-4 h-4" />
                        {server.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {selectedServer && (
            <>
              {serverLoading ? (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-muted-foreground text-center">Загрузка...</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        Обзор защиты - {servers.find(s => s.id === selectedServer)?.name}
                      </CardTitle>
                      <CardDescription>
                        Текущий статус защиты сервера от различных типов DDoS атак
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-4">
                        <div className="flex items-center gap-2">
                          {serverSettings?.l3Enabled ? (
                            <ShieldCheck className="w-5 h-5 text-green-500" />
                          ) : (
                            <ShieldAlert className="w-5 h-5 text-muted-foreground" />
                          )}
                          <span className="text-sm">L3 {serverSettings?.l3Enabled ? "Активна" : "Выключена"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {serverSettings?.l4Enabled ? (
                            <ShieldCheck className="w-5 h-5 text-green-500" />
                          ) : (
                            <ShieldAlert className="w-5 h-5 text-muted-foreground" />
                          )}
                          <span className="text-sm">L4 {serverSettings?.l4Enabled ? "Активна" : "Выключена"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {serverSettings?.l7Enabled ? (
                            <ShieldCheck className="w-5 h-5 text-green-500" />
                          ) : (
                            <ShieldAlert className="w-5 h-5 text-muted-foreground" />
                          )}
                          <span className="text-sm">L7 {serverSettings?.l7Enabled ? "Активна" : "Выключена"}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="grid gap-4 md:grid-cols-1">
                    {renderProtectionCard(
                      "L3 - Сетевой уровень",
                      "Защита от атак на сетевом уровне (IP, ICMP флуд)",
                      "l3",
                      serverSettings,
                      false
                    )}
                    {renderProtectionCard(
                      "L4 - Транспортный уровень",
                      "Защита от атак на транспортном уровне (TCP/UDP флуд, SYN Flood)",
                      "l4",
                      serverSettings,
                      false
                    )}
                    {renderProtectionCard(
                      "L7 - Прикладной уровень",
                      "Защита от атак на уровне приложений (HTTP флуд, slowloris)",
                      "l7",
                      serverSettings,
                      false
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
