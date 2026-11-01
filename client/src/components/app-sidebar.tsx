import { APP_RELEASE_LABEL } from "@shared/version";
import { LayoutGrid, Server, HardDrive, Settings, Activity, Package, Users, Terminal, KeyRound, ShieldCheck, UserCircle } from "lucide-react";
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
import type { UserPermission } from "@shared/schema";

interface User {
  id: string;
  username: string;
  permissions: UserPermission[];
}

interface NavItem {
  title: string;
  url: string;
  icon: typeof Server;
  testId: string;
  /** Пункт виден, если есть хотя бы одно из прав. */
  permissions: UserPermission[];
}

const SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Hosting",
    items: [
      { title: "Overview", url: "/", icon: LayoutGrid, testId: "link-dashboard", permissions: ["dashboard.view"] },
      { title: "Servers", url: "/servers", icon: Server, testId: "link-servers", permissions: ["servers.view"] },
      { title: "Nodes", url: "/nodes", icon: HardDrive, testId: "link-nodes", permissions: ["nodes.view"] },
      { title: "Activity", url: "/activity", icon: Activity, testId: "link-activity", permissions: ["activity.view"] },
      { title: "Plugins", url: "/plugins", icon: Package, testId: "link-plugins", permissions: ["plugins.view"] },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Users", url: "/users", icon: Users, testId: "link-users", permissions: ["users.view", "users.manage"] },
      { title: "API keys", url: "/api", icon: KeyRound, testId: "link-api", permissions: ["api.manage"] },
      { title: "DDoS protection", url: "/anti-ddos", icon: ShieldCheck, testId: "link-anti-ddos", permissions: ["ddos.view", "ddos.manage"] },
      { title: "Host console", url: "/kvm", icon: Terminal, testId: "link-kvm", permissions: ["kvm.access"] },
    ],
  },
  {
    label: "Panel",
    items: [
      { title: "Account", url: "/account", icon: UserCircle, testId: "link-account", permissions: ["account.manage"] },
      { title: "Settings", url: "/settings", icon: Settings, testId: "link-settings", permissions: ["settings.view", "settings.manage", "panel.colors"] },
    ],
  },
];

export const PANEL_LOGO = "https://i.postimg.cc/ryJJfhKn/1764373820789.png";

export function AppSidebar({ user }: { user: User }) {
  const [location] = useLocation();
  const { data: panelSettings } = useQuery<{ panelName: string }>({ queryKey: ["/api/settings/panel"] });
  const panelName = panelSettings?.panelName || "SparkPanel";

  const isActive = (url: string) => (url === "/" ? location === "/" : location === url || location.startsWith(`${url}/`));

  return (
    <Sidebar>
      <SidebarHeader className="px-4 pb-2 pt-4">
        <Link href="/" className="flex items-center gap-2.5 rounded-md">
          <img src={PANEL_LOGO} alt="" className="h-8 w-8 rounded-md object-cover" />
          <span className="truncate text-[1.05rem] font-semibold text-sidebar-foreground">{panelName}</span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-1">
        {SECTIONS.map((section) => {
          const items = section.items.filter((item) => item.permissions.some((p) => user.permissions.includes(p)));
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={section.label}>
              <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={isActive(item.url)}>
                        <Link href={item.url} data-testid={item.testId}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="px-4 pb-4">
        <span className="text-xs text-muted-foreground">SparkPanel {APP_RELEASE_LABEL}</span>
      </SidebarFooter>
    </Sidebar>
  );
}
