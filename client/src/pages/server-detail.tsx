import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Play, Square, RotateCw, Trash2, Terminal, FolderOpen, Settings as SettingsIcon, BarChart3, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/status-badge";
import { ResourceMeter } from "@/components/resource-meter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Server, ServerStats, ConsoleLog, FileEntry } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function ServerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: server, isLoading } = useQuery<Server>({
    queryKey: ["/api/servers", id],
  });

  const { data: stats } = useQuery<ServerStats>({
    queryKey: ["/api/servers", id, "stats"],
    refetchInterval: 3000,
    enabled: server?.status === "running",
  });

  const controlMutation = useMutation({
    mutationFn: ({ action }: { action: string }) =>
      apiRequest("POST", `/api/servers/${id}/${action}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servers", id] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to control server",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/servers/${id}`, {}),
    onSuccess: () => {
      toast({
        title: "Server deleted",
        description: "The server has been removed",
      });
      setLocation("/servers");
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!server) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground">Server not found</p>
            <Button asChild className="mt-4" data-testid="button-back-servers">
              <Link href="/servers">Back to Servers</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild data-testid="button-back">
            <Link href="/servers">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">{server.name}</h1>
            <p className="text-sm text-muted-foreground capitalize">{server.gameType} Server</p>
          </div>
          <StatusBadge status={server.status as any} />
        </div>

        <div className="flex items-center gap-2">
          {server.status === "stopped" && (
            <Button
              onClick={() => controlMutation.mutate({ action: "start" })}
              disabled={controlMutation.isPending}
              data-testid="button-start-server"
            >
              <Play className="w-4 h-4 mr-2" />
              Start
            </Button>
          )}
          {server.status === "running" && (
            <>
              <Button
                variant="outline"
                onClick={() => controlMutation.mutate({ action: "restart" })}
                disabled={controlMutation.isPending}
                data-testid="button-restart-server"
              >
                <RotateCw className="w-4 h-4 mr-2" />
                Restart
              </Button>
              <Button
                variant="outline"
                onClick={() => controlMutation.mutate({ action: "stop" })}
                disabled={controlMutation.isPending}
                data-testid="button-stop-server"
              >
                <Square className="w-4 h-4 mr-2" />
                Stop
              </Button>
            </>
          )}
          <Button
            variant="destructive"
            onClick={() => {
              if (confirm("Are you sure you want to delete this server?")) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
            data-testid="button-delete-server"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      <Tabs defaultValue="console" className="space-y-4">
        <TabsList>
          <TabsTrigger value="console" data-testid="tab-console">
            <Terminal className="w-4 h-4 mr-2" />
            Console
          </TabsTrigger>
          <TabsTrigger value="files" data-testid="tab-files">
            <FolderOpen className="w-4 h-4 mr-2" />
            Files
          </TabsTrigger>
          <TabsTrigger value="stats" data-testid="tab-stats">
            <BarChart3 className="w-4 h-4 mr-2" />
            Statistics
          </TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-settings">
            <SettingsIcon className="w-4 h-4 mr-2" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="console" className="space-y-4">
          <ConsoleTab serverId={server.id} isRunning={server.status === "running"} />
        </TabsContent>

        <TabsContent value="files" className="space-y-4">
          <FilesTab serverId={server.id} />
        </TabsContent>

        <TabsContent value="stats" className="space-y-4">
          <StatsTab server={server} stats={stats} />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <SettingsTab server={server} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ConsoleTab({ serverId, isRunning }: { serverId: string; isRunning: boolean }) {
  const [command, setCommand] = useState("");
  const [logs, setLogs] = useState<ConsoleLog[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!isRunning) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "subscribe", serverId }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "log" && data.serverId === serverId) {
        setLogs((prev) => [...prev, data.log]);
      }
    };

    return () => {
      ws.close();
    };
  }, [serverId, isRunning]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const sendCommand = () => {
    if (!command.trim() || !isRunning) return;
    
    fetch(`/api/servers/${serverId}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command }),
      credentials: "include",
    });

    setCommand("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Server Console</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          ref={scrollRef}
          className="bg-gray-950 text-gray-100 p-4 rounded-md font-mono text-sm h-96 overflow-y-auto"
          data-testid="console-output"
        >
          {!isRunning ? (
            <div className="text-muted-foreground">Server is not running. Start the server to see console output.</div>
          ) : logs.length === 0 ? (
            <div className="text-muted-foreground">Waiting for console output...</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="mb-1">
                <span className="text-gray-500">
                  [{new Date(log.timestamp).toLocaleTimeString()}]
                </span>{" "}
                <span className={
                  log.type === "error" ? "text-red-400" :
                  log.type === "warn" ? "text-yellow-400" :
                  log.type === "system" ? "text-blue-400" :
                  "text-gray-100"
                }>
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="flex gap-2">
          <Input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendCommand()}
            placeholder={isRunning ? "Enter command..." : "Server must be running"}
            disabled={!isRunning}
            className="font-mono"
            data-testid="input-command"
          />
          <Button onClick={sendCommand} disabled={!isRunning} data-testid="button-send-command">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FilesTab({ serverId }: { serverId: string }) {
  const { data: files, isLoading, refetch } = useQuery<FileEntry[]>({
    queryKey: ["/api/servers", serverId, "files"],
  });

  const { toast } = useToast();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [folderName, setFolderName] = useState("");
  const [currentPath, setCurrentPath] = useState("/data");

  // Загрузка файла
  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      // Получаем CSRF токен из /api/auth/me
      const meResponse = await fetch("/api/auth/me", { credentials: "include" });
      const meData = await meResponse.json();
      const csrfToken = meData.csrfToken;

      const response = await fetch(`/api/servers/${serverId}/files/upload?path=${encodeURIComponent(currentPath)}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "X-CSRF-Token": csrfToken,
        },
        body: formData,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to upload file");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "File uploaded", description: "File has been uploaded successfully" });
      setUploadDialogOpen(false);
      setSelectedFile(null);
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "Upload failed", description: error.message || "Failed to upload file", variant: "destructive" });
    },
  });

  // Создание папки
  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      // Получаем CSRF токен из /api/auth/me
      const meResponse = await fetch("/api/auth/me", { credentials: "include" });
      const meData = await meResponse.json();
      const csrfToken = meData.csrfToken;

      const response = await fetch(`/api/servers/${serverId}/files/folder`, {
        method: "POST",
        credentials: "include",
        headers: { 
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ name, path: currentPath }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create folder");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Folder created", description: "Folder has been created successfully" });
      setFolderDialogOpen(false);
      setFolderName("");
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "Creation failed", description: error.message || "Failed to create folder", variant: "destructive" });
    },
  });

  const handleUpload = () => {
    if (!selectedFile) {
      toast({ title: "No file selected", description: "Please select a file to upload", variant: "destructive" });
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    uploadMutation.mutate(formData);
  };

  const handleCreateFolder = () => {
    if (!folderName.trim()) {
      toast({ title: "Invalid name", description: "Please enter a folder name", variant: "destructive" });
      return;
    }
    createFolderMutation.mutate(folderName.trim());
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>File Manager</CardTitle>
        <div className="flex gap-2">
          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-upload-file">
                Upload File
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload File</DialogTitle>
                <DialogDescription>Upload a file to the server</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>File</Label>
                  <Input
                    type="file"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="mt-2"
                  />
                  {selectedFile && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
                    </p>
                  )}
                </div>
                <div>
                  <Label>Path</Label>
                  <Input
                    value={currentPath}
                    onChange={(e) => setCurrentPath(e.target.value)}
                    className="mt-2"
                    placeholder="/data"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleUpload} disabled={uploadMutation.isPending || !selectedFile}>
                    {uploadMutation.isPending ? "Uploading..." : "Upload"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-new-folder">
                New Folder
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Folder</DialogTitle>
                <DialogDescription>Create a new folder on the server</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Folder Name</Label>
                  <Input
                    value={folderName}
                    onChange={(e) => setFolderName(e.target.value)}
                    className="mt-2"
                    placeholder="New Folder"
                  />
                </div>
                <div>
                  <Label>Path</Label>
                  <Input
                    value={currentPath}
                    onChange={(e) => setCurrentPath(e.target.value)}
                    className="mt-2"
                    placeholder="/data"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setFolderDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateFolder} disabled={createFolderMutation.isPending || !folderName.trim()}>
                    {createFolderMutation.isPending ? "Creating..." : "Create"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !files || files.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FolderOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
            No files yet
          </div>
        ) : (
          <ScrollArea className="h-96">
            <div className="space-y-1">
              {files.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 rounded-md hover-elevate active-elevate-2"
                  data-testid={`file-${file.name}`}
                >
                  <div className="flex items-center gap-3">
                    <FolderOpen className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">{file.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(2)} KB
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">Edit</Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function StatsTab({ server, stats }: { server: Server; stats?: ServerStats }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Resource Usage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {stats ? (
            <>
              <ResourceMeter
                label="CPU Usage"
                value={stats.cpuUsage}
                max={server.cpuLimit}
                unit="%"
              />
              <ResourceMeter
                label="Memory Usage"
                value={stats.ramUsage}
                max={server.ramLimit}
                unit="GB"
              />
              <ResourceMeter
                label="Disk Usage"
                value={stats.diskUsage}
                max={server.diskLimit}
                unit="GB"
              />
            </>
          ) : (
            <div className="text-muted-foreground text-sm">
              Start the server to see resource usage
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Network Statistics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {stats ? (
            <>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Network RX</span>
                <span className="text-sm font-medium">{(stats.networkRx / 1024 / 1024).toFixed(2)} MB</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Network TX</span>
                <span className="text-sm font-medium">{(stats.networkTx / 1024 / 1024).toFixed(2)} MB</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Uptime</span>
                <span className="text-sm font-medium">
                  {Math.floor(stats.uptime / 3600)}h {Math.floor((stats.uptime % 3600) / 60)}m
                </span>
              </div>
            </>
          ) : (
            <div className="text-muted-foreground text-sm">
              Start the server to see network statistics
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsTab({ server }: { server: Server }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Server Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Server ID</span>
            <p className="font-mono mt-1">{server.id}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Container ID</span>
            <p className="font-mono mt-1">{server.containerId || "Not created"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Port</span>
            <p className="font-medium mt-1">{server.port}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Auto Start</span>
            <p className="font-medium mt-1">{server.autoStart ? "Enabled" : "Disabled"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">CPU Limit</span>
            <p className="font-medium mt-1">{server.cpuLimit}%</p>
          </div>
          <div>
            <span className="text-muted-foreground">RAM Limit</span>
            <p className="font-medium mt-1">{server.ramLimit} GB</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
