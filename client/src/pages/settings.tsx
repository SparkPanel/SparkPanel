
import { useState, useEffect, useCallback } from "react";
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

export default function SettingsPage({ username }: SettingsPageProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: panelSettings } = useQuery<{ panelName: string; primaryColor?: string; backgroundColor?: string; borderColor?: string; sidebarAccentColor?: string }>({
    queryKey: ["/api/settings/panel"],
  });

  const [panelName, setPanelName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [backgroundColor, setBackgroundColor] = useState("");
  const [borderColor, setBorderColor] = useState("");
  const [sidebarAccentColor, setSidebarAccentColor] = useState("");

  useEffect(() => {
    if (panelSettings) {
      setPanelName(panelSettings.panelName);
      setPrimaryColor(panelSettings.primaryColor || "");
      setBackgroundColor(panelSettings.backgroundColor || "");
      setBorderColor(panelSettings.borderColor || "");
      setSidebarAccentColor(panelSettings.sidebarAccentColor || "");
    }
  }, [panelSettings]);

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
    onSuccess: () => {
      toast({
        title: "Settings updated",
        description: "Panel settings have been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/panel"] });
      queryClient.invalidateQueries({ queryKey: ["/api/system/info"] });
      // Применяем цвета к странице
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

  // Конвертация hex в HSL формат (h s l)
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
          // Вычисляем контрастный цвет для текста (темный или светлый)
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
    // Применяем цвета только если настройки загружены
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
    updatePanelSettingsMutation.mutate({
      primaryColor: null,
      backgroundColor: null,
      borderColor: null,
      sidebarAccentColor: null,
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
              <p className="text-sm text-muted-foreground mt-1">1.2</p>
            </div>
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
    </div>
  );
}
