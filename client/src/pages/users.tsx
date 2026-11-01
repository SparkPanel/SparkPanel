import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Users, Plus, Trash2, Edit, ChevronDown, ChevronRight, Check, MoreHorizontal, Search, Clock, ShieldOff, Gauge } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Server, UserPermission } from "@shared/schema";
import { userPermissions, permissionMeta } from "@shared/schema";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import { PageHeader, PageShell } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { PaginationBar, usePagination } from "@/components/pagination-bar";
import { useCan } from "@/lib/use-me";
import { QuotaDialog } from "@/components/quota-dialog";

const createUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(50, "Username must be at most 50 characters"),
  password: z.string().min(4, "Password must be at least 4 characters"),
  permissions: z.array(z.string()).min(1, "At least one permission is required"),
  allowedServers: z.array(z.string()).optional(),
  allServersAccess: z.boolean().default(true),
});

const updateUserSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  password: z.string().min(4).optional().or(z.literal("")),
  permissions: z.array(z.string()).optional(),
  allowedServers: z.array(z.string()).optional(),
  allServersAccess: z.boolean().optional(),
});

type CreateUserForm = z.infer<typeof createUserSchema>;
type UpdateUserForm = z.infer<typeof updateUserSchema>;

interface CreateUserPayload {
  username: string;
  password: string;
  permissions: string[];
  allowedServerIds?: string[];
  allServersAccess?: boolean;
}

interface UpdateUserPayload {
  username?: string;
  password?: string;
  permissions?: string[];
  allowedServerIds?: string[];
  allServersAccess?: boolean;
}

interface User {
  id: string;
  username: string;
  permissions: UserPermission[];
  allowedServerIds?: string[] | null;
  hasAllServerAccess?: boolean;
  isFullAccess?: boolean;
  twoFactorEnabled?: boolean;
  accessExpiresAt?: string | null;
  createdAt: Date;
}

const PERMISSION_PRESETS = {
  full: [...userPermissions] as UserPermission[],
  admin: ["dashboard.view", "account.manage", "servers.manage", "nodes.manage", "users.manage", "settings.manage", "api.manage", "ddos.manage", "backups.manage", "plugins.manage"] as UserPermission[],
  operator: ["dashboard.view", "account.manage", "servers.view", "servers.control", "servers.console", "servers.files", "servers.config", "servers.backups", "servers.ports", "nodes.view", "activity.view", "plugins.view", "backups.view", "logs.view"] as UserPermission[],
  viewer: ["dashboard.view", "account.manage", "servers.view", "nodes.view", "activity.view", "backups.view", "logs.view", "ddos.view"] as UserPermission[],
};

const PERMISSION_CATEGORIES = {
  General: ["dashboard.view", "account.manage"] as UserPermission[],
  Servers: userPermissions.filter(p => p.startsWith("servers.")),
  Nodes: userPermissions.filter(p => p.startsWith("nodes.")),
  Plugins: userPermissions.filter(p => p.startsWith("plugins.")),
  Administration: userPermissions.filter(p => p.startsWith("api.") || p.startsWith("ddos.")),
  Storage: userPermissions.filter(p => p.startsWith("backups.")),
  System: ["activity.view", "settings.view", "settings.manage", "panel.colors", "kvm.access", "logs.view"] as UserPermission[],
  Users: userPermissions.filter(p => p.startsWith("users.")),
};

function getPermissionLabel(permission: UserPermission): string {
  const meta = permissionMeta[permission];
  return meta?.label || permission;
}

function getPermissionDescription(permission: UserPermission): string {
  const meta = permissionMeta[permission];
  return meta?.description || "";
}

function countPermissionsByCategory(permissions: UserPermission[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [category, categoryPerms] of Object.entries(PERMISSION_CATEGORIES)) {
    counts[category] = categoryPerms.filter(p => permissions.includes(p)).length;
  }
  return counts;
}

export default function UsersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [search, setSearch] = useState("");
  const [accessFilter, setAccessFilter] = useState("all");
  const [toDelete, setToDelete] = useState<User | null>(null);
  const [tempFor, setTempFor] = useState<User | null>(null);
  const [resetFor, setResetFor] = useState<User | null>(null);
  const can = useCan();
  const canManage = can("users.manage");

  const { data: users = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: servers = [] } = useQuery<Server[]>({
    queryKey: ["/api/servers"],
    enabled: can("servers.view"),
  });

  const createUserMutation = useMutation({
    mutationFn: (data: CreateUserForm) => {
      const payload: CreateUserPayload = {
        username: data.username,
        password: data.password,
        permissions: data.permissions,
      };
      
      if (data.allServersAccess) {
        payload.allServersAccess = true;
      } else if (data.allowedServers && data.allowedServers.length > 0) {
        payload.allowedServerIds = data.allowedServers;
        payload.allServersAccess = false;
      } else {
        payload.allServersAccess = true;
      }
      
      return apiRequest("POST", "/api/users", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setCreateDialogOpen(false);
      toast({
        title: "User created",
        description: "User has been created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create user",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserForm }) => {
      const payload: UpdateUserPayload = {};
      if (data.username !== undefined) payload.username = data.username;
      if (data.password && data.password.length > 0) payload.password = data.password;
      if (data.permissions !== undefined) payload.permissions = data.permissions;
      
      if (data.allServersAccess !== undefined) {
        if (data.allServersAccess) {
          payload.allServersAccess = true;
        } else if (data.allowedServers && data.allowedServers.length > 0) {
          payload.allowedServerIds = data.allowedServers;
          payload.allServersAccess = false;
        }
      }
      
      return apiRequest("PUT", `/api/users/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setEditDialogOpen(false);
      setEditingUser(null);
      toast({
        title: "User updated",
        description: "User has been updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update user",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/users/${id}`, {}),
    onSuccess: () => {
      setToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "User deleted",
        description: "User has been deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete user",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const grantTempAccessMutation = useMutation({
    mutationFn: ({ id, minutes }: { id: string; minutes: number }) =>
      apiRequest("POST", `/api/users/${id}/temporary-access`, { durationMinutes: minutes }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/users"] }),
  });

  const revokeTempAccessMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/users/${id}/temporary-access`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/users"] }),
  });

  const resetTwoFactorMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/users/${id}/2fa/reset`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "2FA reset", description: "The user can sign in with the password and set up 2FA again" });
    },
    onError: (error: any) => toast({ title: "Failed to reset 2FA", description: error.message, variant: "destructive" }),
  });

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setEditDialogOpen(true);
  };

  const filtered = users.filter((u) => {
    const query = search.trim().toLowerCase();
    if (query && !u.username.toLowerCase().includes(query)) return false;
    if (accessFilter === "full") return Boolean(u.isFullAccess);
    if (accessFilter === "2fa") return Boolean(u.twoFactorEnabled);
    if (accessFilter === "temporary") return Boolean(u.accessExpiresAt);
    return true;
  });
  const pagination = usePagination(filtered, 25, `${search}|${accessFilter}`);
  const fullAccessCount = users.filter((u) => u.isFullAccess).length;

  return (
    <PageShell>
      <PageHeader
        title="Users"
        description={users.length ? `${users.length} ${users.length === 1 ? "account" : "accounts"}, ${fullAccessCount} with full access` : "Accounts that can sign in to the panel"}
        actions={
          canManage && (
            <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-user">
              <Plus /> New user
            </Button>
          )
        }
      />

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <CreateUserForm servers={servers} onSubmit={(data) => createUserMutation.mutate(data)} isLoading={createUserMutation.isPending} />
        </DialogContent>
      </Dialog>

      {users.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" placeholder="Search by username" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={accessFilter} onValueChange={setAccessFilter}>
            <SelectTrigger className="sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              <SelectItem value="full">Full access</SelectItem>
              <SelectItem value="2fa">With 2FA</SelectItem>
              <SelectItem value="temporary">Temporary access</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {usersLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={users.length ? "No users match" : "No users yet"}
          description={users.length ? "Change the search or filter." : "Create accounts for your team or customers and choose what each of them can do."}
        />
      ) : (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)_minmax(0,1fr)_6rem] gap-4 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground md:grid">
              <span>User</span>
              <span>Access</span>
              <span>Servers</span>
              <span className="text-right">Actions</span>
            </div>
            <ul className="divide-y">
              {pagination.pageItems.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  canManage={canManage}
                  onEdit={() => handleEdit(user)}
                  onDelete={() => setToDelete(user)}
                  onGrantTemporaryAccess={() => setTempFor(user)}
                  onRevokeTemporaryAccess={() => revokeTempAccessMutation.mutate(user.id)}
                  onResetTwoFactor={() => setResetFor(user)}
                />
              ))}
            </ul>
          </div>
          <PaginationBar {...pagination} noun="users" />
        </div>
      )}

      {editingUser && (
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <EditUserForm user={editingUser} servers={servers} onSubmit={(data) => updateUserMutation.mutate({ id: editingUser.id, data })} isLoading={updateUserMutation.isPending} />
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={tempFor !== null} onOpenChange={(open) => !open && setTempFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Temporary access for {tempFor?.username}</DialogTitle>
            <DialogDescription>After this time the account can no longer sign in or use API keys.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "1 hour", minutes: 60 },
              { label: "1 day", minutes: 1440 },
              { label: "7 days", minutes: 10080 },
              { label: "30 days", minutes: 43200 },
            ].map((option) => (
              <Button
                key={option.minutes}
                variant="outline"
                onClick={() => {
                  if (tempFor) grantTempAccessMutation.mutate({ id: tempFor.id, minutes: option.minutes });
                  setTempFor(null);
                }}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {toDelete?.username}?</AlertDialogTitle>
            <AlertDialogDescription>The account and its API keys stop working immediately. Servers are not deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep user</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => toDelete && deleteUserMutation.mutate(toDelete.id)}
            >
              Delete user
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resetFor !== null} onOpenChange={(open) => !open && setResetFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off 2FA for {resetFor?.username}?</AlertDialogTitle>
            <AlertDialogDescription>
              Use this when they lost their phone and recovery codes. They will sign in with the password only and can set up 2FA again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => resetFor && resetTwoFactorMutation.mutate(resetFor.id)}>Turn off 2FA</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

function UserRow({
  user,
  canManage,
  onEdit,
  onDelete,
  onGrantTemporaryAccess,
  onRevokeTemporaryAccess,
  onResetTwoFactor,
}: {
  user: User;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onGrantTemporaryAccess: () => void;
  onRevokeTemporaryAccess: () => void;
  onResetTwoFactor: () => void;
}) {
  const [quotaOpen, setQuotaOpen] = useState(false);
  const permCounts = countPermissionsByCategory(user.permissions);
  const groups = Object.entries(permCounts).filter(([, count]) => count > 0);

  return (
    <li
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)_minmax(0,1fr)_6rem]"
      data-testid={`card-user-${user.id}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
          {user.username.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{user.username}</p>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {user.twoFactorEnabled && <Badge variant="outline" className="px-1.5 py-0 text-[11px]">2FA</Badge>}
            {user.accessExpiresAt && <span className="text-warning">until {new Date(user.accessExpiresAt).toLocaleString()}</span>}
            <span className="md:hidden">{user.isFullAccess ? "Full access" : `${user.permissions.length} permissions`}</span>
          </div>
        </div>
      </div>

      <div className="hidden min-w-0 md:block">
        {user.isFullAccess ? (
          <span className="text-sm font-medium text-primary">Full access</span>
        ) : (
          <div className="min-w-0">
            <span className="text-sm">{user.permissions.length} permissions</span>
            <p className="truncate text-xs text-muted-foreground">{groups.map(([category]) => category).join(", ")}</p>
          </div>
        )}
      </div>

      <span className="hidden text-sm text-muted-foreground md:block">
        {user.hasAllServerAccess ? "All servers" : `${user.allowedServerIds?.length ?? 0} selected`}
      </span>

      <div className="flex items-center justify-end gap-1">
        {canManage && (
          <>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} aria-label={`Edit ${user.username}`} data-testid={`button-edit-user-${user.id}`}>
              <Edit />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`More actions for ${user.username}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {user.accessExpiresAt ? (
                  <DropdownMenuItem onSelect={onRevokeTemporaryAccess}>
                    <Clock className="mr-2 h-4 w-4" /> Make access permanent
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={onGrantTemporaryAccess}>
                    <Clock className="mr-2 h-4 w-4" /> Limit access in time
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => setQuotaOpen(true)}>
                  <Gauge className="mr-2 h-4 w-4" /> Server quota
                </DropdownMenuItem>
                {user.twoFactorEnabled && (
                  <DropdownMenuItem onSelect={onResetTwoFactor}>
                    <ShieldOff className="mr-2 h-4 w-4" /> Reset 2FA
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive" data-testid={`button-delete-user-${user.id}`}>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete user
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <QuotaDialog userId={user.id} username={user.username} open={quotaOpen} onOpenChange={setQuotaOpen} />
          </>
        )}
      </div>
    </li>
  );
}

function PermissionSelector({
  value,
  onChange,
}: {
  value: string[];
  onChange: (permissions: string[]) => void;
}) {
  const openWithSelection = (selected: string[]) =>
    Object.fromEntries(
      Object.entries(PERMISSION_CATEGORIES).map(([k, perms], i) => [k, i === 0 || perms.some((p) => selected.includes(p))]),
    );
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(() => openWithSelection(value));

  const toggleCategory = (category: string) => {
    setOpenCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  const togglePermission = (permission: string) => {
    if (value.includes(permission)) {
      onChange(value.filter(p => p !== permission));
    } else {
      onChange([...value, permission]);
    }
  };

  const toggleAllInCategory = (permissions: UserPermission[]) => {
    const allSelected = permissions.every(p => value.includes(p));
    if (allSelected) {
      onChange(value.filter(p => !permissions.includes(p as UserPermission)));
    } else {
      const newPerms = [...value];
      permissions.forEach(p => {
        if (!newPerms.includes(p)) {
          newPerms.push(p);
        }
      });
      onChange(newPerms);
    }
  };

  const applyPreset = (presetName: keyof typeof PERMISSION_PRESETS) => {
    const next = [...PERMISSION_PRESETS[presetName]];
    onChange(next);
    setOpenCategories(openWithSelection(next));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => applyPreset("full")}
          data-testid="button-preset-full"
        >
          <Check className="w-3 h-3 mr-1" />
          Full Access
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => applyPreset("operator")}
          data-testid="button-preset-operator"
        >
          Operator
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => applyPreset("viewer")}
          data-testid="button-preset-viewer"
        >
          Viewer
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange([])}
          data-testid="button-preset-clear"
        >
          Clear All
        </Button>
      </div>

      <div className="border rounded-md divide-y">
        {Object.entries(PERMISSION_CATEGORIES).map(([category, permissions]) => {
          const selectedCount = permissions.filter(p => value.includes(p)).length;
          const allSelected = selectedCount === permissions.length;
          
          return (
            <Collapsible
              key={category}
              open={openCategories[category]}
              onOpenChange={() => toggleCategory(category)}
            >
              <div className="flex items-center gap-2 p-3 hover-elevate">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={() => toggleAllInCategory(permissions)}
                  data-testid={`checkbox-category-${category}`}
                />
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center justify-between flex-1 text-left"
                  >
                    <span className="font-medium">{category}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {selectedCount}/{permissions.length}
                      </Badge>
                      {openCategories[category] ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent>
                <div className="px-3 pb-3 space-y-2">
                  {permissions.map((permission) => (
                    <label
                      key={permission}
                      className="flex items-start gap-3 p-2 rounded-md hover-elevate cursor-pointer"
                    >
                      <Checkbox
                        checked={value.includes(permission)}
                        onCheckedChange={() => togglePermission(permission)}
                        data-testid={`checkbox-permission-${permission}`}
                      />
                      <div className="space-y-1">
                        <div className="text-sm font-medium leading-none">
                          {getPermissionLabel(permission)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {getPermissionDescription(permission)}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}

function CreateUserForm({
  servers,
  onSubmit,
  isLoading,
}: {
  servers: Server[];
  onSubmit: (data: CreateUserForm) => void;
  isLoading: boolean;
}) {
  const form = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      username: "",
      password: "",
      permissions: ["servers.view"],
      allowedServers: [],
      allServersAccess: true,
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Create New User</DialogTitle>
        <DialogDescription>
          Create a new user account with custom permissions
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="username" data-testid="input-username" />
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
                  <Input {...field} type="password" placeholder="password" data-testid="input-password" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="permissions"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Permissions</FormLabel>
                <FormDescription>
                  Select which actions this user can perform
                </FormDescription>
                <FormControl>
                  <PermissionSelector
                    value={field.value}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="allServersAccess"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    data-testid="checkbox-all-servers"
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Access to all servers</FormLabel>
                  <FormDescription>
                    Uncheck to restrict access to specific servers only
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />

          {!form.watch("allServersAccess") && (
            <FormField
              control={form.control}
              name="allowedServers"
              render={() => (
                <FormItem>
                  <FormLabel>Allowed Servers</FormLabel>
                  <FormDescription>
                    Select which servers this user can access
                  </FormDescription>
                  <div className="space-y-2 mt-2">
                    {servers.map((server) => (
                      <FormField
                        key={server.id}
                        control={form.control}
                        name="allowedServers"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value?.includes(server.id)}
                                onCheckedChange={(checked) => {
                                  return checked
                                    ? field.onChange([...(field.value || []), server.id])
                                    : field.onChange(field.value?.filter((value) => value !== server.id));
                                }}
                                data-testid={`checkbox-server-${server.id}`}
                              />
                            </FormControl>
                            <FormLabel className="font-normal">{server.name}</FormLabel>
                          </FormItem>
                        )}
                      />
                    ))}
                    {servers.length === 0 && (
                      <p className="text-sm text-muted-foreground">No servers available</p>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="submit" disabled={isLoading} data-testid="button-submit-create-user">
              {isLoading ? "Creating..." : "Create User"}
            </Button>
          </div>
        </form>
      </Form>
    </>
  );
}

function EditUserForm({
  user,
  servers,
  onSubmit,
  isLoading,
}: {
  user: User;
  servers: Server[];
  onSubmit: (data: UpdateUserForm) => void;
  isLoading: boolean;
}) {
  const form = useForm<UpdateUserForm>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      username: user.username,
      password: "",
      permissions: [...user.permissions],
      allowedServers: Array.isArray(user.allowedServerIds) ? user.allowedServerIds : [],
      allServersAccess: user.hasAllServerAccess ?? true,
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit User</DialogTitle>
        <DialogDescription>
          Update user information and permissions
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="username" data-testid="input-edit-username" />
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
                <FormLabel>New Password (leave empty to keep current)</FormLabel>
                <FormControl>
                  <Input {...field} type="password" placeholder="new password" data-testid="input-edit-password" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="permissions"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Permissions</FormLabel>
                <FormDescription>
                  Select which actions this user can perform
                </FormDescription>
                <FormControl>
                  <PermissionSelector
                    value={field.value || []}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="allServersAccess"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    data-testid="checkbox-edit-all-servers"
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Access to all servers</FormLabel>
                  <FormDescription>
                    Uncheck to restrict access to specific servers only
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />

          {!form.watch("allServersAccess") && (
            <FormField
              control={form.control}
              name="allowedServers"
              render={() => (
                <FormItem>
                  <FormLabel>Allowed Servers</FormLabel>
                  <FormDescription>
                    Select which servers this user can access
                  </FormDescription>
                  <div className="space-y-2 mt-2">
                    {servers.map((server) => (
                      <FormField
                        key={server.id}
                        control={form.control}
                        name="allowedServers"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value?.includes(server.id)}
                                onCheckedChange={(checked) => {
                                  return checked
                                    ? field.onChange([...(field.value || []), server.id])
                                    : field.onChange(field.value?.filter((value) => value !== server.id));
                                }}
                                data-testid={`checkbox-edit-server-${server.id}`}
                              />
                            </FormControl>
                            <FormLabel className="font-normal">{server.name}</FormLabel>
                          </FormItem>
                        )}
                      />
                    ))}
                    {servers.length === 0 && (
                      <p className="text-sm text-muted-foreground">No servers available</p>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="submit" disabled={isLoading} data-testid="button-submit-edit-user">
              {isLoading ? "Updating..." : "Update User"}
            </Button>
          </div>
        </form>
      </Form>
    </>
  );
}
