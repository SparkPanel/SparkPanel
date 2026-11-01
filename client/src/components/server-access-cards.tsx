import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Trash2, UserPlus } from "lucide-react";
import type { Server, UserPermission } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCan } from "@/lib/use-me";

type ServerWithAccess = Server & { isOwner: boolean; paidUntil: string | null; suspended: { at: string; reason: string } | null };

interface MembersView {
  owner: { id: string; username: string } | null;
  members: { userId: string; username: string; permissions: UserPermission[]; addedAt: string }[];
  available: UserPermission[];
}

const PERMISSION_LABELS: Partial<Record<UserPermission, string>> = {
  "servers.control": "Start and stop",
  "servers.console": "See the console",
  "servers.command": "Send commands",
  "servers.files": "Files",
  "servers.config": "Settings",
  "servers.backups": "Backups",
  "servers.ports": "Ports",
};

/** Доступ к серверу для других пользователей и (для администраторов) оплата. */
export function ServerAccessCards({ server }: { server: ServerWithAccess }) {
  const can = useCan();
  const canMembers = server.isOwner || can("users.manage", "servers.manage");
  return (
    <>
      {canMembers && <MembersCard server={server} />}
      {can("servers.manage") && <BillingCard server={server} />}
    </>
  );
}

function MembersCard({ server }: { server: ServerWithAccess }) {
  const { toast } = useToast();
  const queryKey = ["/api/servers", server.id, "members"];
  const { data } = useQuery<MembersView>({ queryKey });
  const [username, setUsername] = useState("");
  const [picked, setPicked] = useState<UserPermission[]>(["servers.control", "servers.console"]);

  const save = useMutation({
    mutationFn: async (input: { username: string; permissions: UserPermission[] }) => (await apiRequest("PUT", `/api/servers/${server.id}/members`, input)).json(),
    onSuccess: (next: MembersView) => {
      queryClient.setQueryData(queryKey, next);
      setUsername("");
      toast({ title: "Access saved" });
    },
    onError: (error: Error) => toast({ title: "Access not saved", description: error.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: async (userId: string) => (await apiRequest("DELETE", `/api/servers/${server.id}/members/${userId}`, {})).json(),
    onSuccess: (next: MembersView) => queryClient.setQueryData(queryKey, next),
    onError: (error: Error) => toast({ title: "Access not removed", description: error.message, variant: "destructive" }),
  });

  if (!data) return null;
  const choices = data.available.filter((p) => p !== "servers.view");
  const toggle = (list: UserPermission[], p: UserPermission, on: boolean) => (on ? [...list, p] : list.filter((x) => x !== p));

  return (
    <Card>
      <CardHeader>
        <CardTitle>People with access</CardTitle>
        <CardDescription>
          Share this server with other panel users. They see only this server and only what you allow.
          {data.owner && ` Owner: ${data.owner.username}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.members.length > 0 && (
          <ul className="divide-y rounded-md border">
            {data.members.map((member) => (
              <li key={member.userId} className="space-y-2 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{member.username}</span>
                  <Button variant="ghost" size="icon" className="ml-auto h-8 w-8 text-destructive" onClick={() => remove.mutate(member.userId)} aria-label={`Remove ${member.username}`}>
                    <Trash2 />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {choices.map((p) => (
                    <label key={p} className="flex items-center gap-1.5 text-sm">
                      <Checkbox
                        checked={member.permissions.includes(p)}
                        disabled={save.isPending}
                        onCheckedChange={(on) => {
                          const next = toggle(member.permissions, p, on === true).filter((x) => x !== "servers.view");
                          if (next.length) save.mutate({ username: member.username, permissions: next });
                        }}
                      />
                      {PERMISSION_LABELS[p] ?? p}
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-2 rounded-md border border-dashed p-3">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username of a panel user" aria-label="Username" className="sm:max-w-xs" />
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {choices.map((p) => (
              <label key={p} className="flex items-center gap-1.5 text-sm">
                <Checkbox checked={picked.includes(p)} onCheckedChange={(on) => setPicked(toggle(picked, p, on === true))} />
                {PERMISSION_LABELS[p] ?? p}
              </label>
            ))}
          </div>
          <Button size="sm" onClick={() => save.mutate({ username: username.trim(), permissions: picked })} disabled={!username.trim() || picked.length === 0 || save.isPending}>
            <UserPlus /> Give access
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Оплаченный срок и приостановка. Внешний биллинг делает то же через PUT /api/servers/:id/billing. */
function BillingCard({ server }: { server: ServerWithAccess }) {
  const { toast } = useToast();
  const [until, setUntil] = useState(server.paidUntil ? server.paidUntil.slice(0, 10) : "");
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiRequest("PUT", `/api/servers/${server.id}/billing`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servers", server.id] });
      toast({ title: "Saved" });
    },
    onError: (error: Error) => toast({ title: "Not saved", description: error.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment</CardTitle>
        <CardDescription>
          When the paid period ends, the server is stopped and cannot be started until it is renewed. Billing systems can set this through the API with a key that has servers.manage.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="paid-until">
            Paid until
          </label>
          <Input id="paid-until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="w-44" />
        </div>
        <Button variant="outline" disabled={save.isPending} onClick={() => save.mutate({ paidUntil: until ? new Date(`${until}T23:59:59`).toISOString() : null })}>
          {until ? "Save date" : "No end date"}
        </Button>
        {server.suspended ? (
          <Button disabled={save.isPending} onClick={() => save.mutate({ suspended: false })}>
            Unsuspend
          </Button>
        ) : (
          <Button variant="outline" className="text-destructive" disabled={save.isPending} onClick={() => save.mutate({ suspended: true, reason: "suspended by an administrator" })}>
            Suspend now
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
