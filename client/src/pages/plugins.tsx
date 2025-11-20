import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Package, Upload, Trash2, FileCode, FileJson, Coffee } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  type: "javascript" | "typescript" | "python" | "jar";
  enabled: boolean;
  main: string;
  hooks?: string[];
}

export default function PluginsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  type PluginFormState = {
    pluginId: string;
    name: string;
    version: string;
    description: string;
    author: string;
    type: Plugin["type"];
  };

  const createDefaultPluginForm = (): PluginFormState => ({
    pluginId: "",
    name: "",
    version: "1.0.0",
    description: "",
    author: "",
    type: "javascript",
  });

  const [pluginForm, setPluginForm] = useState<PluginFormState>(createDefaultPluginForm());

  // Загрузка списка плагинов
  const { data: plugins = [], isLoading } = useQuery<Plugin[]>({
    queryKey: ["plugins"],
    queryFn: async () => {
      const response = await fetch("/api/plugins", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to load plugins");
      return response.json();
    },
  });

  // Включение/отключение плагина
  const togglePluginMutation = useMutation({
    mutationFn: async ({ pluginId, enabled }: { pluginId: string; enabled: boolean }) => {
      const endpoint = enabled ? `/api/plugins/${pluginId}/enable` : `/api/plugins/${pluginId}/disable`;
      return apiRequest("POST", endpoint, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plugins"] });
      toast({
        title: "Plugin status updated",
        description: "Plugin status has been updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update plugin",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Удаление плагина
  const deletePluginMutation = useMutation({
    mutationFn: async (pluginId: string) => {
      return apiRequest("DELETE", `/api/plugins/${pluginId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plugins"] });
      toast({
        title: "Plugin deleted",
        description: "Plugin has been deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete plugin",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Загрузка плагина
  const uploadPluginMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      // Получаем CSRF токен из /api/auth/me
      const meResponse = await fetch("/api/auth/me", { credentials: "include" });
      const meData = await meResponse.json();
      const csrfToken = meData.csrfToken;

      const response = await fetch("/api/plugins/upload", {
        method: "POST",
        credentials: "include",
        headers: {
          "X-CSRF-Token": csrfToken,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to upload plugin");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plugins"] });
      setUploadDialogOpen(false);
      setSelectedFile(null);
      setPluginForm(createDefaultPluginForm());
      toast({
        title: "Plugin uploaded",
        description: "Plugin has been uploaded successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to upload plugin",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Автоматически определяем тип плагина по расширению
      const ext = file.name.split(".").pop()?.toLowerCase();
      let type: Plugin["type"] = "javascript";
      if (ext === "py") type = "python";
      else if (ext === "jar") type = "jar";
      else if (ext === "ts") type = "typescript";
      else if (ext === "js") type = "javascript";

      setPluginForm((prev) => ({
        ...prev,
        pluginId: file.name.split(".").slice(0, -1).join("."),
        name: file.name.split(".").slice(0, -1).join("."),
        type,
      }));
    }
  };

  const handleUpload = () => {
    if (!selectedFile) {
      toast({
        title: "No file selected",
        description: "Please select a plugin file to upload",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append("plugin", selectedFile);
    formData.append("pluginId", pluginForm.pluginId);
    formData.append("name", pluginForm.name);
    formData.append("version", pluginForm.version);
    formData.append("description", pluginForm.description);
    formData.append("author", pluginForm.author);
    formData.append("type", pluginForm.type);

    uploadPluginMutation.mutate(formData);
  };

  const getPluginIcon = (type: string) => {
    switch (type) {
      case "python":
        return <Coffee className="w-5 h-5" />;
      case "jar":
        return <Package className="w-5 h-5" />;
      case "typescript":
        return <FileCode className="w-5 h-5" />;
      default:
        return <FileJson className="w-5 h-5" />;
    }
  };

  const getPluginTypeBadge = (type: string) => {
    const colors: Record<string, "default" | "secondary" | "outline"> = {
      javascript: "default",
      typescript: "default",
      python: "secondary",
      jar: "outline",
    };
    return (
      <Badge variant={colors[type] || "default"} className="ml-2">
        {type.toUpperCase()}
      </Badge>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Plugins</h1>
          <p className="text-sm text-muted-foreground">
            Manage plugins to extend SparkPanel functionality
          </p>
        </div>
        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Upload className="w-4 h-4 mr-2" />
              Upload Plugin
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Plugin</DialogTitle>
              <DialogDescription>
                Upload a plugin file (.js, .ts, .py, .jar) to extend SparkPanel functionality
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="plugin-file">Plugin File</Label>
                <Input
                  id="plugin-file"
                  type="file"
                  accept=".js,.ts,.py,.jar,.zip,.tar.gz"
                  onChange={handleFileSelect}
                  className="mt-2"
                />
                {selectedFile && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
                  </p>
                )}
              </div>

              <Separator />

              <div>
                <Label htmlFor="plugin-id">Plugin ID</Label>
                <Input
                  id="plugin-id"
                  value={pluginForm.pluginId}
                  onChange={(e) => setPluginForm({ ...pluginForm, pluginId: e.target.value })}
                  placeholder="my-plugin"
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="plugin-name">Name</Label>
                <Input
                  id="plugin-name"
                  value={pluginForm.name}
                  onChange={(e) => setPluginForm({ ...pluginForm, name: e.target.value })}
                  placeholder="My Plugin"
                  className="mt-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="plugin-version">Version</Label>
                  <Input
                    id="plugin-version"
                    value={pluginForm.version}
                    onChange={(e) => setPluginForm({ ...pluginForm, version: e.target.value })}
                    placeholder="1.0.0"
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="plugin-type">Type</Label>
                  <select
                    id="plugin-type"
                    value={pluginForm.type}
                  onChange={(e) =>
                    setPluginForm({ ...pluginForm, type: e.target.value as Plugin["type"] })
                  }
                    className="mt-2 w-full px-3 py-2 border rounded-md"
                  >
                    <option value="javascript">JavaScript</option>
                    <option value="typescript">TypeScript</option>
                    <option value="python">Python</option>
                    <option value="jar">JAR</option>
                  </select>
                </div>
              </div>

              <div>
                <Label htmlFor="plugin-author">Author</Label>
                <Input
                  id="plugin-author"
                  value={pluginForm.author}
                  onChange={(e) => setPluginForm({ ...pluginForm, author: e.target.value })}
                  placeholder="Plugin Author"
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="plugin-description">Description</Label>
                <Input
                  id="plugin-description"
                  value={pluginForm.description}
                  onChange={(e) => setPluginForm({ ...pluginForm, description: e.target.value })}
                  placeholder="Plugin description"
                  className="mt-2"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setUploadDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={uploadPluginMutation.isPending || !selectedFile}
                >
                  {uploadPluginMutation.isPending ? "Uploading..." : "Upload"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Loading plugins...</p>
          </div>
        </div>
      ) : plugins.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No plugins installed</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Upload a plugin to extend SparkPanel functionality
            </p>
            <Button onClick={() => setUploadDialogOpen(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Upload Your First Plugin
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plugins.map((plugin) => (
            <Card key={plugin.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
                      {getPluginIcon(plugin.type)}
                    </div>
                    <div>
                      <CardTitle className="text-base">{plugin.name}</CardTitle>
                      <CardDescription className="flex items-center mt-1">
                        v{plugin.version}
                        {getPluginTypeBadge(plugin.type)}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant={plugin.enabled ? "default" : "secondary"}>
                    {plugin.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {plugin.description && (
                  <p className="text-sm text-muted-foreground">{plugin.description}</p>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Author: {plugin.author || "Unknown"}</span>
                </div>
                {plugin.hooks && plugin.hooks.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Hooks:</p>
                    <div className="flex flex-wrap gap-1">
                      {plugin.hooks.map((hook) => (
                        <Badge key={hook} variant="outline" className="text-xs">
                          {hook}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={plugin.enabled}
                      onCheckedChange={(checked) => {
                        togglePluginMutation.mutate({ pluginId: plugin.id, enabled: checked });
                      }}
                      disabled={togglePluginMutation.isPending}
                    />
                    <Label className="text-sm">
                      {plugin.enabled ? "Disable" : "Enable"}
                    </Label>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Are you sure you want to delete "${plugin.name}"?`)) {
                        deletePluginMutation.mutate(plugin.id);
                      }
                    }}
                    disabled={deletePluginMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

