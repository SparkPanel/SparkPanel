import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { loginSchema, type Login } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Server, Lock, User } from "lucide-react";
import { clearCSRFTokenCache } from "@/lib/queryClient";

interface User {
  id: string;
  username: string;
  role: "admin" | "operator" | "viewer";
  allowedServerIds?: string[] | null;
}

interface LoginPageProps {
  onLogin: (user: User) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const { data: panelSettings } = useQuery<{ panelName: string; primaryColor?: string; backgroundColor?: string; borderColor?: string; sidebarAccentColor?: string }>({
    queryKey: ["/api/settings/panel"],
    retry: false,
  });

  const panelName = panelSettings?.panelName || "SparkPanel";

  // Конвертация hex в HSL формат (h s l)
  const hexToHsl = (hex: string): string => {
    if (!hex || hex.length !== 7 || !hex.startsWith("#")) {
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
    clearCSRFTokenCache(); // Очищаем кэш перед логином
    try {
      const result = await loginMutation(data);
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

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center mb-8 gap-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-md bg-primary">
            <Server className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-semibold text-foreground">{panelName}</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>
              Enter your credentials to access the control panel
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleLogin)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            {...field}
                            placeholder="Enter your username"
                            className="pl-10"
                            autoComplete="username"
                            data-testid="input-username"
                          />
                        </div>
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
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            {...field}
                            type="password"
                            placeholder="Enter your password"
                            className="pl-10"
                            autoComplete="current-password"
                            data-testid="input-password"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                  data-testid="button-login"
                >
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </Form>

            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-xs text-muted-foreground text-center">
                Default credentials: adplayer / 0000
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
