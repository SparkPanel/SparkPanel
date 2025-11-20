import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Users, Plus, Trash2, Edit, Shield, User as UserIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Server } from "@shared/schema";

const createUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(50, "Username must be at most 50 characters"),
  password: z.string().min(4, "Password must be at least 4 characters"),
  role: z.enum(["admin", "operator", "viewer"]),
  allowedServers: z.array(z.string()).optional(),
});

const updateUserSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  password: z.string().min(4).optional(),
  role: z.enum(["admin", "operator", "viewer"]).optional(),
  allowedServers: z.array(z.string()).optional(),
});

type CreateUserForm = z.infer<typeof createUserSchema>;
type UpdateUserForm = z.infer<typeof updateUserSchema>;

interface CreateUserPayload {
  username: string;
  password: string;
  role: "admin" | "operator" | "viewer";
  allowedServerIds?: string[];
  allServersAccess?: boolean;
}

interface UpdateUserPayload {
  username?: string;
  password?: string;
  role?: "admin" | "operator" | "viewer";
  allowedServerIds?: string[];
  allServersAccess?: boolean;
}

interface User {
  id: string;
  username: string;
  role: "admin" | "operator" | "viewer";
  allowedServerIds?: string[] | null;
  hasAllServerAccess?: boolean;
  createdAt: Date;
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
      // Если роль admin, не отправляем allowedServerIds (доступ ко всем)
      // Если роль не admin и allowedServers не указан или пустой - доступ ко всем (null)
      // Если allowedServers содержит серверы - доступ только к выбранным
      const payload: CreateUserPayload = {
        username: data.username,
        password: data.password,
        role: data.role,
      };
      
      if (data.role !== "admin") {
        if (data.allowedServers && data.allowedServers.length > 0) {
          // Доступ только к выбранным серверам
          payload.allowedServerIds = data.allowedServers;
          payload.allServersAccess = false;
        } else {
          // Доступ ко всем серверам (по умолчанию для не-админов)
          payload.allServersAccess = true;
        }
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
      if (data.password !== undefined) payload.password = data.password;
      if (data.role !== undefined) payload.role = data.role;
      
      // Обработка доступа к серверам
      if (data.allowedServers !== undefined) {
        // Если роль admin, не отправляем allowedServerIds (доступ ко всем автоматически)
        // Если роль не admin и allowedServers не указан или пустой - доступ ко всем (null)
        // Если allowedServers содержит серверы - доступ только к выбранным
        const nextRole = data.role;
        if (nextRole === undefined || nextRole !== "admin") {
          if (data.allowedServers.length > 0) {
            // Доступ только к выбранным серверам
            payload.allowedServerIds = data.allowedServers;
            payload.allServersAccess = false;
          } else {
            // Доступ ко всем серверам
            payload.allServersAccess = true;
          }
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
            Manage users, roles, and server access permissions
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
            <Card key={user.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
                      {user.role === "admin" ? (
                        <Shield className="w-5 h-5 text-primary" />
                      ) : (
                        <UserIcon className="w-5 h-5 text-primary" />
                      )}
                    </div>
                    <div>
                      <CardTitle className="text-base">{user.username}</CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <Badge variant={user.role === "admin" ? "default" : user.role === "operator" ? "secondary" : "outline"}>
                          {user.role === "admin" ? "Administrator" : user.role === "operator" ? "Operator" : "Viewer"}
                        </Badge>
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
                      size="sm"
                      onClick={() => handleEdit(user)}
                      data-testid={`button-edit-user-${user.id}`}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Are you sure you want to delete user "${user.username}"?`)) {
                          deleteUserMutation.mutate(user.id);
                        }
                      }}
                      disabled={deleteUserMutation.isPending}
                      data-testid={`button-delete-user-${user.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
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
      role: "operator",
      allowedServers: [],
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
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Role</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="operator">Operator</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="admin">Administrator</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  Administrators have full access to all servers and settings
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {form.watch("role") !== "admin" && (
            <FormField
              control={form.control}
              name="allowedServers"
              render={() => (
                <FormItem>
                  <div className="mb-4">
                    <FormLabel className="text-base">Allowed Servers</FormLabel>
                    <FormDescription>
                      Select which servers this user can access. Leave empty to allow access to all servers.
                    </FormDescription>
                  </div>
                  {servers.map((server) => (
                    <FormField
                      key={server.id}
                      control={form.control}
                      name="allowedServers"
                      render={({ field }) => {
                        return (
                          <FormItem
                            key={server.id}
                            className="flex flex-row items-start space-x-3 space-y-0"
                          >
                            <FormControl>
                              <Checkbox
                                checked={field.value?.includes(server.id)}
                                onCheckedChange={(checked) => {
                                  return checked
                                    ? field.onChange([...(field.value || []), server.id])
                                    : field.onChange(
                                        field.value?.filter((value) => value !== server.id)
                                      );
                                }}
                              />
                            </FormControl>
                            <FormLabel className="font-normal">{server.name}</FormLabel>
                          </FormItem>
                        );
                      }}
                    />
                  ))}
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
      role: user.role,
      allowedServers: Array.isArray(user.allowedServerIds) ? user.allowedServerIds : [],
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
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="username" />
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
                  <Input {...field} type="password" placeholder="new password" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Role</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="operator">Operator</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="admin">Administrator</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  Administrators have full access to all servers and settings
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {form.watch("role") !== "admin" && (
            <FormField
              control={form.control}
              name="allowedServers"
              render={() => (
                <FormItem>
                  <div className="mb-4">
                    <FormLabel className="text-base">Allowed Servers</FormLabel>
                    <FormDescription>
                      Select which servers this user can access. Leave empty to allow access to all servers.
                    </FormDescription>
                  </div>
                  {servers.map((server) => (
                    <FormField
                      key={server.id}
                      control={form.control}
                      name="allowedServers"
                      render={({ field }) => {
                        return (
                          <FormItem
                            key={server.id}
                            className="flex flex-row items-start space-x-3 space-y-0"
                          >
                            <FormControl>
                              <Checkbox
                                checked={field.value?.includes(server.id)}
                                onCheckedChange={(checked) => {
                                  return checked
                                    ? field.onChange([...(field.value || []), server.id])
                                    : field.onChange(
                                        field.value?.filter((value) => value !== server.id)
                                      );
                                }}
                              />
                            </FormControl>
                            <FormLabel className="font-normal">{server.name}</FormLabel>
                          </FormItem>
                        );
                      }}
                    />
                  ))}
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Updating..." : "Update User"}
            </Button>
          </div>
        </form>
      </Form>
    </>
  );
}

