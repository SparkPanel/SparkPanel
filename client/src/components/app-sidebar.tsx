import { Home, Server, HardDrive, Settings, LogOut, Activity, Package, Users, Terminal, Key, Shield } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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

interface MenuItem {
  title: string;
  url: string;
  icon: typeof Home;
  testId: string;
  permission?: UserPermission;
}

const menuItems: MenuItem[] = [
  {
    title: "Dashboard",
    url: "/",
    icon: Home,
    testId: "link-dashboard",
  },
  {
    title: "Servers",
    url: "/servers",
    icon: Server,
    testId: "link-servers",
    permission: "servers.view",
  },
  {
    title: "Nodes",
    url: "/nodes",
    icon: HardDrive,
    testId: "link-nodes",
    permission: "nodes.view",
  },
  {
    title: "Activity",
    url: "/activity",
    icon: Activity,
    testId: "link-activity",
    permission: "activity.view",
  },
  {
    title: "Plugins",
    url: "/plugins",
    icon: Package,
    testId: "link-plugins",
    permission: "plugins.view",
  },
];

interface AppSidebarProps {
  user: User;
  onLogout: () => void;
}

export function AppSidebar({ user, onLogout }: AppSidebarProps) {
  const [location] = useLocation();

  const { data: panelSettings } = useQuery<{ panelName: string }>({
    queryKey: ["/api/settings/panel"],
  });

  const panelName = panelSettings?.panelName || "SparkPanel";

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <img 
            src="https://i.postimg.cc/ryJJfhKn/1764373820789.png" 
            alt="Logo" 
            className="w-10 h-10 rounded-md object-cover"
          />
          <div className="flex flex-col">
            <span className="text-base font-semibold text-sidebar-foreground">{panelName}</span>
            <span className="text-xs text-muted-foreground">SparkPanel v1.3.1 • Управление сервером</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems
                .filter((item) => !item.permission || hasPermission(user, item.permission))
                .map((item) => {
                  const isActive = location === item.url;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <Link href={item.url} data-testid={item.testId}>
                          <item.icon className="w-4 h-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {(hasPermission(user, "users.view") || hasPermission(user, "users.manage") || hasPermission(user, "kvm.access") || hasPermission(user, "api.manage") || hasPermission(user, "ddos.manage")) && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {(hasPermission(user, "users.view") || hasPermission(user, "users.manage")) && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === "/users"}>
                      <Link href="/users" data-testid="link-users">
                        <Users className="w-4 h-4" />
                        <span>Users</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {hasPermission(user, "kvm.access") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === "/kvm"}>
                      <Link href="/kvm" data-testid="link-kvm">
                        <Terminal className="w-4 h-4" />
                        <span>KVM Console</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {hasPermission(user, "api.manage") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === "/api"}>
                      <Link href="/api" data-testid="link-api">
                        <Key className="w-4 h-4" />
                        <span>API</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {hasPermission(user, "ddos.manage") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === "/anti-ddos"}>
                      <Link href="/anti-ddos" data-testid="link-anti-ddos">
                        <Shield className="w-4 h-4" />
                        <span>Anti-DDoS</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {(hasPermission(user, "settings.view") || hasPermission(user, "settings.manage")) && (
          <SidebarGroup>
            <SidebarGroupLabel>System</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/settings"}>
                    <Link href="/settings" data-testid="link-settings">
                      <Settings className="w-4 h-4" />
                      <span>Settings</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4">
        <Separator className="mb-4" />
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-sidebar-foreground truncate">
              {user.username}
            </span>
            <span className="text-xs text-muted-foreground">
              {user.isFullAccess ? "Full Access" : `${user.permissions.length} permissions`}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onLogout}
            data-testid="button-logout"
            className="shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
