import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Key, Plus, Trash2, Copy, Eye, EyeOff, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  key: string;
  description?: string;
  permissions: UserPermission[];
  isActive: boolean;
  expiresAt?: Date | null;
  lastUsedAt?: Date | null;
  createdAt: Date;
  createdBy: string;
}

const PERMISSION_CATEGORIES = {
  Серверы: userPermissions.filter(p => p.startsWith("servers.")),
  Ноды: userPermissions.filter(p => p.startsWith("nodes.")),
  Плагины: userPermissions.filter(p => p.startsWith("plugins.")),
  Система: ["activity.view", "settings.view", "settings.manage", "panel.colors", "kvm.access", "logs.view"] as UserPermission[],
  Пользователи: userPermissions.filter(p => p.startsWith("users.")),
  Администрирование: ["api.manage", "api.read", "ddos.manage", "ddos.view"] as UserPermission[],
  Хранилище: userPermissions.filter(p => p.startsWith("backups.")),
};

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
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

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
    mutationFn: (data: CreateApiKeyForm) => {
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
      
      return apiRequest("POST", "/api/api-keys", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/api-keys"] });
      setCreateDialogOpen(false);
      createForm.reset();
      toast({
        title: "API ключ создан",
        description: "API ключ успешно создан",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка создания API ключа",
        description: error.message || "Произошла ошибка",
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
        title: "Статус обновлен",
        description: "Статус API ключа обновлен",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка обновления",
        description: error.message || "Произошла ошибка",
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
        title: "API ключ удален",
        description: "API ключ успешно удален",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка удаления",
        description: error.message || "Произошла ошибка",
        variant: "destructive",
      });
    },
  });

  const toggleKeyVisibility = (keyId: string) => {
    setVisibleKeys(prev => {
      const newSet = new Set(prev);
      if (newSet.has(keyId)) {
        newSet.delete(keyId);
      } else {
        newSet.add(keyId);
      }
      return newSet;
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Скопировано",
      description: "Ключ скопирован в буфер обмена",
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
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Key className="w-8 h-8" />
            Управление API
          </h1>
          <p className="text-muted-foreground mt-1">
            Создавайте и управляйте API ключами для программного доступа к панели
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Создать API ключ
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Создать новый API ключ</DialogTitle>
              <DialogDescription>
                Создайте новый API ключ для доступа к панели
              </DialogDescription>
            </DialogHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(handleCreateSubmit)} className="space-y-4">
                <FormField
                  control={createForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Название</FormLabel>
                      <FormControl>
                        <Input placeholder="Мой API ключ" {...field} />
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
                      <FormLabel>Описание (опционально)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Описание назначения ключа..." {...field} />
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
                      <FormLabel>Срок действия (дни)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="Не ограничен" 
                          {...field} 
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                        />
                      </FormControl>
                      <FormDescription>
                        Оставьте пустым для неограниченного срока действия
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
                      <FormLabel>Права доступа</FormLabel>
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
                    Отмена
                  </Button>
                  <Button type="submit" disabled={createApiKeyMutation.isPending}>
                    {createApiKeyMutation.isPending ? "Создание..." : "Создать"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="keys" className="space-y-4">
        <TabsList>
          <TabsTrigger value="keys">API Ключи</TabsTrigger>
          <TabsTrigger value="docs">Документация</TabsTrigger>
        </TabsList>

        <TabsContent value="keys" className="space-y-4">
          {isLoading ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-muted-foreground text-center">Загрузка...</p>
              </CardContent>
            </Card>
          ) : apiKeys.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <Key className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">Нет API ключей</h3>
                  <p className="text-muted-foreground mb-4">
                    Создайте первый API ключ для программного доступа к панели
                  </p>
                  <Button onClick={() => setCreateDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Создать API ключ
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {apiKeys.map((key) => {
                const isVisible = visibleKeys.has(key.id);
                const isExpired = key.expiresAt ? new Date(key.expiresAt) < new Date() : false;
                
                return (
                  <Card key={key.id} className={isExpired || !key.isActive ? "opacity-60" : ""}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2">
                            <CardTitle>{key.name}</CardTitle>
                            {!key.isActive && <Badge variant="secondary">Деактивирован</Badge>}
                            {isExpired && <Badge variant="destructive">Истек</Badge>}
                          </div>
                          {key.description && (
                            <CardDescription>{key.description}</CardDescription>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Switch
                            checked={key.isActive}
                            onCheckedChange={(checked) => 
                              toggleActiveKeyMutation.mutate({ id: key.id, isActive: checked })
                            }
                            disabled={isExpired}
                          />
                          <Button
                            variant="destructive"
                            size="icon"
                            onClick={() => confirmDelete(key)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Input
                          value={isVisible ? key.key : "•".repeat(40)}
                          readOnly
                          className="font-mono text-sm"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => toggleKeyVisibility(key.id)}
                        >
                          {isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => copyToClipboard(key.key)}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                      
                      <div className="flex flex-wrap gap-1">
                        {key.permissions.map(p => (
                          <Badge key={p} variant="outline" className="text-xs">
                            {getPermissionLabel(p)}
                          </Badge>
                        ))}
                      </div>
                      
                      <div className="flex gap-4 text-sm text-muted-foreground">
                        <span>
                          Создан: {formatDistanceToNow(new Date(key.createdAt), { addSuffix: true, locale: ru })}
                        </span>
                        {key.lastUsedAt && (
                          <span>
                            Использован: {formatDistanceToNow(new Date(key.lastUsedAt), { addSuffix: true, locale: ru })}
                          </span>
                        )}
                        {key.expiresAt && (
                          <span className={isExpired ? "text-destructive" : ""}>
                            Истекает: {formatDistanceToNow(new Date(key.expiresAt), { addSuffix: true, locale: ru })}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="docs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Документация API</CardTitle>
              <CardDescription>
                Инструкции по использованию API для программного доступа к панели
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Безопасность</AlertTitle>
                <AlertDescription>
                  Никогда не публикуйте свои API ключи в публичных репозиториях. Храните их в безопасном месте.
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                <h3 className="text-lg font-semibold">Аутентификация</h3>
                <p className="text-muted-foreground">
                  Для аутентификации включите заголовок <code className="bg-muted px-1 py-0.5 rounded">X-API-Key</code> в ваши запросы:
                </p>
                <pre className="bg-muted p-4 rounded-md overflow-x-auto">
{`curl -H "X-API-Key: ваш_api_ключ" \\
  https://панель.домен/api/servers`}
                </pre>
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-semibold">Примеры использования</h3>
                
                <div className="space-y-2">
                  <h4 className="font-medium">Получить список серверов</h4>
                  <pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm">
{`GET /api/servers
Authorization: X-API-Key: ваш_api_ключ`}
                  </pre>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium">Запустить сервер</h4>
                  <pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm">
{`POST /api/servers/:id/start
Authorization: X-API-Key: ваш_api_ключ`}
                  </pre>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium">Получить информацию о системе</h4>
                  <pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm">
{`GET /api/system/info
Authorization: X-API-Key: ваш_api_ключ`}
                  </pre>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-semibold">Коды ответов</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li><code className="bg-muted px-1 py-0.5 rounded">200</code> - Успешный запрос</li>
                  <li><code className="bg-muted px-1 py-0.5 rounded">201</code> - Ресурс создан</li>
                  <li><code className="bg-muted px-1 py-0.5 rounded">401</code> - Неавторизован (неверный ключ)</li>
                  <li><code className="bg-muted px-1 py-0.5 rounded">403</code> - Доступ запрещен (недостаточно прав)</li>
                  <li><code className="bg-muted px-1 py-0.5 rounded">404</code> - Ресурс не найден</li>
                  <li><code className="bg-muted px-1 py-0.5 rounded">500</code> - Внутренняя ошибка сервера</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Вы уверены?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. API ключ "{deletingKey?.name}" будет удален навсегда.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
