import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Package, Upload, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusLed } from "@/components/status-badge";
import { PageHeader, PageShell } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { useCan } from "@/lib/use-me";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  running?: boolean;
  error?: string;
}

export default function PluginsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [toDelete, setToDelete] = useState<Plugin | null>(null);
  const can = useCan();
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

  const { data: plugins = [], isLoading } = useQuery<Plugin[]>({
    queryKey: ["/api/plugins"],
    refetchInterval: 15000,
  });

  const togglePluginMutation = useMutation({
    mutationFn: async ({ pluginId, enabled }: { pluginId: string; enabled: boolean }) => {
      const endpoint = enabled ? `/api/plugins/${pluginId}/enable` : `/api/plugins/${pluginId}/disable`;
      return apiRequest("POST", endpoint, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plugins"] });
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

  const deletePluginMutation = useMutation({
    mutationFn: async (pluginId: string) => {
      return apiRequest("DELETE", `/api/plugins/${pluginId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plugins"] });
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

  const uploadPluginMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await apiRequest("POST", "/api/plugins/upload", formData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plugins"] });
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
      const ext = file.name.split(".").pop()?.toLowerCase();
      let type: Plugin["type"] = "javascript";
      if (ext === "py") type = "python";
      else if (ext === "jar") type = "jar";
      else if (ext === "ts") type = "typescript";
      else if (ext === "js" || ext === "mjs" || ext === "cjs") type = "javascript";

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

  const TYPE_LABELS: Record<Plugin["type"], string> = { javascript: "JavaScript", typescript: "TypeScript", python: "Python", jar: "Java" };
  const isArchive = Boolean(selectedFile && /\.(zip|tar\.gz|tgz)$/i.test(selectedFile.name));
  const canManage = can("plugins.manage");

  return (
    <PageShell>
      <PageHeader
        title="Plugins"
        description="Extensions that react to panel events: notifications, integrations, logging"
        actions={
          canManage && (
            <Button onClick={() => setUploadDialogOpen(true)}>
              <Upload /> Upload plugin
            </Button>
          )
        }
      />

      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload plugin</DialogTitle>
            <DialogDescription>A single .js, .py or .jar file, or a .zip / .tar.gz archive with manifest.json. Plugins start disabled.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input id="plugin-file" type="file" accept=".js,.mjs,.cjs,.ts,.py,.jar,.zip,.tar.gz,.tgz" onChange={handleFileSelect} />
            {selectedFile && !isArchive && (
              <div className="space-y-3 rounded-md border p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="plugin-id">ID</Label>
                    <Input id="plugin-id" value={pluginForm.pluginId} onChange={(e) => setPluginForm({ ...pluginForm, pluginId: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="plugin-version">Version</Label>
                    <Input id="plugin-version" value={pluginForm.version} onChange={(e) => setPluginForm({ ...pluginForm, version: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plugin-name">Name</Label>
                  <Input id="plugin-name" value={pluginForm.name} onChange={(e) => setPluginForm({ ...pluginForm, name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Language</Label>
                    <Select value={pluginForm.type} onValueChange={(v) => setPluginForm({ ...pluginForm, type: v as Plugin["type"] })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(TYPE_LABELS) as Plugin["type"][]).map((t) => (
                          <SelectItem key={t} value={t}>
                            {TYPE_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="plugin-author">Author</Label>
                    <Input id="plugin-author" value={pluginForm.author} onChange={(e) => setPluginForm({ ...pluginForm, author: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plugin-description">Description</Label>
                  <Input id="plugin-description" value={pluginForm.description} onChange={(e) => setPluginForm({ ...pluginForm, description: e.target.value })} />
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Plugins run with the panel's permissions. Install only plugins you trust.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={uploadPluginMutation.isPending || !selectedFile}>
                {uploadPluginMutation.isPending ? "Uploading…" : "Upload plugin"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : plugins.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No plugins installed"
          description="Plugins can send notifications, sync with other services or log events. See PLUGINS_README.md for how to write one."
          action={
            canManage && (
              <Button onClick={() => setUploadDialogOpen(true)}>
                <Upload /> Upload plugin
              </Button>
            )
          }
        />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {plugins.map((plugin) => (
            <li key={plugin.id} className="flex gap-4 px-4 py-4">
              <StatusLed status={plugin.error ? "error" : plugin.running ? "running" : "stopped"} className="mt-1.5" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm">
                  <span className="font-medium">{plugin.name}</span>
                  <span className="ml-2 text-muted-foreground">
                    {plugin.version}, {TYPE_LABELS[plugin.type] ?? plugin.type}
                    {plugin.author && <>{", "}{`by ${plugin.author}`}</>}
                  </span>
                </p>
                {plugin.description && <p className="text-sm text-muted-foreground">{plugin.description}</p>}
                {plugin.error && <p className="text-sm text-destructive">Failed to start: {plugin.error}</p>}
                {plugin.hooks && plugin.hooks.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Listens to <span className="font-mono">{plugin.hooks.join(", ")}</span>
                  </p>
                )}
              </div>
              {canManage && (
                <div className="flex shrink-0 items-start gap-2">
                  <Switch
                    checked={plugin.enabled}
                    onCheckedChange={(checked) => togglePluginMutation.mutate({ pluginId: plugin.id, enabled: checked })}
                    disabled={togglePluginMutation.isPending}
                    aria-label={plugin.enabled ? `Disable ${plugin.name}` : `Enable ${plugin.name}`}
                  />
                  <Button variant="ghost" size="icon" className="-mt-1.5 h-8 w-8 text-destructive" onClick={() => setToDelete(plugin)} aria-label={`Delete ${plugin.name}`}>
                    <Trash2 />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {toDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>The plugin is stopped and its folder is removed from the panel.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep plugin</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (toDelete) deletePluginMutation.mutate(toDelete.id);
                setToDelete(null);
              }}
            >
              Delete plugin
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
