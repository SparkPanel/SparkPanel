import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Key, Plus, Trash2, Copy, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Switch } from "@/components/ui/switch";
import type { UserPermission } from "@shared/schema";
import { userPermissions, permissionMeta } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusLed } from "@/components/status-badge";
import { PageHeader, PageShell } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";

const createApiKeySchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters").max(100, "Name must be at most 100 characters"),
  description: z.string().optional(),
  permissions: z.array(z.string()).min(1, "At least one permission is required"),
  expiresInDays: z.number().min(0).max(365).optional(),
});

type CreateApiKeyForm = z.infer<typeof createApiKeySchema>;

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  description?: string;
  permissions: UserPermission[];
  isActive: boolean;
  expiresAt?: Date | null;
  lastUsedAt?: Date | null;
  createdAt: Date;
  createdBy: string;
}

const PERMISSION_CATEGORIES = {
  Servers: userPermissions.filter(p => p.startsWith("servers.")),
  Nodes: userPermissions.filter(p => p.startsWith("nodes.")),
  Plugins: userPermissions.filter(p => p.startsWith("plugins.")),
  System: ["activity.view", "settings.view", "settings.manage", "panel.colors", "kvm.access", "logs.view"] as UserPermission[],
  Users: userPermissions.filter(p => p.startsWith("users.")),
  Administration: ["api.manage", "ddos.manage", "ddos.view"] as UserPermission[],
  Storage: userPermissions.filter(p => p.startsWith("backups.")),
};

const DOC_AUTH = `curl -H "X-API-Key: sp_your_key" https://panel.example.com/api/servers

# or
curl -H "Authorization: Bearer sp_your_key" https://panel.example.com/api/servers`;

const DOC_START = `curl -X POST -H "X-API-Key: sp_your_key" \\
  https://panel.example.com/api/servers/ID/start

curl -H "X-API-Key: sp_your_key" \\
  https://panel.example.com/api/servers/ID`;

const DOC_COMMAND = `curl -X POST -H "X-API-Key: sp_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"command": "say Hello"}' \\
  https://panel.example.com/api/servers/ID/command`;

const DOC_PYTHON = `import requests

PANEL = "https://panel.example.com"
HEADERS = {"X-API-Key": "sp_your_key"}

servers = requests.get(f"{PANEL}/api/servers", headers=HEADERS).json()
for s in servers:
    print(s["id"], s["name"], s["status"])

requests.post(f"{PANEL}/api/servers/{servers[0]['id']}/command",
              headers=HEADERS, json={"command": "say Hello"})`;

/** [метод, путь, право, описание] — пути и права совпадают с маршрутами server/routes.ts. */
const DOC_ENDPOINTS: [string, string, string, string][] = [
  ["GET", "/api/servers", "View servers", "List of servers with their status"],
  ["GET", "/api/servers/ID", "View servers", "One server: status, port, limits, settings"],
  ["GET", "/api/servers/ID/stats", "View servers", "CPU, RAM, disk, network, uptime (404 if the server is not running)"],
  ["POST", "/api/servers/ID/start", "Control servers", "Start (also /stop, /restart, /kill)"],
  ["POST", "/api/servers/ID/command", "Run commands", 'Command to the console: {"command": "..."}'],
  ["GET", "/api/servers/ID/files?path=/data", "Manage files", "Files in a folder"],
  ["GET", "/api/servers/ID/files/content?path=/data/file", "Manage files", "Read a text file"],
  ["PUT", "/api/servers/ID/files/content", "Manage files", 'Write a file: {"path": "...", "content": "..."}'],
  ["GET", "/api/servers/ID/backups", "Manage backups (server) or View backups", "List of backups"],
  ["POST", "/api/servers/ID/backups", "Manage backups", 'Create a backup: {"name": "..."}'],
  ["GET", "/api/nodes", "View nodes", "List of nodes"],
  ["GET", "/api/activity?limit=50", "View activity", "Activity log"],
  ["GET", "/api/system/info", "any key", "Panel version, storage type, Docker version"],
];

const DOC_CODES: [string, string][] = [
  ["200", "success"],
  ["201", "created"],
  ["202", "the action started in the background (start, stop, restart)"],
  ["400", "invalid request data"],
  ["401", "the key is missing, wrong, disabled or expired"],
  ["403", "the key lacks the permission or access to this server"],
  ["404", "not found"],
  ["409", "conflict: the port is taken or an action is already running on the server"],
  ["423", "the panel is in lockdown — only reading is allowed"],
  ["429", "too many requests (at most 60 commands a minute) or DDoS protection kicked in"],
  ["500", "internal panel error"],
];

function getPermissionLabel(permission: UserPermission): string {
  const meta = permissionMeta[permission];
  return meta?.label || permission;
}

export default function ApiPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingKey, setDeletingKey] = useState<ApiKey | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const { data: apiKeys = [], isLoading } = useQuery<ApiKey[]>({
    queryKey: ["/api/api-keys"],
  });

  const createForm = useForm<CreateApiKeyForm>({
    resolver: zodResolver(createApiKeySchema),
    defaultValues: {
      name: "",
      description: "",
      permissions: [],
      expiresInDays: undefined,
    },
  });

  const createApiKeyMutation = useMutation({
    mutationFn: async (data: CreateApiKeyForm) => {
      const payload: any = {
        name: data.name,
        description: data.description,
        permissions: data.permissions,
      };
      
      if (data.expiresInDays && data.expiresInDays > 0) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + data.expiresInDays);
        payload.expiresAt = expiresAt.toISOString();
      }
      
      const res = await apiRequest("POST", "/api/api-keys", payload);
      return (await res.json()) as ApiKey & { key: string };
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["/api/api-keys"] });
      setCreateDialogOpen(false);
      createForm.reset();
      setCreatedKey(created.key);
    },
    onError: (error: any) => {
      toast({
        title: "API key not created",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const toggleActiveKeyMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/api-keys/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/api-keys"] });
      toast({
        title: "Status updated",
        description: "API key status updated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const deleteApiKeyMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/api-keys/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/api-keys"] });
      setDeleteDialogOpen(false);
      setDeletingKey(null);
      toast({
        title: "API key deleted",
        description: "The API key was deleted",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete failed",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "The key was copied to the clipboard",
    });
  };

  const handleCreateSubmit = (data: CreateApiKeyForm) => {
    createApiKeyMutation.mutate(data);
  };

  const confirmDelete = (key: ApiKey) => {
    setDeletingKey(key);
    setDeleteDialogOpen(true);
  };

  const handleDelete = () => {
    if (deletingKey) {
      deleteApiKeyMutation.mutate(deletingKey.id);
    }
  };

  return (
    <PageShell className="max-w-5xl">
      <PageHeader
        title="API keys"
        description="Keys for scripts, bots and other programs that control the panel"
        actions={
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus /> Create key
          </Button>
        }
      />

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create a new API key</DialogTitle>
              <DialogDescription>
                Create a new API key to access the panel
              </DialogDescription>
            </DialogHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(handleCreateSubmit)} className="space-y-4">
                <FormField
                  control={createForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="My API key" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={createForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (optional)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="What the key is for…" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={createForm.control}
                  name="expiresInDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valid for (days)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="No limit" 
                          {...field} 
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                        />
                      </FormControl>
                      <FormDescription>
                        Leave empty for no expiry
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={createForm.control}
                  name="permissions"
                  render={() => (
                    <FormItem>
                      <FormLabel>Permissions</FormLabel>
                      <ScrollArea className="h-64 border rounded-md p-4">
                        {Object.entries(PERMISSION_CATEGORIES).map(([category, permissions]) => (
                          <div key={category} className="mb-4">
                            <h4 className="font-medium mb-2">{category}</h4>
                            {permissions.map((permission) => (
                              <FormField
                                key={permission}
                                control={createForm.control}
                                name="permissions"
                                render={({ field }) => {
                                  return (
                                    <FormItem
                                      key={permission}
                                      className="flex flex-row items-start space-x-3 space-y-0 mb-2"
                                    >
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value?.includes(permission)}
                                          onCheckedChange={(checked) => {
                                            return checked
                                              ? field.onChange([...field.value, permission])
                                              : field.onChange(
                                                  field.value?.filter(
                                                    (value) => value !== permission
                                                  )
                                                );
                                          }}
                                        />
                                      </FormControl>
                                      <FormLabel className="font-normal cursor-pointer">
                                        {getPermissionLabel(permission)}
                                      </FormLabel>
                                    </FormItem>
                                  );
                                }}
                              />
                            ))}
                          </div>
                        ))}
                      </ScrollArea>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createApiKeyMutation.isPending}>
                    {createApiKeyMutation.isPending ? "Creating…" : "Create"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
      </Dialog>

      <Tabs defaultValue="keys">
        <TabsList>
          <TabsTrigger value="keys">Keys</TabsTrigger>
          <TabsTrigger value="docs">Documentation</TabsTrigger>
        </TabsList>

        <TabsContent value="keys" className="space-y-4">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : apiKeys.length === 0 ? (
            <EmptyState
              icon={Key}
              title="No keys yet"
              description="Create a key to control servers from your scripts. The key is shown once — save it right away."
              action={
                <Button onClick={() => setCreateDialogOpen(true)}>
                  <Plus /> Create key
                </Button>
              }
            />
          ) : (
            <ul className="divide-y rounded-lg border bg-card">
              {apiKeys.map((key) => {
                const isExpired = key.expiresAt ? new Date(key.expiresAt) < new Date() : false;
                const state = isExpired ? "error" : key.isActive ? "running" : "stopped";
                return (
                  <li key={key.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-4">
                    <StatusLed status={state} className="mt-1.5" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm">
                        <span className="font-medium">{key.name}</span>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">{key.keyPrefix}…</span>
                        {isExpired && <span className="ml-2 text-xs text-destructive">expired</span>}
                        {!isExpired && !key.isActive && <span className="ml-2 text-xs text-muted-foreground">disabled</span>}
                      </p>
                      {key.description && <p className="text-sm text-muted-foreground">{key.description}</p>}
                      <p className="text-xs text-muted-foreground">
                        {key.permissions.length} {key.permissions.length === 1 ? "permission" : "permissions"}: {key.permissions.map((p) => getPermissionLabel(p)).join(", ")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Created {formatDistanceToNow(new Date(key.createdAt), { addSuffix: true, locale: ru })}
                        {key.lastUsedAt ? `, used${formatDistanceToNow(new Date(key.lastUsedAt), { addSuffix: true, locale: ru })}` : ", not used yet"}
                        {key.expiresAt && !isExpired ? `, expires${formatDistanceToNow(new Date(key.expiresAt), { addSuffix: true, locale: ru })}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={key.isActive}
                        onCheckedChange={(checked) => toggleActiveKeyMutation.mutate({ id: key.id, isActive: checked })}
                        disabled={isExpired}
                        aria-label={key.isActive ? `Disable${key.name}` : `Enable${key.name}`}
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => confirmDelete(key)} aria-label={`Delete${key.name}`}>
                        <Trash2 />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="docs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>API documentation</CardTitle>
              <CardDescription>How to control the panel from scripts, bots and other programs</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>A key is a password</AlertTitle>
                <AlertDescription>
                  Do not publish the key in repositories or chats. If a key leaks, delete it here and it stops working immediately.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <h3 className="text-lg font-semibold">How to send the key</h3>
                <p className="text-muted-foreground">
                  The API address is your panel address plus <code className="bg-muted px-1 rounded">/api/...</code>. Send the key in one of these headers:
                </p>
                <pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm">{DOC_AUTH}</pre>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  <li>A key gets only the permissions checked when it was created, and only those its owner has. If the owner loses a permission, the key loses it too.</li>
                  <li>Requests with a key need no CSRF token.</li>
                  <li>A key cannot create other keys — only the panel can.</li>
                  <li>If the user has access to only some servers, the key sees only those.</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Main requests</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2 pr-4">Request</th>
                        <th className="py-2 pr-4">Permission needed</th>
                        <th className="py-2">What it does</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DOC_ENDPOINTS.map(([method, path, permission, description]) => (
                        <tr key={method + path} className="border-b last:border-0 align-top">
                          <td className="py-2 pr-4 font-mono text-xs whitespace-nowrap">
                            <Badge variant="outline" className="mr-2 font-mono">{method}</Badge>
                            {path}
                          </td>
                          <td className="py-2 pr-4 text-xs">{permission}</td>
                          <td className="py-2 text-muted-foreground">{description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">
                  The server ID is the field <code>id</code> from the response of <code>GET /api/servers</code> (or from the address of the server page in the panel).
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Examples</h3>
                <p className="text-sm font-medium">Start a server and check its status</p>
                <pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm">{DOC_START}</pre>
                <p className="text-sm text-muted-foreground">
                  Start, stop and restart run in the background: the response <code>202</code> comes back at once, and the final status (<code>running</code>, <code>stopped</code> or <code>error</code>) is in <code>GET /api/servers/ID</code>.
                </p>
                <p className="text-sm font-medium">Send a command to the console</p>
                <pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm">{DOC_COMMAND}</pre>
                <p className="text-sm font-medium">The same in Python</p>
                <pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm">{DOC_PYTHON}</pre>
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Response codes</h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {DOC_CODES.map(([code, text]) => (
                    <li key={code}>
                      <code className="bg-muted px-1 py-0.5 rounded">{code}</code> — {text}
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-muted-foreground">
                  On an error the response body has the field <code>message</code> with the reason.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={createdKey !== null} onOpenChange={(open) => !open && setCreatedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API key created</DialogTitle>
            <DialogDescription>
              Copy the key now — for security it is stored only as a hash and will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input value={createdKey ?? ""} readOnly className="font-mono text-sm" />
            <Button variant="outline" size="icon" onClick={() => createdKey && copyToClipboard(createdKey)}>
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The API key "{deletingKey?.name}" will be deleted for good.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
