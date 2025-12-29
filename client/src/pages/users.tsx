import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Users, Plus, Trash2, Edit, Shield, User as UserIcon, ChevronDown, ChevronRight, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Server, UserPermission } from "@shared/schema";
import { userPermissions, permissionMeta } from "@shared/schema";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
  createdAt: Date;
}

const PERMISSION_PRESETS = {
  full: [...userPermissions] as UserPermission[],
  admin: ["servers.manage", "nodes.manage", "users.manage", "settings.manage", "api.manage", "ddos.manage", "backups.manage", "plugins.manage"] as UserPermission[],
  operator: ["servers.view", "servers.control", "servers.console", "servers.files", "servers.config", "servers.backups", "servers.ports", "nodes.view", "activity.view", "plugins.view", "backups.view", "logs.view"] as UserPermission[],
  viewer: ["servers.view", "nodes.view", "activity.view", "backups.view", "logs.view", "api.read", "ddos.view"] as UserPermission[],
};

const PERMISSION_CATEGORIES = {
  Серверы: userPermissions.filter(p => p.startsWith("servers.")),
  Ноды: userPermissions.filter(p => p.startsWith("nodes.")),
  Плагины: userPermissions.filter(p => p.startsWith("plugins.")),
  Администрирование: userPermissions.filter(p => p.startsWith("api.") || p.startsWith("ddos.")),
  Хранилище: userPermissions.filter(p => p.startsWith("backups.")),
  Система: ["activity.view", "settings.view", "settings.manage", "panel.colors", "kvm.access", "logs.view"] as UserPermission[],
  Пользователи: userPermissions.filter(p => p.startsWith("users.")),
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

  const { data: users = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: servers = [] } = useQuery<Server[]>({
    queryKey: ["/api/servers"],
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

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setEditDialogOpen(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Users</h1>
          <p className="text-sm text-muted-foreground">
            Manage users and their individual permissions
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-user">
              <Plus className="w-4 h-4 mr-2" />
              Create User
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <CreateUserForm
              servers={servers}
              onSubmit={(data) => createUserMutation.mutate(data)}
              isLoading={createUserMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      {usersLoading ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading users...</p>
        </div>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Users className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No users yet</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Create your first user to get started
            </p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create User
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {users.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              onEdit={() => handleEdit(user)}
              onDelete={() => {
                if (confirm(`Are you sure you want to delete user "${user.username}"?`)) {
                  deleteUserMutation.mutate(user.id);
                }
              }}
              isDeleting={deleteUserMutation.isPending}
            />
          ))}
        </div>
      )}

      {editingUser && (
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <EditUserForm
              user={editingUser}
              servers={servers}
              onSubmit={(data) => updateUserMutation.mutate({ id: editingUser.id, data })}
              isLoading={updateUserMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function UserCard({
  user,
  onEdit,
  onDelete,
  isDeleting,
}: {
  user: User;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const permCounts = countPermissionsByCategory(user.permissions);
  
  return (
    <Card data-testid={`card-user-${user.id}`}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
              {user.isFullAccess ? (
                <Shield className="w-5 h-5 text-primary" />
              ) : (
                <UserIcon className="w-5 h-5 text-primary" />
              )}
            </div>
            <div>
              <CardTitle className="text-base">{user.username}</CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1 flex-wrap">
                {user.isFullAccess ? (
                  <Badge variant="default">Full Access</Badge>
                ) : (
                  <Badge variant="secondary">{user.permissions.length} permissions</Badge>
                )}
                {!user.hasAllServerAccess && user.allowedServerIds && user.allowedServerIds.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {user.allowedServerIds.length} server{user.allowedServerIds.length !== 1 ? "s" : ""}
                  </span>
                )}
                {user.hasAllServerAccess && (
                  <span className="text-xs text-muted-foreground">
                    All servers
                  </span>
                )}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onEdit}
              data-testid={`button-edit-user-${user.id}`}
            >
              <Edit className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              disabled={isDeleting}
              data-testid={`button-delete-user-${user.id}`}
            >
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        </div>
        
        {!user.isFullAccess && (
          <div className="flex flex-wrap gap-2 mt-3">
            {Object.entries(permCounts).map(([category, count]) => (
              count > 0 && (
                <Badge key={category} variant="outline" className="text-xs">
                  {category}: {count}
                </Badge>
              )
            ))}
          </div>
        )}
      </CardHeader>
    </Card>
  );
}

function PermissionSelector({
  value,
  onChange,
}: {
  value: string[];
  onChange: (permissions: string[]) => void;
}) {
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
    Servers: true,
    Nodes: false,
    Plugins: false,
    System: false,
    Users: false,
  });

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

  const toggleAllInCategory = (category: string, permissions: UserPermission[]) => {
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
    onChange([...PERMISSION_PRESETS[presetName]]);
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
                  onCheckedChange={() => toggleAllInCategory(category, permissions)}
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
      permissions: [...PERMISSION_PRESETS.operator],
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
