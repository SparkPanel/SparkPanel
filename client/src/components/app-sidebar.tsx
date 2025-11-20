import { Home, Server, HardDrive, Settings, LogOut, Activity, Package, Users } from "lucide-react";
import { Link, useLocation } from "wouter";
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

interface User {
  id: string;
  username: string;
  role: "admin" | "operator" | "viewer";
  allowedServers?: string[] | null;
}

const menuItems = [
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
  },
  {
    title: "Nodes",
    url: "/nodes",
    icon: HardDrive,
    testId: "link-nodes",
  },
  {
    title: "Activity",
    url: "/activity",
    icon: Activity,
    testId: "link-activity",
  },
  {
    title: "Plugins",
    url: "/plugins",
    icon: Package,
    testId: "link-plugins",
  },
];

interface AppSidebarProps {
  user: User;
  onLogout: () => void;
}

export function AppSidebar({ user, onLogout }: AppSidebarProps) {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary">
            <Server className="w-6 h-6 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-semibold text-sidebar-foreground">SparkPanel</span>
            <span className="text-xs text-muted-foreground">v1.0 • Server Management</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
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

        {user.role === "admin" && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/users"}>
                    <Link href="/users" data-testid="link-users">
                      <Users className="w-4 h-4" />
                      <span>Users</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

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
      </SidebarContent>

      <SidebarFooter className="p-4">
        <Separator className="mb-4" />
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-sidebar-foreground truncate">
              {user.username}
            </span>
            <span className="text-xs text-muted-foreground">
              {user.role === "admin" ? "Administrator" : user.role === "operator" ? "Operator" : "Viewer"}
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
