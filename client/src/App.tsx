import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient, clearCSRFTokenCache } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import LoginPage from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import ServersPage from "@/pages/servers";
import ServerDetailPage from "@/pages/server-detail";
import NodesPage from "@/pages/nodes";
import SettingsPage from "@/pages/settings";
import ActivityPage from "@/pages/activity";
import PluginsPage from "@/pages/plugins";
import UsersPage from "@/pages/users";
import KvmConsolePage from "@/pages/kvm-console";
import ApiPage from "@/pages/api";
import AntiDdosPage from "@/pages/anti-ddos";
import NotFound from "@/pages/not-found";

import type { UserPermission } from "@shared/schema";

interface User {
  id: string;
  username: string;
  permissions: UserPermission[];
  allowedServerIds?: string[] | null;
  hasAllServerAccess?: boolean;
  isFullAccess?: boolean;
}

const hasPermission = (user: User, permission: UserPermission): boolean => {
  return user.permissions.includes(permission);
};

function Router({ user, onLogout }: { user: User; onLogout: () => void }) {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      {hasPermission(user, "servers.view") && <Route path="/servers" component={ServersPage} />}
      {hasPermission(user, "servers.view") && <Route path="/servers/:id" component={ServerDetailPage} />}
      {hasPermission(user, "nodes.view") && <Route path="/nodes" component={NodesPage} />}
      {hasPermission(user, "activity.view") && <Route path="/activity" component={ActivityPage} />}
      {hasPermission(user, "plugins.view") && <Route path="/plugins" component={PluginsPage} />}
      {hasPermission(user, "kvm.access") && <Route path="/kvm" component={KvmConsolePage} />}
      {(hasPermission(user, "users.view") || hasPermission(user, "users.manage")) && <Route path="/users" component={UsersPage} />}
      {hasPermission(user, "api.manage") && <Route path="/api" component={ApiPage} />}
      {hasPermission(user, "ddos.manage") && <Route path="/anti-ddos" component={AntiDdosPage} />}
      {(hasPermission(user, "settings.view") || hasPermission(user, "settings.manage")) && (
        <Route path="/settings">
          {() => <SettingsPage username={user.username} />}
        </Route>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

// Конвертация hex в HSL формат (h s l) - вынесена вне компонента
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

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Загружаем настройки панели для применения цветов
  const { data: panelSettings } = useQuery<{ panelName: string; primaryColor?: string; backgroundColor?: string; borderColor?: string; sidebarAccentColor?: string }>({
    queryKey: ["/api/settings/panel"],
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: 30000, // обновляем каждые 30 сек
  });

  // Применяем цвета при загрузке настроек
  useEffect(() => {
    if (panelSettings) {
      const root = document.documentElement;
      if (panelSettings.primaryColor) {
        const hsl = hexToHsl(panelSettings.primaryColor);
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
      if (panelSettings.backgroundColor) {
        const hsl = hexToHsl(panelSettings.backgroundColor);
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
      if (panelSettings.borderColor) {
        const hsl = hexToHsl(panelSettings.borderColor);
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
      if (panelSettings.sidebarAccentColor) {
        const hsl = hexToHsl(panelSettings.sidebarAccentColor);
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
    }
  }, [panelSettings]);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
          // Сохраняем CSRF токен в кэш сразу после получения
          if (data.csrfToken) {
            const { setCSRFToken } = await import("./lib/queryClient");
            setCSRFToken(data.csrfToken);
          }
        }
      } catch (error) {
        console.error("Auth check failed:", error);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();
  }, []);

  const handleLogin = (userData: User) => {
    setUser(userData);
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { 
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout failed:", error);
    }
    clearCSRFTokenCache();
    setUser(null);
  };

  if (isCheckingAuth) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <TooltipProvider>
        <LoginPage onLogin={handleLogin} />
        <Toaster />
      </TooltipProvider>
    );
  }

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <TooltipProvider>
      <SidebarProvider style={sidebarStyle as React.CSSProperties}>
        <div className="flex h-screen w-full">
          <AppSidebar user={user} onLogout={handleLogout} />
          <div className="flex flex-col flex-1 overflow-hidden">
            <header className="flex items-center justify-between p-2 border-b border-border shrink-0">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
            </header>
            <main className="flex-1 overflow-y-auto">
              <Router user={user} onLogout={handleLogout} />
            </main>
          </div>
        </div>
      </SidebarProvider>
      <Toaster />
    </TooltipProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

export default App;
