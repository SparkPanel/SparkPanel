import { useState, useEffect, type ComponentType, type ReactNode } from "react";
import { Bot, Boxes, Crosshair, DatabaseBackup, Gamepad2, Globe, Network, Sword, TerminalSquare } from "lucide-react";
import { NodeBoard, type BoardUnit } from "@/components/node-board";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { loginSchema, type Login, type UserPermission } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { clearCSRFTokenCache } from "@/lib/queryClient";
import { applyPanelColors } from "@/lib/panel-colors";
import { PANEL_LOGO } from "@/components/app-sidebar";
import { APP_RELEASE_LABEL } from "@shared/version";
import { LanguageToggle } from "@/components/language-toggle";

interface User {
  id: string;
  username: string;
  permissions: UserPermission[];
  allowedServerIds?: string[] | null;
  hasAllServerAccess?: boolean;
  isFullAccess?: boolean;
}

interface LoginPageProps {
  onLogin: (user: User) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [require2FA, setRequire2FA] = useState(false);
  const [twoFACode, setTwoFACode] = useState("");
  const { toast } = useToast();

  const { data: panelSettings } = useQuery<{ panelName: string; primaryColor?: string; backgroundColor?: string; borderColor?: string; sidebarAccentColor?: string }>({
    queryKey: ["/api/settings/panel"],
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });

  const panelName = panelSettings?.panelName || "SparkPanel";

  useEffect(() => {
    if (panelSettings) applyPanelColors(panelSettings);
  }, [panelSettings]);

  const form = useForm<Login>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const loginMutation = async (data: Login) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Invalid credentials");
    }

    return response.json();
  };

  const handleLogin = async (data: Login) => {
    setIsLoading(true);
    clearCSRFTokenCache();
    try {
      const result = await loginMutation(data);

      if (result.csrfToken) {
        const { setCSRFToken } = await import("../lib/queryClient");
        setCSRFToken(result.csrfToken);
      }

      if (result.require2FA) {
        setRequire2FA(true);
        setIsLoading(false);
        return;
      }

      toast({
        title: "Login successful",
        description: `Welcome to ${panelName}`,
      });
      onLogin(result.user);
    } catch (error: any) {
      toast({
        title: "Login failed",
        description: error.message || "Invalid credentials",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify2FA = async () => {
    if (twoFACode.replace(/[\s-]/g, "").length < 6) {
      toast({
        title: "Invalid code",
        description: "Enter the 6-digit code from the app or a recovery code",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: twoFACode }),
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Invalid 2FA code");
      }

      const result = await response.json();
      
      if (result.csrfToken) {
        const { setCSRFToken } = await import("../lib/queryClient");
        setCSRFToken(result.csrfToken);
      }
      
      toast({
        title: "Login successful",
        description: `Welcome to ${panelName}`,
      });
      onLogin(result.user);
    } catch (error: any) {
      toast({
        title: "Verification failed",
        description: error.message || "Invalid 2FA code",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (require2FA) {
    return (
      <AuthLayout panelName={panelName}>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Confirm it's you</h1>
          <p className="text-sm text-muted-foreground">
            Open your authenticator app and enter the 6-digit code for {panelName}. Lost your phone? Enter a recovery code instead.
          </p>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="2fa-code" className="text-sm font-medium">
              Code
            </label>
            <Input
              id="2fa-code"
              type="text"
              placeholder="000000"
              maxLength={9}
              inputMode="numeric"
              autoComplete="one-time-code"
              value={twoFACode}
              onChange={(e) => setTwoFACode(e.target.value.toUpperCase().replace(/[^0-9A-Z-]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && handleVerify2FA()}
              className="h-11 text-center font-mono text-lg tracking-[0.3em]"
              autoFocus
            />
          </div>
          <Button onClick={handleVerify2FA} className="h-10 w-full" disabled={isLoading || twoFACode.replace(/-/g, "").length < 6}>
            {isLoading ? "Checking…" : "Continue"}
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout panelName={panelName}>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted-foreground">Use the account your administrator gave you.</p>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleLogin)} className="space-y-4">
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <Input {...field} className="h-10" autoComplete="username" autoFocus data-testid="input-username" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input {...field} type="password" className="h-10" autoComplete="current-password" data-testid="input-password" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="h-10 w-full" disabled={isLoading} data-testid="button-login">
            {isLoading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Form>
    </AuthLayout>
  );
}

/** Стойка серверов на экране входа: каждый юнит со светодиодами состояния. Чисто декоративная. */
/** Пример ноды на странице входа: до входа реальные серверы не показываются, поэтому данные вымышленные. */
const DEMO_UNITS: BoardUnit[] = [
  { id: "1", name: "survival", kind: "Minecraft · Paper", port: 25565, status: "running", icon: Gamepad2, load: [32, 38, 35, 44, 52, 48, 57, 61, 55, 63, 58, 66] },
  { id: "2", name: "creative", kind: "Minecraft · Fabric", port: 25566, status: "running", icon: Gamepad2, load: [18, 22, 20, 19, 26, 24, 21, 27, 25, 23, 28, 26] },
  { id: "3", name: "telegram-bot", kind: "Python", port: 8443, status: "running", icon: Bot, load: [6, 8, 7, 12, 9, 7, 8, 14, 9, 8, 10, 9] },
  { id: "4", name: "proxy", kind: "Velocity", port: 25577, status: "starting", icon: Network, load: [] },
  { id: "5", name: "site", kind: "Node.js", port: 8080, status: "running", icon: Globe, load: [12, 15, 22, 18, 30, 26, 21, 34, 29, 24, 31, 27] },
  { id: "6", name: "cs2-public", kind: "Counter-Strike 2", port: 27015, status: "stopped", icon: Crosshair, load: [] },
  { id: "7", name: "valheim", kind: "Valheim · BepInEx", port: 2456, status: "running", icon: Sword, load: [40, 46, 43, 51, 47, 55, 49, 58, 53, 50, 56, 52] },
];

const HIGHLIGHTS: { icon: ComponentType<{ className?: string }>; text: string }[] = [
  { icon: Boxes, text: "Each server in its own Docker container" },
  { icon: DatabaseBackup, text: "Backups on a schedule, copies to S3" },
  { icon: TerminalSquare, text: "Console, files and players in the browser" },
];

function AuthLayout({ panelName, children }: { panelName: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen w-full bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <div className="flex items-center gap-2.5">
          <img src={PANEL_LOGO} alt="" className="h-9 w-9 rounded-md object-cover" />
          <span className="text-lg font-semibold">{panelName}</span>
          <LanguageToggle className="ml-auto" />
        </div>
        <div className="flex flex-1 items-center">
          <div className="mx-auto w-full max-w-sm space-y-7 py-12">{children}</div>
        </div>
        <p className="text-xs text-muted-foreground">SparkPanel {APP_RELEASE_LABEL}</p>
      </div>

      <div className="relative hidden overflow-hidden bg-[hsl(213_26%_8%)] lg:flex lg:flex-col lg:justify-center lg:px-14" aria-hidden="true">
        {/* Мягкое свечение цвета панели за стойкой. */}
        <div className="pointer-events-none absolute left-1/2 top-[38%] h-[420px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.12] blur-[100px]" />

        <div className="relative mx-auto w-full max-w-md space-y-10">
          {/* Тот же вид, что у нод на главной панели; здесь всегда в тёмной теме. */}
          <div className="dark">
            <NodeBoard
              title="node-1"
              subtitle="Frankfurt"
              units={DEMO_UNITS}
              className="border-white/[0.08] bg-[hsl(213_24%_11%)] shadow-[0_24px_60px_-20px_rgb(0_0_0/0.6)]"
              footer={
                <>
                  <span>CPU 38%</span>
                  <span>RAM 21.4 / 64 GB</span>
                  <span>Disk 312 / 1000 GB</span>
                </>
              }
            />
          </div>
          <div className="space-y-5">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold leading-tight tracking-tight text-[hsl(216_22%_94%)]">Game servers, bots and websites in one place</h2>
              <p className="text-[15px] leading-relaxed text-[hsl(215_14%_62%)]">Start them, watch them and fix them from any device.</p>
            </div>
            <ul className="space-y-2.5">
              {HIGHLIGHTS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm text-[hsl(216_22%_80%)]">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03]">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
