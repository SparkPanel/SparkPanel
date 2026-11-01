import { useState, useEffect, lazy, Suspense } from "react";
import { Switch, Route, Redirect } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient, clearCSRFTokenCache, apiRequest, setCSRFToken } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { UserMenu } from "@/components/user-menu";
import { LanguageToggle } from "@/components/language-toggle";
import { applyPanelColors } from "@/lib/panel-colors";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";

/* Страницы панели загружаются отдельными частями, когда их открывают: браузер не скачивает весь интерфейс сразу. */
const Dashboard = lazy(() => import("@/pages/dashboard"));
const ServersPage = lazy(() => import("@/pages/servers"));
const ServerDetailPage = lazy(() => import("@/pages/server-detail"));
const NodesPage = lazy(() => import("@/pages/nodes"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const ActivityPage = lazy(() => import("@/pages/activity"));
const PluginsPage = lazy(() => import("@/pages/plugins"));
const UsersPage = lazy(() => import("@/pages/users"));
const KvmConsolePage = lazy(() => import("@/pages/kvm-console"));
const ApiPage = lazy(() => import("@/pages/api"));
const AntiDdosPage = lazy(() => import("@/pages/anti-ddos"));
const AccountPage = lazy(() => import("@/pages/account"));
const StatusPage = lazy(() => import("@/pages/status"));

function PageLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-label="Loading" />
    </div>
  );
}

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

/** Вкладки в порядке меню и права, которые их открывают (любого из списка достаточно). */
const PAGES: { path: string; permissions: UserPermission[] }[] = [
  { path: "/servers", permissions: ["servers.view"] },
  { path: "/nodes", permissions: ["nodes.view"] },
  { path: "/activity", permissions: ["activity.view"] },
  { path: "/plugins", permissions: ["plugins.view"] },
  { path: "/users", permissions: ["users.view", "users.manage"] },
  { path: "/kvm", permissions: ["kvm.access"] },
  { path: "/api", permissions: ["api.manage"] },
  { path: "/anti-ddos", permissions: ["ddos.view", "ddos.manage"] },
  { path: "/settings", permissions: ["settings.view", "settings.manage", "panel.colors"] },
  { path: "/account", permissions: ["account.manage"] },
];

function NoAccess() {
  return (
    <div className="p-6 space-y-2">
      <h1 className="text-2xl font-semibold">No access</h1>
      <p className="text-sm text-muted-foreground">Your account has no permissions yet. Ask an administrator to grant them.</p>
    </div>
  );
}

function Router({ user }: { user: User }) {
  const firstPage = PAGES.find((page) => page.permissions.some((p) => hasPermission(user, p)));
  return (
    <Switch>
      <Route path="/">
        {() =>
          hasPermission(user, "dashboard.view") ? (
            <Dashboard permissions={user.permissions} />
          ) : firstPage ? (
            <Redirect to={firstPage.path} />
          ) : (
            <NoAccess />
          )
        }
      </Route>
      {hasPermission(user, "account.manage") && <Route path="/account" component={AccountPage} />}
      {hasPermission(user, "servers.view") && <Route path="/servers" component={ServersPage} />}
      {hasPermission(user, "servers.view") && <Route path="/servers/:id" component={ServerDetailPage} />}
      {hasPermission(user, "nodes.view") && <Route path="/nodes" component={NodesPage} />}
      {hasPermission(user, "activity.view") && <Route path="/activity" component={ActivityPage} />}
      {hasPermission(user, "plugins.view") && <Route path="/plugins" component={PluginsPage} />}
      {hasPermission(user, "kvm.access") && <Route path="/kvm" component={KvmConsolePage} />}
      {(hasPermission(user, "users.view") || hasPermission(user, "users.manage")) && <Route path="/users" component={UsersPage} />}
      {hasPermission(user, "api.manage") && <Route path="/api" component={ApiPage} />}
      {(hasPermission(user, "ddos.view") || hasPermission(user, "ddos.manage")) && (
        <Route path="/anti-ddos">{() => <AntiDdosPage canManage={hasPermission(user, "ddos.manage")} />}</Route>
      )}
      {(hasPermission(user, "settings.view") || hasPermission(user, "settings.manage") || hasPermission(user, "panel.colors")) && (
        <Route path="/settings">
          {() => <SettingsPage permissions={user.permissions} />}
        </Route>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  const { data: panelSettings } = useQuery<{ panelName: string; primaryColor?: string; backgroundColor?: string; borderColor?: string; sidebarAccentColor?: string }>({
    queryKey: ["/api/settings/panel"],
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (panelSettings) applyPanelColors(panelSettings);
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
          if (data.csrfToken) {
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
      await apiRequest("POST", "/api/auth/logout");
    } catch (error) {
      console.error("Logout failed:", error);
    }
    clearCSRFTokenCache();
    queryClient.clear();
    setUser(null);
  };

  if (isCheckingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-label="Loading" />
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
          <AppSidebar user={user} />
          <div className="flex flex-1 flex-col overflow-hidden">
            <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-card/70 px-3 backdrop-blur sm:px-4">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <div className="flex items-center gap-1">
              <LanguageToggle />
              <UserMenu
                username={user.username}
                summary={user.isFullAccess ? "Full access" : `${user.permissions.length} permissions`}
                canOpenAccount={hasPermission(user, "account.manage")}
                onLogout={handleLogout}
              />
              </div>
            </header>
            <main className="flex-1 overflow-y-auto">
              <Suspense fallback={<PageLoading />}>
                <Router user={user} />
              </Suspense>
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
      {/* Страница состояния публичная: открывается без входа и без интерфейса панели. */}
      {window.location.pathname === "/status" ? (
        <Suspense fallback={<PageLoading />}>
          <StatusPage />
        </Suspense>
      ) : (
        <AppContent />
      )}
    </QueryClientProvider>
  );
}

export default App;
