import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
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
import NotFound from "@/pages/not-found";

interface User {
  id: string;
  username: string;
  role: "admin" | "operator" | "viewer";
  allowedServers?: string[] | null;
}

function Router({ user, onLogout }: { user: User; onLogout: () => void }) {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/servers" component={ServersPage} />
      <Route path="/servers/:id" component={ServerDetailPage} />
      <Route path="/nodes" component={NodesPage} />
      <Route path="/activity" component={ActivityPage} />
      <Route path="/plugins" component={PluginsPage} />
      {user.role === "admin" && <Route path="/users" component={UsersPage} />}
      <Route path="/settings">
        {() => <SettingsPage username={user.username} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
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
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <LoginPage onLogin={handleLogin} />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  );
}

export default App;
