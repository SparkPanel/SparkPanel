import { useEffect, useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { applyPanelColors } from "@/lib/panel-colors";
import { Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusLed } from "@/components/status-badge";
import { Separator } from "@/components/ui/separator";


interface SettingsPageProps {
  permissions: string[];
}

interface SecuritySettings {
  allowlistEnabled: boolean;
  allowedIps: string[];
  lockdownEnabled: boolean;
}

type TaskType = "server_backup" | "server_restart" | "server_start" | "server_stop" | "server_command";

const TASK_TYPE_LABELS: Record<TaskType, string> = {
  server_backup: "Back up",
  server_restart: "Restart",
  server_start: "Start",
  server_stop: "Stop",
  server_command: "Run a console command",
};

/** Частые расписания, чтобы не писать cron вручную. */
const CRON_PRESETS = [
  { label: "Every 30 minutes", cron: "*/30 * * * *" },
  { label: "Every hour", cron: "0 * * * *" },
  { label: "Every 6 hours", cron: "0 */6 * * *" },
  { label: "Every day at 04:00", cron: "0 4 * * *" },
  { label: "Mondays at 05:00", cron: "0 5 * * 1" },
];

interface ScheduledTask {
  id: string;
  name: string;
  type: TaskType;
  serverId: string;
  cron: string;
  command?: string;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
}

/**
 * Настройки панели. Личные настройки (пароль, 2FA, никнейм) — на странице «Аккаунт».
 * Блоки показываются по правам: безопасность и планировщик — settings.view/settings.manage, оформление — panel.colors.
 */
export default function SettingsPage({ permissions }: SettingsPageProps) {
  const canViewSettings = permissions.includes("settings.view") || permissions.includes("settings.manage");
  const canManageSettings = permissions.includes("settings.manage");
  const canEditColors = permissions.includes("panel.colors");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: panelSettings } = useQuery<{ panelName: string; primaryColor?: string; backgroundColor?: string; borderColor?: string; sidebarAccentColor?: string }>({
    queryKey: ["/api/settings/panel"],
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });

  const [panelName, setPanelName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [backgroundColor, setBackgroundColor] = useState("");
  const [borderColor, setBorderColor] = useState("");
  const [sidebarAccentColor, setSidebarAccentColor] = useState("");
  const [allowlistEnabled, setAllowlistEnabled] = useState(false);
  const [lockdownEnabled, setLockdownEnabled] = useState(false);
  const [allowedIpsText, setAllowedIpsText] = useState("");
  const [taskName, setTaskName] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("server_backup");
  const [taskCommand, setTaskCommand] = useState("");
  const [taskServerId, setTaskServerId] = useState("");
  const [taskCron, setTaskCron] = useState("0 */6 * * *");

  const { data: servers = [] } = useQuery<any[]>({
    queryKey: ["/api/servers"],
    enabled: canViewSettings,
  });

  const { data: securitySettings } = useQuery<SecuritySettings>({
    queryKey: ["/api/settings/security"],
    enabled: canViewSettings,
  });

  const { data: schedulerTasks = [] } = useQuery<ScheduledTask[]>({
    queryKey: ["/api/scheduler/tasks"],
    enabled: canViewSettings,
  });

  useEffect(() => {
    if (panelSettings) {
      setPanelName(panelSettings.panelName);
      setPrimaryColor(panelSettings.primaryColor || "");
      setBackgroundColor(panelSettings.backgroundColor || "");
      setBorderColor(panelSettings.borderColor || "");
      setSidebarAccentColor(panelSettings.sidebarAccentColor || "");
    }
  }, [panelSettings]);

  useEffect(() => {
    if (securitySettings) {
      setAllowlistEnabled(securitySettings.allowlistEnabled);
      setLockdownEnabled(securitySettings.lockdownEnabled);
      setAllowedIpsText((securitySettings.allowedIps || []).join(", "));
    }
  }, [securitySettings]);

  const updatePanelSettingsMutation = useMutation({
    mutationFn: (settings: { panelName?: string; primaryColor?: string | null; backgroundColor?: string | null; borderColor?: string | null; sidebarAccentColor?: string | null }) => 
      apiRequest("PUT", "/api/settings/panel", settings),
    onSuccess: (data: any) => {
      toast({
        title: "Settings updated",
        description: "Panel settings have been updated successfully",
      });
      setPanelName(data.panelName || "");
      setPrimaryColor(data.primaryColor || "");
      setBackgroundColor(data.backgroundColor || "");
      setBorderColor(data.borderColor || "");
      setSidebarAccentColor(data.sidebarAccentColor || "");
      queryClient.invalidateQueries({ queryKey: ["/api/settings/panel"] });
      queryClient.invalidateQueries({ queryKey: ["/api/system/info"] });
      applyColors();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update settings",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const updateSecurityMutation = useMutation({
    mutationFn: (payload: SecuritySettings) => apiRequest("PUT", "/api/settings/security", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/security"] });
      toast({ title: "Security updated", description: "Security settings saved" });
    },
    onError: (error: any) => {
      toast({ title: "Failed", description: error.message || "Failed to save security settings", variant: "destructive" });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: (payload: { name: string; type: string; serverId: string; cron: string; command?: string }) =>
      apiRequest("POST", "/api/scheduler/tasks", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduler/tasks"] });
      setTaskName("");
      setTaskCommand("");
      toast({ title: "Task created", description: "Scheduled task created" });
    },
    onError: (error: any) => {
      toast({ title: "Failed", description: error.message || "Failed to create task", variant: "destructive" });
    },
  });

  const runTaskMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/scheduler/tasks/${id}/run`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduler/tasks"] });
      toast({ title: "Task completed", description: "The task was executed successfully" });
    },
    onError: (error: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduler/tasks"] });
      toast({ title: "Task failed", description: error.message, variant: "destructive" });
    },
  });

  const toggleTaskMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => apiRequest("PATCH", `/api/scheduler/tasks/${id}`, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/scheduler/tasks"] }),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/scheduler/tasks/${id}`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/scheduler/tasks"] }),
  });

  const applyColors = useCallback(() => {
    applyPanelColors({ primaryColor, backgroundColor, borderColor, sidebarAccentColor });
  }, [primaryColor, backgroundColor, borderColor, sidebarAccentColor]);

  useEffect(() => {
    if (panelSettings !== undefined) {
      applyColors();
    }
  }, [applyColors, panelSettings]);

  const handleUpdatePanelName = () => {
    if (!panelName.trim()) {
      toast({
        title: "Invalid panel name",
        description: "Panel name cannot be empty",
        variant: "destructive",
      });
      return;
    }
    updatePanelSettingsMutation.mutate({ panelName: panelName.trim() });
  };

  const handleUpdateColors = () => {
    updatePanelSettingsMutation.mutate({
      primaryColor: primaryColor || null,
      backgroundColor: backgroundColor || null,
      borderColor: borderColor || null,
      sidebarAccentColor: sidebarAccentColor || null,
    });
  };

  const handleResetColors = () => {
    setPrimaryColor("");
    setBackgroundColor("");
    setBorderColor("");
    setSidebarAccentColor("");
    updatePanelSettingsMutation.mutate({ primaryColor: null, backgroundColor: null, borderColor: null, sidebarAccentColor: null });
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-[1.6rem] font-semibold leading-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Panel-wide settings. Your password and 2FA are on the Account page.
        </p>
      </div>

      {canViewSettings && (
      <Card>
        <CardHeader>
          <CardTitle>Access protection</CardTitle>
          <CardDescription>Limit who can reach the panel and freeze changes during an incident.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <label className="flex items-start justify-between gap-4">
            <span className="text-sm">
              Allow only listed IP addresses
              <span className="block text-xs text-muted-foreground">Everyone else gets “access denied”. Add your own address first.</span>
            </span>
            <Switch checked={allowlistEnabled} onCheckedChange={setAllowlistEnabled} disabled={!canManageSettings} />
          </label>
          <Input
            value={allowedIpsText}
            onChange={(e) => setAllowedIpsText(e.target.value)}
            placeholder="203.0.113.10, 198.51.100.0/24"
            className="font-mono"
            disabled={!canManageSettings}
          />
          <label className="flex items-start justify-between gap-4">
            <span className="text-sm">
              Lockdown mode
              <span className="block text-xs text-muted-foreground">Only users who can manage settings may change anything; everyone else can only look.</span>
            </span>
            <Switch checked={lockdownEnabled} onCheckedChange={setLockdownEnabled} disabled={!canManageSettings} />
          </label>
          {canManageSettings && (
            <div className="flex justify-end">
              <Button
                onClick={() =>
                  updateSecurityMutation.mutate({
                    allowlistEnabled,
                    lockdownEnabled,
                    allowedIps: allowedIpsText.split(",").map((v) => v.trim()).filter(Boolean),
                  })
                }
                disabled={updateSecurityMutation.isPending}
              >
                {updateSecurityMutation.isPending ? "Saving…" : "Save protection settings"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {canViewSettings && (
      <Card>
        <CardHeader>
          <CardTitle>Scheduler</CardTitle>
          <CardDescription>Backups, restarts and console commands that run on a schedule.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {canManageSettings && (
            <div className="space-y-3 rounded-md border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Name</label>
                  <Input value={taskName} onChange={(e) => setTaskName(e.target.value)} placeholder="Nightly backup" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Action</label>
                  <Select value={taskType} onValueChange={(v) => setTaskType(v as TaskType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TASK_TYPE_LABELS) as TaskType[]).map((type) => (
                        <SelectItem key={type} value={type}>
                          {TASK_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Server</label>
                  <Select value={taskServerId} onValueChange={setTaskServerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a server" />
                    </SelectTrigger>
                    <SelectContent>
                      {servers.map((server) => (
                        <SelectItem key={server.id} value={server.id}>
                          {server.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">When (cron)</label>
                  <Input value={taskCron} onChange={(e) => setTaskCron(e.target.value)} placeholder="0 4 * * *" className="font-mono" />
                </div>
                {taskType === "server_command" && (
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-sm font-medium">Command</label>
                    <Input className="font-mono" value={taskCommand} onChange={(e) => setTaskCommand(e.target.value)} placeholder="say The server restarts in 5 minutes" />
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="mr-1 text-muted-foreground">Quick choice:</span>
                {CRON_PRESETS.map((preset) => (
                  <button
                    key={preset.cron}
                    type="button"
                    onClick={() => setTaskCron(preset.cron)}
                    className={`rounded-md border px-2 py-1 transition-colors hover:bg-muted ${taskCron === preset.cron ? "border-primary text-primary" : ""}`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={() =>
                    createTaskMutation.mutate({
                      name: taskName,
                      type: taskType,
                      serverId: taskServerId,
                      cron: taskCron,
                      ...(taskType === "server_command" ? { command: taskCommand } : {}),
                    })
                  }
                  disabled={createTaskMutation.isPending || !taskName || !taskServerId || !taskCron || (taskType === "server_command" && !taskCommand.trim())}
                >
                  {createTaskMutation.isPending ? "Adding…" : "Add task"}
                </Button>
              </div>
            </div>
          )}

          {schedulerTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No scheduled tasks yet.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {schedulerTasks.map((task) => (
                <li key={task.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <StatusLed status={task.lastError ? "error" : task.enabled ? "running" : "stopped"} />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">{task.name}</p>
                    <p className="text-muted-foreground">
                      {TASK_TYPE_LABELS[task.type] ?? task.type} for {servers.find((s) => s.id === task.serverId)?.name ?? "a deleted server"}, <code className="font-mono text-xs">{task.cron}</code>
                      {task.command ? (
                        <>
                          , <code className="font-mono text-xs">{task.command}</code>
                        </>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {task.enabled && task.nextRunAt ? `Next run ${new Date(task.nextRunAt).toLocaleString()}` : "Paused"}
                      {task.lastRunAt ? `. Last run ${new Date(task.lastRunAt).toLocaleString()}` : ""}
                    </p>
                    {task.lastError && <p className="text-xs text-destructive">Last run failed: {task.lastError}</p>}
                  </div>
                  {canManageSettings && (
                    <div className="flex items-center gap-2">
                      <Switch checked={task.enabled} onCheckedChange={(enabled) => toggleTaskMutation.mutate({ id: task.id, enabled })} aria-label={task.enabled ? "Pause task" : "Resume task"} />
                      <Button size="sm" variant="outline" disabled={runTaskMutation.isPending} onClick={() => runTaskMutation.mutate(task.id)}>
                        Run now
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteTaskMutation.mutate(task.id)} aria-label={`Delete ${task.name}`}>
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      )}

      {canViewSettings && <NotificationsCard canManage={canManageSettings} />}
      {canViewSettings && <BackupStorageCard canManage={canManageSettings} />}
      {canViewSettings && <StatusPageCard canManage={canManageSettings} />}
      {canViewSettings && <HttpsCard canManage={canManageSettings} />}

      {canEditColors && (
      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>Name and colors your users see in the panel and on the sign-in page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="panel-name" className="text-sm font-medium">
              Panel name
            </label>
            <div className="flex gap-2">
              <Input
                id="panel-name"
                value={panelName}
                onChange={(e) => setPanelName(e.target.value)}
                placeholder="Enter panel name"
                maxLength={50}
                disabled={updatePanelSettingsMutation.isPending}
              />
              <Button
                onClick={handleUpdatePanelName}
                disabled={updatePanelSettingsMutation.isPending || !panelName.trim() || panelName === panelSettings?.panelName}
              >
                {updatePanelSettingsMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Shown on the sign-in page, in the menu and as the issuer name in authenticator apps
            </p>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="primary-color" className="text-sm font-medium">
                Accent color
              </label>
              <div className="flex gap-2 items-center">
                <Input
                  id="primary-color"
                  type="color"
                  value={primaryColor || "#3b82f6"}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-20 h-10 cursor-pointer"
                  disabled={updatePanelSettingsMutation.isPending}
                />
                <Input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  placeholder="#3b82f6"
                  pattern="^#[0-9A-Fa-f]{6}$"
                  maxLength={7}
                  disabled={updatePanelSettingsMutation.isPending}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  onClick={() => setPrimaryColor("")}
                  disabled={updatePanelSettingsMutation.isPending || !primaryColor}
                >
                  Reset
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Buttons, links and highlights in both themes
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="background-color" className="text-sm font-medium">
                Page background (light theme)
              </label>
              <div className="flex gap-2 items-center">
                <Input
                  id="background-color"
                  type="color"
                  value={backgroundColor || "#ffffff"}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="w-20 h-10 cursor-pointer"
                  disabled={updatePanelSettingsMutation.isPending}
                />
                <Input
                  type="text"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  placeholder="#ffffff"
                  pattern="^#[0-9A-Fa-f]{6}$"
                  maxLength={7}
                  disabled={updatePanelSettingsMutation.isPending}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  onClick={() => setBackgroundColor("")}
                  disabled={updatePanelSettingsMutation.isPending || !backgroundColor}
                >
                  Reset
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Background of pages and panels. The dark theme keeps its own colors.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="border-color" className="text-sm font-medium">
                Lines and borders (light theme)
              </label>
              <div className="flex gap-2 items-center">
                <Input
                  id="border-color"
                  type="color"
                  value={borderColor || "#e5e7eb"}
                  onChange={(e) => setBorderColor(e.target.value)}
                  className="w-20 h-10 cursor-pointer"
                  disabled={updatePanelSettingsMutation.isPending}
                />
                <Input
                  type="text"
                  value={borderColor}
                  onChange={(e) => setBorderColor(e.target.value)}
                  placeholder="#e5e7eb"
                  pattern="^#[0-9A-Fa-f]{6}$"
                  maxLength={7}
                  disabled={updatePanelSettingsMutation.isPending}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  onClick={() => setBorderColor("")}
                  disabled={updatePanelSettingsMutation.isPending || !borderColor}
                >
                  Reset
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Borders around panels and between list rows
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="sidebar-accent-color" className="text-sm font-medium">
                Selected menu item (light theme)
              </label>
              <div className="flex gap-2 items-center">
                <Input
                  id="sidebar-accent-color"
                  type="color"
                  value={sidebarAccentColor || "#f3f4f6"}
                  onChange={(e) => setSidebarAccentColor(e.target.value)}
                  className="w-20 h-10 cursor-pointer"
                  disabled={updatePanelSettingsMutation.isPending}
                />
                <Input
                  type="text"
                  value={sidebarAccentColor}
                  onChange={(e) => setSidebarAccentColor(e.target.value)}
                  placeholder="#f3f4f6"
                  pattern="^#[0-9A-Fa-f]{6}$"
                  maxLength={7}
                  disabled={updatePanelSettingsMutation.isPending}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  onClick={() => setSidebarAccentColor("")}
                  disabled={updatePanelSettingsMutation.isPending || !sidebarAccentColor}
                >
                  Reset
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Background of the open section in the menu
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleUpdateColors}
                disabled={
                  updatePanelSettingsMutation.isPending ||
                  (primaryColor === (panelSettings?.primaryColor || "") && 
                   backgroundColor === (panelSettings?.backgroundColor || "") &&
                   borderColor === (panelSettings?.borderColor || "") &&
                   sidebarAccentColor === (panelSettings?.sidebarAccentColor || ""))
                }
              >
                {updatePanelSettingsMutation.isPending ? "Saving…" : "Save colors"}
              </Button>
              <Button
                variant="outline"
                onClick={handleResetColors}
                disabled={updatePanelSettingsMutation.isPending || (!primaryColor && !backgroundColor && !borderColor && !sidebarAccentColor)}
              >
                Use theme colors
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      )}
    </div>
  );
}

interface NotificationSettingsView {
  discordWebhookUrl: string;
  discordConfigured: boolean;
  telegramConfigured: boolean;
  telegramChatId: string;
  events: Record<string, boolean>;
  available: Record<string, string>;
}

/** Куда панель пишет о падениях, неудачных бэкапах, заполненном диске и пропавших нодах. */
function NotificationsCard({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery<NotificationSettingsView>({ queryKey: ["/api/settings/notifications"] });
  const [discord, setDiscord] = useState("");
  const [tgToken, setTgToken] = useState("");
  const [tgChat, setTgChat] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => (await apiRequest("PUT", "/api/settings/notifications", payload)).json(),
    onSuccess: (next: NotificationSettingsView) => {
      queryClient.setQueryData(["/api/settings/notifications"], next);
      setDiscord("");
      setTgToken("");
      setTgChat(null);
      toast({ title: "Notifications saved" });
    },
    onError: (error: any) => toast({ title: "Not saved", description: error.message, variant: "destructive" }),
  });
  const test = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/settings/notifications/test", {})).json(),
    onSuccess: () => toast({ title: "Test message sent", description: "Check Discord or Telegram." }),
    onError: (error: any) => toast({ title: "Test message failed", description: error.message, variant: "destructive" }),
  });

  if (!data) return null;
  const channelsChanged = discord !== "" || tgToken !== "" || (tgChat !== null && tgChat !== data.telegramChatId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>Messages to Discord or Telegram when something goes wrong, so you don't have to watch the panel.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Discord webhook</label>
          <Input
            value={discord}
            onChange={(e) => setDiscord(e.target.value)}
            placeholder={data.discordConfigured ? `Saved: ${data.discordWebhookUrl}` : "https://discord.com/api/webhooks/…"}
            disabled={!canManage}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">Channel settings → Integrations → Webhooks → New webhook → Copy webhook URL.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Telegram bot token</label>
            <Input
              type="password"
              value={tgToken}
              onChange={(e) => setTgToken(e.target.value)}
              placeholder={data.telegramConfigured ? "Saved — type to replace" : "123456:ABC…"}
              disabled={!canManage}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Telegram chat ID</label>
            <Input value={tgChat ?? data.telegramChatId} onChange={(e) => setTgChat(e.target.value)} placeholder="-1001234567890 or @channel" disabled={!canManage} />
          </div>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">
          Create a bot with @BotFather, add it to your chat or channel, and send it any message. The chat ID of a private chat can be found with @userinfobot.
        </p>

        <div className="space-y-2">
          <p className="text-sm font-medium">Send a message when</p>
          {Object.entries(data.available).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-4 text-sm">
              <span>{label}</span>
              <Switch checked={data.events[key] ?? true} disabled={!canManage || save.isPending} onCheckedChange={(on) => save.mutate({ events: { [key]: on } })} />
            </label>
          ))}
        </div>

        {canManage && (
          <div className="flex flex-wrap justify-end gap-2">
            {(data.discordConfigured || data.telegramConfigured) && (
              <Button variant="ghost" onClick={() => save.mutate({ discordWebhookUrl: "", telegramBotToken: "", telegramChatId: "" })} disabled={save.isPending}>
                Remove channels
              </Button>
            )}
            <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending || (!data.discordConfigured && !data.telegramConfigured)}>
              {test.isPending ? "Sending…" : "Send test message"}
            </Button>
            <Button
              onClick={() =>
                save.mutate({
                  ...(discord ? { discordWebhookUrl: discord } : {}),
                  ...(tgToken ? { telegramBotToken: tgToken } : {}),
                  ...(tgChat !== null ? { telegramChatId: tgChat } : {}),
                })
              }
              disabled={!channelsChanged || save.isPending}
            >
              Save channels
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface BackupStorageView {
  enabled: boolean;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  prefix: string;
  pathStyle: boolean;
  keepLocal: boolean;
  hasSecret: boolean;
}

/** Копии бэкапов во внешнем S3-совместимом хранилище (AWS S3, Cloudflare R2, Backblaze B2, Wasabi, MinIO). */
function BackupStorageCard({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery<BackupStorageView>({ queryKey: ["/api/settings/backup-storage"] });
  const [form, setForm] = useState<Omit<BackupStorageView, "hasSecret"> | null>(null);
  const [secret, setSecret] = useState("");

  useEffect(() => {
    if (data && !form) {
      const { hasSecret: _h, ...rest } = data;
      setForm(rest);
    }
  }, [data, form]);

  const payload = () => ({ ...form!, secretAccessKey: secret });
  const save = useMutation({
    mutationFn: async () => (await apiRequest("PUT", "/api/settings/backup-storage", payload())).json(),
    onSuccess: (next: BackupStorageView) => {
      queryClient.setQueryData(["/api/settings/backup-storage"], next);
      setSecret("");
      toast({ title: next.enabled ? "Backups will be copied to the storage" : "External storage turned off" });
    },
    onError: (error: any) => toast({ title: "Not saved", description: error.message, variant: "destructive" }),
  });
  const test = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/settings/backup-storage/test", { ...payload(), enabled: true })).json(),
    onSuccess: (result: { message: string }) => toast({ title: "Storage works", description: result.message }),
    onError: (error: any) => toast({ title: "Storage check failed", description: error.message, variant: "destructive" }),
  });

  if (!data || !form) return null;
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm({ ...form, [key]: value });
  const field = (key: "endpoint" | "region" | "bucket" | "accessKeyId" | "prefix", label: string, placeholder: string) => (
    <div className="space-y-1.5">
      <label className="text-sm font-medium" htmlFor={`bs-${key}`}>
        {label}
      </label>
      <Input id={`bs-${key}`} value={form[key]} onChange={(e) => set(key, e.target.value)} placeholder={placeholder} disabled={!canManage} />
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Backup storage</CardTitle>
        <CardDescription>
          Copy every backup to S3-compatible storage — AWS S3, Cloudflare R2, Backblaze B2, Wasabi or your own MinIO — so a lost panel disk does not take the backups with it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center justify-between gap-4 text-sm font-medium">
          Copy backups to external storage
          <Switch checked={form.enabled} onCheckedChange={(on) => set("enabled", on)} disabled={!canManage} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("endpoint", "Storage address", "https://s3.eu-central-1.amazonaws.com")}
          {field("region", "Region", "us-east-1")}
          {field("bucket", "Bucket", "game-backups")}
          {field("prefix", "Folder in the bucket", "sparkpanel")}
          {field("accessKeyId", "Access key", "AKIA…")}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="bs-secret">
              Secret key
            </label>
            <Input
              id="bs-secret"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={data.hasSecret ? "Saved — type to replace" : "Secret access key"}
              autoComplete="off"
              disabled={!canManage}
            />
          </div>
        </div>
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>
            Path-style addresses
            <span className="block text-xs text-muted-foreground">Turn on for MinIO and most self-hosted storage; turn off for AWS virtual-hosted buckets.</span>
          </span>
          <Switch checked={form.pathStyle} onCheckedChange={(on) => set("pathStyle", on)} disabled={!canManage} />
        </label>
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>
            Keep a copy on the panel disk
            <span className="block text-xs text-muted-foreground">When off, the archive is deleted locally after upload and downloaded from storage for restores.</span>
          </span>
          <Switch checked={form.keepLocal} onCheckedChange={(on) => set("keepLocal", on)} disabled={!canManage} />
        </label>
        <p className="text-xs text-muted-foreground">Archives larger than 5 GB stay on the panel disk only.</p>
        {canManage && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending || !form.endpoint || !form.bucket}>
              {test.isPending ? "Checking…" : "Check storage"}
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Save storage
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface StatusPageSettingsView {
  enabled: boolean;
  title: string;
  description: string;
  serverIds: string[];
  showAddress: boolean;
}

/** Публичная страница /status: какие серверы показывать посетителям без входа. */
function StatusPageCard({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery<StatusPageSettingsView>({ queryKey: ["/api/settings/status-page"] });
  const { data: servers = [] } = useQuery<{ id: string; name: string }[]>({ queryKey: ["/api/servers"] });
  const [form, setForm] = useState<StatusPageSettingsView | null>(null);

  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  const save = useMutation({
    mutationFn: async () => (await apiRequest("PUT", "/api/settings/status-page", form)).json(),
    onSuccess: (next: StatusPageSettingsView) => {
      queryClient.setQueryData(["/api/settings/status-page"], next);
      setForm(next);
      toast({ title: next.enabled ? "Status page published" : "Status page turned off" });
    },
    onError: (error: any) => toast({ title: "Not saved", description: error.message, variant: "destructive" }),
  });

  if (!form) return null;
  const url = `${window.location.origin}/status`;
  const toggleServer = (id: string, on: boolean) =>
    setForm({ ...form, serverIds: on ? [...form.serverIds, id] : form.serverIds.filter((s) => s !== id) });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Public status page</CardTitle>
        <CardDescription>
          A page anyone can open without signing in, showing whether your servers are up and how many people are playing. Share{" "}
          <a href={url} target="_blank" rel="noreferrer" className="font-mono text-primary hover:underline">
            {url}
          </a>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center justify-between gap-4 text-sm font-medium">
          Publish the status page
          <Switch checked={form.enabled} onCheckedChange={(on) => setForm({ ...form, enabled: on })} disabled={!canManage} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="status-title">
              Page title
            </label>
            <Input id="status-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={80} disabled={!canManage} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="status-description">
              Short note
            </label>
            <Input id="status-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={300} placeholder="Maintenance every Monday at 05:00" disabled={!canManage} />
          </div>
        </div>
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>
            Show connection addresses
            <span className="block text-xs text-muted-foreground">Node IP and port, so players can copy them.</span>
          </span>
          <Switch checked={form.showAddress} onCheckedChange={(on) => setForm({ ...form, showAddress: on })} disabled={!canManage} />
        </label>
        <div className="space-y-2">
          <p className="text-sm font-medium">Servers on the page</p>
          {servers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Create a server first.</p>
          ) : (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {servers.map((server) => (
                <label key={server.id} className="flex items-center gap-2 text-sm">
                  <Switch checked={form.serverIds.includes(server.id)} onCheckedChange={(on) => toggleServer(server.id, on)} disabled={!canManage} />
                  <span className="truncate">{server.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        {canManage && (
          <div className="flex justify-end">
            <Button onClick={() => save.mutate()} disabled={save.isPending || !form.title.trim()}>
              Save status page
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Почта для Let's Encrypt: туда приходят предупреждения об истечении сертификатов доменов. */
function HttpsCard({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery<{ email: string }>({ queryKey: ["/api/settings/proxy"] });
  const [email, setEmail] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async () => (await apiRequest("PUT", "/api/settings/proxy", { email: email ?? "" })).json(),
    onSuccess: (next: { email: string }) => {
      queryClient.setQueryData(["/api/settings/proxy"], next);
      setEmail(null);
      toast({ title: "HTTPS settings saved" });
    },
    onError: (error: any) => toast({ title: "Not saved", description: error.message, variant: "destructive" }),
  });
  if (!data) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>HTTPS</CardTitle>
        <CardDescription>Domains added to servers get free Let's Encrypt certificates that renew themselves. Let's Encrypt writes to this address if a renewal fails.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1.5 sm:max-w-sm">
          <label className="text-sm font-medium" htmlFor="https-email">
            Email for Let's Encrypt
          </label>
          <Input id="https-email" type="email" value={email ?? data.email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" disabled={!canManage} />
        </div>
        {canManage && (
          <Button onClick={() => save.mutate()} disabled={email === null || save.isPending}>
            Save
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
