import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { changePasswordSchema, type ChangePassword } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Copy, KeyRound } from "lucide-react";

interface Me {
  user: {
    username: string;
    nickname?: string | null;
    permissions: string[];
    isFullAccess?: boolean;
    twoFactorEnabled?: boolean;
    recoveryCodesLeft?: number;
  };
}

interface SetupData {
  secret: string;
  uri: string;
  qr: string;
}

/** Личные настройки, доступные каждому пользователю: профиль, пароль и двухфакторная аутентификация. */
export default function AccountPage() {
  const { data: me } = useQuery<Me>({ queryKey: ["/api/auth/me"] });
  const user = me?.user;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-[1.6rem] font-semibold leading-tight">Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your profile, password and sign-in protection</p>
      </div>
      {user && <ProfileCard username={user.username} nickname={user.nickname ?? ""} permissionsCount={user.permissions.length} fullAccess={Boolean(user.isFullAccess)} />}
      <PasswordCard />
      {user && <TwoFactorCard enabled={Boolean(user.twoFactorEnabled)} recoveryCodesLeft={user.recoveryCodesLeft ?? 0} />}
    </div>
  );
}

function ProfileCard({ username, nickname, permissionsCount, fullAccess }: { username: string; nickname: string; permissionsCount: number; fullAccess: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(nickname);

  const save = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/auth/profile", { nickname: value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Saved", description: "Nickname updated" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              {`${fullAccess ? "Full access" : `${permissionsCount} permissions`}, signed in as ${username}`}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <label htmlFor="nickname" className="text-sm font-medium">Nickname</label>
        <div className="flex gap-2">
          <Input id="nickname" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Display name (optional)" maxLength={50} />
          <Button onClick={() => save.mutate()} disabled={save.isPending || value === nickname}>
            {save.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const { toast } = useToast();
  const form = useForm<ChangePassword>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const change = useMutation({
    mutationFn: (data: ChangePassword) => apiRequest("POST", "/api/auth/change-password", data),
    onSuccess: () => {
      toast({ title: "Password changed", description: "Use the new password next time you sign in" });
      form.reset();
    },
    onError: (e: any) => toast({ title: "Failed to change password", description: e.message, variant: "destructive" }),
  });

  const field = (name: keyof ChangePassword, label: string, autoComplete: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field: f }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...f} type="password" autoComplete={autoComplete} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div>
            <CardTitle>Password</CardTitle>
            <CardDescription>Change the password you sign in with</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => change.mutate(d))} className="space-y-4">
            {field("currentPassword", "Current password", "current-password")}
            <Separator />
            {field("newPassword", "New password", "new-password")}
            {field("confirmPassword", "Repeat new password", "new-password")}
            <div className="flex justify-end">
              <Button type="submit" disabled={change.isPending}>{change.isPending ? "Changing..." : "Change password"}</Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const { toast } = useToast();
  const text = codes.join("\n");
  return (
    <div className="space-y-3">
      <Alert>
        <KeyRound className="h-4 w-4" />
        <AlertTitle>Save your recovery codes</AlertTitle>
        <AlertDescription>
          If you lose your phone, each of these codes lets you sign in once instead of the app code. They are shown only now.
        </AlertDescription>
      </Alert>
      <div className="grid grid-cols-2 gap-2 font-mono text-sm bg-muted p-4 rounded-md">
        {codes.map((c) => <span key={c}>{c}</span>)}
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => {
            navigator.clipboard.writeText(text);
            toast({ title: "Copied", description: "Recovery codes copied to clipboard" });
          }}
        >
          <Copy className="w-4 h-4 mr-2" /> Copy
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([`SparkPanel recovery codes\n\n${text}\n`], { type: "text/plain" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = "sparkpanel-recovery-codes.txt";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Download .txt
        </Button>
        <Button onClick={onDone}>I saved them</Button>
      </div>
    </div>
  );
}

function TwoFactorCard({ enabled, recoveryCodesLeft }: { enabled: boolean; recoveryCodesLeft: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const refreshMe = () => queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
  const fail = (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" });

  const start = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/auth/2fa/setup", {})).json() as Promise<SetupData>,
    onSuccess: (data) => {
      setSetup(data);
      setCode("");
    },
    onError: fail,
  });

  const enable = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/auth/2fa/enable", { code })).json() as Promise<{ recoveryCodes: string[] }>,
    onSuccess: (data) => {
      setSetup(null);
      setCode("");
      setRecoveryCodes(data.recoveryCodes);
      refreshMe();
      toast({ title: "2FA enabled", description: "Next sign-in will ask for a code from the app" });
    },
    onError: fail,
  });

  const disable = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/2fa/disable", { code }),
    onSuccess: () => {
      setCode("");
      refreshMe();
      toast({ title: "2FA disabled" });
    },
    onError: fail,
  });

  const regenerate = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/auth/2fa/recovery-codes", { code })).json() as Promise<{ recoveryCodes: string[] }>,
    onSuccess: (data) => {
      setCode("");
      setRecoveryCodes(data.recoveryCodes);
      refreshMe();
    },
    onError: fail,
  });

  const codeInput = (placeholder: string) => (
    <Input
      value={code}
      onChange={(e) => setCode(e.target.value)}
      placeholder={placeholder}
      inputMode="numeric"
      autoComplete="one-time-code"
      className="font-mono tracking-widest"
      maxLength={9}
    />
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div>
            <CardTitle>Two-factor authentication</CardTitle>
            <CardDescription>A one-time code from an authenticator app on every sign-in</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {recoveryCodes ? (
          <RecoveryCodes codes={recoveryCodes} onDone={() => setRecoveryCodes(null)} />
        ) : enabled ? (
          <>
            <div className="p-3 rounded-md border border-primary/30 bg-primary/10 text-sm">
              <span className="font-medium">2FA is on.</span> Recovery codes left: {recoveryCodesLeft}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Current code from the app</label>
              {codeInput("123 456")}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => regenerate.mutate()} disabled={!code.trim() || regenerate.isPending}>
                  New recovery codes
                </Button>
                <Button variant="destructive" onClick={() => disable.mutate()} disabled={!code.trim() || disable.isPending}>
                  Turn off 2FA
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">To turn 2FA off you can also enter one of your recovery codes.</p>
            </div>
          </>
        ) : setup ? (
          <div className="space-y-4">
            <ol className="list-decimal list-inside space-y-1 text-sm">
              <li>Install Google Authenticator, Microsoft Authenticator, Aegis or any other TOTP app.</li>
              <li>In the app tap «+» → «Scan a QR code» and scan the code below.</li>
              <li>Enter the 6-digit code the app shows.</li>
            </ol>
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <img src={setup.qr} alt="QR code for the authenticator app" className="w-48 h-48 rounded-md border bg-white p-2" />
              <div className="space-y-2 text-sm min-w-0">
                <p className="text-muted-foreground">Can't scan? Add the account manually with this key:</p>
                <code className="block break-all bg-muted p-2 rounded font-mono">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Code from the app</label>
              {codeInput("123 456")}
              <div className="flex gap-2">
                <Button onClick={() => enable.mutate()} disabled={code.replace(/\s/g, "").length !== 6 || enable.isPending}>
                  {enable.isPending ? "Checking..." : "Turn on 2FA"}
                </Button>
                <Button variant="outline" onClick={() => setSetup(null)}>Cancel</Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Even if someone learns your password, they won't be able to sign in without your phone.
            </p>
            <Button onClick={() => start.mutate()} disabled={start.isPending}>
              {start.isPending ? "Preparing..." : "Set up 2FA"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
