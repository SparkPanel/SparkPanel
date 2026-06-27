import { useEffect, useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { changePasswordSchema, type ChangePassword } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Lock, User, Shield, Settings as SettingsIcon } from "lucide-react";
import { Separator } from "@/components/ui/separator";


interface SettingsPageProps {
  username: string;
}

interface SecuritySettings {
  allowlistEnabled: boolean;
  allowedIps: string[];
  lockdownEnabled: boolean;
}

interface ScheduledTask {
  id: string;
  name: string;
  type: "server_backup" | "server_restart";
  serverId: string;
  cron: string;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
}

export default function SettingsPage({ username }: SettingsPageProps) {
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
  const [nickname, setNickname] = useState("");
  const [isSavingNickname, setIsSavingNickname] = useState(false);
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [twoFACode, setTwoFACode] = useState("");
  const [isSaving2FA, setIsSaving2FA] = useState(false);
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [setupStep, setSetupStep] = useState<"token" | "code">("token");
  const [allowlistEnabled, setAllowlistEnabled] = useState(false);
  const [lockdownEnabled, setLockdownEnabled] = useState(false);
  const [allowedIpsText, setAllowedIpsText] = useState("");
  const [taskName, setTaskName] = useState("");
  const [taskType, setTaskType] = useState<"server_backup" | "server_restart">("server_backup");
  const [taskServerId, setTaskServerId] = useState("");
  const [taskCron, setTaskCron] = useState("0 */6 * * *");

  const { data: currentUser } = useQuery<{ user: any }>({
    queryKey: ["/api/auth/me"],
  });

  const { data: servers = [] } = useQuery<any[]>({
    queryKey: ["/api/servers"],
  });

  const { data: securitySettings } = useQuery<SecuritySettings>({
    queryKey: ["/api/settings/security"],
  });

  const { data: schedulerTasks = [] } = useQuery<ScheduledTask[]>({
    queryKey: ["/api/scheduler/tasks"],
  });

  useEffect(() => {
    if (currentUser?.user?.twoFactorEnabled !== undefined) {
      setIs2FAEnabled(currentUser.user.twoFactorEnabled);
    }
  }, [currentUser]);

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

  const handleUpdateNickname = async () => {
    if (nickname.length > 50) {
      toast({
        title: "Invalid nickname",
        description: "Nickname cannot be longer than 50 characters",
        variant: "destructive",
      });
      return;
    }
    try {
      setIsSavingNickname(true);
      await apiRequest("PUT", "/api/auth/profile", { nickname });
      toast({
        title: "Success",
        description: "Nickname updated successfully",
      });
    } catch (error: any) {
      toast({
        title: "Failed",
        description: error.message || "Failed to update nickname",
        variant: "destructive",
      });
    } finally {
      setIsSavingNickname(false);
    }
  };

  const handleGenerateCode = async () => {
    if (!telegramBotToken.trim()) {
      toast({
        title: "Invalid token",
        description: "Please enter Telegram bot token",
        variant: "destructive",
      });
      return;
    }
    try {
      setIsSaving2FA(true);
      const res = await apiRequest("POST", "/api/auth/2fa/generate-code", { telegramBotToken });
      const data = await res.json();
      toast({
        title: "Code Generated",
        description: data.message || "Send the code to your bot",
      });
      setTwoFACode(data.code || "");
      setSetupStep("code");
    } catch (error: any) {
      toast({
        title: "Failed",
        description: error.message || "Failed to generate code",
        variant: "destructive",
      });
    } finally {
      setIsSaving2FA(false);
    }
  };

  const handleConfirmCode = async () => {
    if (!telegramBotToken.trim()) {
      toast({
        title: "Invalid token",
        description: "Please enter Telegram bot token",
        variant: "destructive",
      });
      return;
    }
    try {
      setIsSaving2FA(true);
      const res = await apiRequest("POST", "/api/auth/2fa/confirm-code", { telegramBotToken });
      const data = await res.json();
      toast({
        title: "2FA Enabled",
        description: data.message || "Two-factor authentication is now enabled",
      });
      setIs2FAEnabled(true);
      setTelegramBotToken("");
      setTwoFACode("");
      setSetupStep("token");
    } catch (error: any) {
      toast({
        title: "Failed",
        description: error.message || "Failed to confirm code. Make sure you sent the code to your bot.",
        variant: "destructive",
      });
    } finally {
      setIsSaving2FA(false);
    }
  };

  const handleDisable2FA = async () => {
    try {
      setIsSaving2FA(true);
      await apiRequest("POST", "/api/auth/2fa/disable", {});
      toast({
        title: "2FA Disabled",
        description: "Two-factor authentication has been disabled",
      });
      setIs2FAEnabled(false);
      setTelegramBotToken("");
      setTwoFACode("");
      setSetupStep("token");
    } catch (error: any) {
      toast({
        title: "Failed",
        description: error.message || "Failed to disable 2FA",
        variant: "destructive",
      });
    } finally {
      setIsSaving2FA(false);
    }
  };

  const form = useForm<ChangePassword>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: (data: ChangePassword) => apiRequest("POST", "/api/auth/change-password", data),
    onSuccess: () => {
      toast({
        title: "Password changed",
        description: "Your password has been updated successfully",
      });
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to change password",
        description: error.message || "Please check your current password",
        variant: "destructive",
      });
    },
  });

  const handleChangePassword = (data: ChangePassword) => {
    changePasswordMutation.mutate(data);
  };

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
    mutationFn: (payload: { name: string; type: string; serverId: string; cron: string }) =>
      apiRequest("POST", "/api/scheduler/tasks", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduler/tasks"] });
      setTaskName("");
      toast({ title: "Task created", description: "Scheduled task created" });
    },
    onError: (error: any) => {
      toast({ title: "Failed", description: error.message || "Failed to create task", variant: "destructive" });
    },
  });

  const runTaskMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/scheduler/tasks/${id}/run`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/scheduler/tasks"] }),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/scheduler/tasks/${id}`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/scheduler/tasks"] }),
  });

  const hexToHsl = (hex: string): string => {
    if (!hex || typeof hex !== "string" || hex.length !== 7 || !hex.startsWith("#")) {
      return "";
    }
    try {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0;
      let s = 0;
      const l = (max + min) / 2;

      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
          case g: h = ((b - r) / d + 2) / 6; break;
          case b: h = ((r - g) / d + 4) / 6; break;
        }
      }

      h = Math.round(h * 360);
      s = Math.round(s * 100);
      const lPercent = Math.round(l * 100);

      return `${h} ${s}% ${lPercent}%`;
    } catch (error) {
      console.error("Error converting hex to HSL:", error);
      return "";
    }
  };

  const applyColors = useCallback(() => {
    try {
      const root = document.documentElement;
      if (primaryColor && primaryColor.trim()) {
        const hsl = hexToHsl(primaryColor);
        if (hsl) {
          root.style.setProperty("--primary", hsl);
          root.style.setProperty("--sidebar-primary", hsl);
          root.style.setProperty("--sidebar-ring", hsl);
          root.style.setProperty("--ring", hsl);
        }
      } else {
        root.style.removeProperty("--primary");
        root.style.removeProperty("--sidebar-primary");
        root.style.removeProperty("--sidebar-ring");
        root.style.removeProperty("--ring");
      }
      if (backgroundColor && backgroundColor.trim()) {
        const hsl = hexToHsl(backgroundColor);
        if (hsl) {
          root.style.setProperty("--background", hsl);
          root.style.setProperty("--card", hsl);
          root.style.setProperty("--sidebar", hsl);
        }
      } else {
        root.style.removeProperty("--background");
        root.style.removeProperty("--card");
        root.style.removeProperty("--sidebar");
      }
      if (borderColor && borderColor.trim()) {
        const hsl = hexToHsl(borderColor);
        if (hsl) {
          root.style.setProperty("--border", hsl);
          root.style.setProperty("--card-border", hsl);
          root.style.setProperty("--sidebar-border", hsl);
          root.style.setProperty("--popover-border", hsl);
          root.style.setProperty("--input", hsl);
        }
      } else {
        root.style.removeProperty("--border");
        root.style.removeProperty("--card-border");
        root.style.removeProperty("--sidebar-border");
        root.style.removeProperty("--popover-border");
        root.style.removeProperty("--input");
      }
      if (sidebarAccentColor && sidebarAccentColor.trim()) {
        const hsl = hexToHsl(sidebarAccentColor);
        if (hsl) {
          root.style.setProperty("--sidebar-accent", hsl);
          const [h, s, l] = hsl.split(" ").map(v => parseFloat(v.replace("%", "")));
          const foregroundHsl = l > 50 ? `${h} ${s}% 10%` : `${h} ${s}% 95%`;
          root.style.setProperty("--sidebar-accent-foreground", foregroundHsl);
        }
      } else {
        root.style.removeProperty("--sidebar-accent");
        root.style.removeProperty("--sidebar-accent-foreground");
      }
    } catch (error) {
      console.error("Error applying colors:", error);
    }
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
    setPrimaryColor("#3b82f6");
    setBackgroundColor("#ffffff");
    setBorderColor("#e5e7eb");
    setSidebarAccentColor("#e5e7eb");
    updatePanelSettingsMutation.mutate({
      primaryColor: "#3b82f6",
      backgroundColor: "#ffffff",
      borderColor: "#e5e7eb",
      sidebarAccentColor: "#e5e7eb",
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account settings and preferences
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>Your account details</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-border">
            <div>
              <p className="text-sm font-medium">Username</p>
              <p className="text-sm text-muted-foreground mt-1">{username}</p>
            </div>
          </div>
          <div className="space-y-2 py-3">
            <label htmlFor="nickname" className="text-sm font-medium">
              Nickname
            </label>
            <div className="flex gap-2">
              <Input
                id="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Enter your nickname"
                maxLength={50}
                disabled={isSavingNickname}
              />
              <Button
                onClick={handleUpdateNickname}
                disabled={isSavingNickname}
              >
                {isSavingNickname ? "Saving..." : "Save"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Add a display name (optional)
            </p>
          </div>
          <div className="flex items-center justify-between py-3 border-b border-border">
            <div>
              <p className="text-sm font-medium">Role</p>
              <p className="text-sm text-muted-foreground mt-1">Administrator</p>
            </div>
            <Shield className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium">Panel Version</p>
              <p className="text-sm text-muted-foreground mt-1">beta 1.0.0</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security Controls</CardTitle>
          <CardDescription>IP allowlist and lockdown mode</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allowlistEnabled} onChange={(e) => setAllowlistEnabled(e.target.checked)} />
            Enable IP allowlist
          </label>
          <Input
            value={allowedIpsText}
            onChange={(e) => setAllowedIpsText(e.target.value)}
            placeholder="127.0.0.1, 1.2.3.4"
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={lockdownEnabled} onChange={(e) => setLockdownEnabled(e.target.checked)} />
            Enable lockdown mode (read-only for non-admin)
          </label>
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
            {updateSecurityMutation.isPending ? "Saving..." : "Save Security Settings"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scheduler</CardTitle>
          <CardDescription>Cron tasks for backup/restart</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Input value={taskName} onChange={(e) => setTaskName(e.target.value)} placeholder="Task name" />
            <select className="h-10 rounded-md border px-3 bg-background" value={taskType} onChange={(e) => setTaskType(e.target.value as any)}>
              <option value="server_backup">Server backup</option>
              <option value="server_restart">Server restart</option>
            </select>
            <select className="h-10 rounded-md border px-3 bg-background" value={taskServerId} onChange={(e) => setTaskServerId(e.target.value)}>
              <option value="">Select server</option>
              {servers.map((server) => (
                <option key={server.id} value={server.id}>{server.name}</option>
              ))}
            </select>
            <Input value={taskCron} onChange={(e) => setTaskCron(e.target.value)} placeholder="*/15 * * * *" />
          </div>
          <Button
            onClick={() => createTaskMutation.mutate({ name: taskName, type: taskType, serverId: taskServerId, cron: taskCron })}
            disabled={createTaskMutation.isPending || !taskName || !taskServerId || !taskCron}
          >
            {createTaskMutation.isPending ? "Creating..." : "Create Task"}
          </Button>
          <div className="space-y-2">
            {schedulerTasks.map((task) => (
              <div key={task.id} className="border rounded p-3 flex items-center justify-between gap-2">
                <div className="text-sm">
                  <div className="font-medium">{task.name}</div>
                  <div className="text-muted-foreground">{task.type} · {task.cron}</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => runTaskMutation.mutate(task.id)}>Run now</Button>
                  <Button size="sm" variant="destructive" onClick={() => deleteTaskMutation.mutate(task.id)}>Delete</Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
              <SettingsIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Panel Settings</CardTitle>
              <CardDescription>Configure panel appearance</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="panel-name" className="text-sm font-medium">
              Panel Name
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
              This name will be displayed on the login page and in the sidebar
            </p>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="primary-color" className="text-sm font-medium">
                Primary Color (Цвет панели)
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
                Основной цвет для кнопок, ссылок и акцентов панели
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="background-color" className="text-sm font-medium">
                Background Color (Цвет страницы)
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
                Цвет фона страницы и карточек
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="border-color" className="text-sm font-medium">
                Border Color (Цвет линий)
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
                Цвет границ и линий разделения
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="sidebar-accent-color" className="text-sm font-medium">
                Sidebar Accent Color (Цвет активных элементов)
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
                Цвет активных элементов в боковой панели (при наведении и выборе)
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
                {updatePanelSettingsMutation.isPending ? "Saving..." : "Save Colors"}
              </Button>
              <Button
                variant="outline"
                onClick={handleResetColors}
                disabled={updatePanelSettingsMutation.isPending || (!primaryColor && !backgroundColor && !borderColor && !sidebarAccentColor)}
              >
                Reset to Default
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
              <Lock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Update your account password</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleChangePassword)} className="space-y-4">
              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Password</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="Enter current password"
                        autoComplete="current-password"
                        data-testid="input-current-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="Enter new password"
                        autoComplete="new-password"
                        data-testid="input-new-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm New Password</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="Confirm new password"
                        autoComplete="new-password"
                        data-testid="input-confirm-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={changePasswordMutation.isPending} data-testid="button-change-password">
                  {changePasswordMutation.isPending ? "Changing..." : "Change Password"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
              <Lock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Two-Factor Authentication (Telegram)</CardTitle>
              <CardDescription>Secure your account with 2FA via Telegram</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!is2FAEnabled ? (
            <>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                <h4 className="font-semibold text-sm text-blue-900 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Пошаговая инструкция настройки 2FA
                </h4>
                <div className="space-y-2 text-sm text-blue-800">
                  <div className="flex gap-2">
                    <span className="font-semibold min-w-[20px]">1.</span>
                    <div>
                      <p className="font-medium">Откройте Telegram и найдите бота @BotFather</p>
                      <p className="text-xs text-blue-700 mt-1">Это официальный бот для создания ботов в Telegram</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-semibold min-w-[20px]">2.</span>
                    <div>
                      <p className="font-medium">Отправьте команду <code className="bg-blue-100 px-1 rounded">/newbot</code></p>
                      <p className="text-xs text-blue-700 mt-1">BotFather попросит вас ввести имя бота и username</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-semibold min-w-[20px]">3.</span>
                    <div>
                      <p className="font-medium">Скопируйте токен бота</p>
                      <p className="text-xs text-blue-700 mt-1">BotFather пришлет вам токен в формате: <code className="bg-blue-100 px-1 rounded text-[10px]">1234567890:AAHxxxxxxxxxxxxxxxx</code></p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-semibold min-w-[20px]">4.</span>
                    <div>
                      <p className="font-medium text-red-600">⚠️ ВАЖНО: Найдите своего бота и отправьте ему <code className="bg-blue-100 px-1 rounded">/start</code></p>
                      <p className="text-xs text-blue-700 mt-1">Без этого система не сможет отправить вам код! Найдите бота по username, который вы указали при создании.</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-semibold min-w-[20px]">5.</span>
                    <div>
                      <p className="font-medium">Вставьте токен в поле ниже и нажмите "Enable 2FA"</p>
                      <p className="text-xs text-blue-700 mt-1">Код для входа будет приходить в Telegram от вашего бота</p>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {setupStep === "token" ? (
                <div className="space-y-2">
                  <label htmlFor="telegram-token" className="text-sm font-medium">
                    Telegram Bot Token
                  </label>
                  <Input
                    id="telegram-token"
                    value={telegramBotToken}
                    onChange={(e) => setTelegramBotToken(e.target.value)}
                    placeholder="1234567890:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    disabled={isSaving2FA}
                    type="password"
                  />
                  <p className="text-xs text-muted-foreground">
                    Токен безопасно хранится в базе данных и используется только для отправки кодов
                  </p>
                  <Button
                    onClick={handleGenerateCode}
                    disabled={isSaving2FA || !telegramBotToken.trim()}
                    className="w-full"
                  >
                    {isSaving2FA ? "Generating..." : "Generate Code"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="font-semibold text-yellow-900 mb-2">📱 Ваш код для активации 2FA:</p>
                    <div className="bg-white p-3 rounded border border-yellow-300 font-mono text-lg font-bold text-center tracking-widest text-yellow-900">
                      {twoFACode}
                    </div>
                    <p className="text-xs text-yellow-700 mt-3">
                      ⏰ Код действителен <span className="font-semibold">5 минут</span>
                    </p>
                  </div>

                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                    <p className="font-semibold text-blue-900 text-sm">✉️ Что делать дальше:</p>
                    <ol className="list-decimal list-inside space-y-2 text-xs text-blue-800">
                      <li>Откройте Telegram</li>
                      <li>Найдите своего бота</li>
                      <li>Отправьте ему код: <code className="bg-blue-100 px-2 py-1 rounded font-mono font-bold">{twoFACode}</code></li>
                      <li>Нажмите кнопку ниже (система автоматически проверит код)</li>
                    </ol>
                  </div>

                  <Button
                    onClick={handleConfirmCode}
                    disabled={isSaving2FA}
                    className="w-full"
                  >
                    {isSaving2FA ? "Confirming..." : "Code Sent to Bot - Enable 2FA"}
                  </Button>

                  <Button
                    onClick={() => {
                      setSetupStep("token");
                      setTwoFACode("");
                    }}
                    variant="outline"
                    disabled={isSaving2FA}
                    className="w-full"
                  >
                    Back
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm font-semibold text-green-700">2FA активирована</span>
                </div>
                <p className="text-xs text-green-700">
                  При каждом входе в систему вы будете получать код подтверждения в Telegram
                </p>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
                <p className="font-medium mb-1">ℹ️ Как это работает:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>При входе система отправит 6-значный код в ваш Telegram</li>
                  <li>Код действителен 5 минут</li>
                  <li>Без правильного кода войти в панель невозможно</li>
                </ul>
              </div>

              <Button
                onClick={handleDisable2FA}
                disabled={isSaving2FA}
                variant="destructive"
                className="w-full"
              >
                {isSaving2FA ? "Disabling..." : "Disable 2FA"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}