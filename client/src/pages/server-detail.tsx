import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Play, Square, RotateCw, Trash2, Terminal, FolderOpen, Settings as SettingsIcon, BarChart3, Send, Database, Network, Key, Download, Trash, Edit, Save, X, Search, Filter, Copy, ChevronLeft, ChevronRight, FileText, Folder, Clock, Calendar } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import type { Server, ServerStats, ConsoleLog, FileEntry, Node } from "@shared/schema";
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
        <TabsList className="flex-wrap">
          {(!server.visibility || server.visibility.console !== false) && (
            <TabsTrigger value="console" data-testid="tab-console">
              <Terminal className="w-4 h-4 mr-2" />
              Console
            </TabsTrigger>
          )}
          {(!server.visibility || server.visibility.files !== false) && (
            <TabsTrigger value="files" data-testid="tab-files">
              <FolderOpen className="w-4 h-4 mr-2" />
              Files
            </TabsTrigger>
          )}
          {(!server.visibility || server.visibility.stats !== false) && (
            <TabsTrigger value="stats" data-testid="tab-stats">
              <BarChart3 className="w-4 h-4 mr-2" />
              Statistics
            </TabsTrigger>
          )}
          {(!server.visibility || server.visibility.backups !== false) && (
            <TabsTrigger value="backups" data-testid="tab-backups">
              <Database className="w-4 h-4 mr-2" />
              Backups
            </TabsTrigger>
          )}
          {(!server.visibility || server.visibility.ports !== false) && (
            <TabsTrigger value="ports" data-testid="tab-ports">
              <Network className="w-4 h-4 mr-2" />
              Ports
            </TabsTrigger>
          )}
          {(!server.visibility || server.visibility.sftp !== false) && (
            <TabsTrigger value="sftp" data-testid="tab-sftp">
              <Key className="w-4 h-4 mr-2" />
              SFTP
            </TabsTrigger>
          )}
          {(!server.visibility || server.visibility.settings !== false) && (
            <TabsTrigger value="settings" data-testid="tab-settings">
              <SettingsIcon className="w-4 h-4 mr-2" />
              Settings
            </TabsTrigger>
          )}
        </TabsList>

        {(!server.visibility || server.visibility.console !== false) && (
          <TabsContent value="console" className="space-y-4">
            <ConsoleTab serverId={server.id} isRunning={server.status === "running"} />
          </TabsContent>
        )}

        {(!server.visibility || server.visibility.files !== false) && (
          <TabsContent value="files" className="space-y-4">
            <FilesTab serverId={server.id} />
          </TabsContent>
        )}

        {(!server.visibility || server.visibility.stats !== false) && (
          <TabsContent value="stats" className="space-y-4">
            <StatsTab server={server} stats={stats} />
          </TabsContent>
        )}

        {(!server.visibility || server.visibility.backups !== false) && (
          <TabsContent value="backups" className="space-y-4">
            <BackupsTab serverId={server.id} server={server} />
          </TabsContent>
        )}

        {(!server.visibility || server.visibility.ports !== false) && (
          <TabsContent value="ports" className="space-y-4">
            <PortsTab serverId={server.id} server={server} />
          </TabsContent>
        )}

        {(!server.visibility || server.visibility.sftp !== false) && (
          <TabsContent value="sftp" className="space-y-4">
            <SftpTab serverId={server.id} server={server} />
          </TabsContent>
        )}

        {(!server.visibility || server.visibility.settings !== false) && (
          <TabsContent value="settings" className="space-y-4">
            <SettingsTab server={server} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function ConsoleTab({ serverId, isRunning }: { serverId: string; isRunning: boolean }) {
  const [command, setCommand] = useState("");
  const [logs, setLogs] = useState<ConsoleLog[]>([]);
  const [filter, setFilter] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const { toast } = useToast();

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
    if (scrollRef.current && autoScroll) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

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

  const clearLogs = () => {
    setLogs([]);
    toast({ title: "Logs cleared", description: "Console logs have been cleared" });
  };

  const saveLogs = () => {
    const logText = logs.map(log => 
      `[${new Date(log.timestamp).toLocaleString()}] ${log.type.toUpperCase()}: ${log.message}`
    ).join("\n");
    
    const blob = new Blob([logText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `server-${serverId}-logs-${new Date().toISOString()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Logs saved", description: "Console logs have been saved to file" });
  };

  const copyLogs = () => {
    const logText = logs.map(log => 
      `[${new Date(log.timestamp).toLocaleString()}] ${log.type.toUpperCase()}: ${log.message}`
    ).join("\n");
    
    navigator.clipboard.writeText(logText);
    toast({ title: "Logs copied", description: "Console logs have been copied to clipboard" });
  };

  const filteredLogs = filter
    ? logs.filter(log => log.message.toLowerCase().includes(filter.toLowerCase()))
    : logs;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Server Console</CardTitle>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Filter logs..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-8 w-48 h-8"
            />
          </div>
          <Button variant="outline" size="sm" onClick={clearLogs} disabled={logs.length === 0}>
            <Trash className="w-4 h-4 mr-2" />
            Clear
          </Button>
          <Button variant="outline" size="sm" onClick={saveLogs} disabled={logs.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Save
          </Button>
          <Button variant="outline" size="sm" onClick={copyLogs} disabled={logs.length === 0}>
            <Copy className="w-4 h-4 mr-2" />
            Copy
          </Button>
          <Button
            variant={autoScroll ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoScroll(!autoScroll)}
          >
            Auto-scroll
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Total logs: {logs.length} {filter && `(filtered: ${filteredLogs.length})`}</span>
          {filter && (
            <Button variant="ghost" size="sm" onClick={() => setFilter("")}>
              <X className="w-3 h-3 mr-1" />
              Clear filter
            </Button>
          )}
        </div>
        <div
          ref={scrollRef}
          className="bg-gray-950 text-gray-100 p-4 rounded-md font-mono text-sm h-96 overflow-y-auto"
          data-testid="console-output"
          onScroll={() => {
            if (scrollRef.current) {
              const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
              const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10;
              if (!isAtBottom && autoScroll) {
                setAutoScroll(false);
              }
            }
          }}
        >
          {!isRunning ? (
            <div className="text-muted-foreground">Server is not running. Start the server to see console output.</div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-muted-foreground">
              {filter ? "No logs match the filter" : "Waiting for console output..."}
            </div>
          ) : (
            filteredLogs.map((log, i) => (
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
          <Button onClick={sendCommand} disabled={!isRunning || !command.trim()} data-testid="button-send-command">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FilesTab({ serverId }: { serverId: string }) {
  const [currentPath, setCurrentPath] = useState("/data");
  const { data: files, isLoading, refetch } = useQuery<FileEntry[]>({
    queryKey: ["/api/servers", serverId, "files", currentPath],
    queryFn: () => apiRequest("GET", `/api/servers/${serverId}/files?path=${encodeURIComponent(currentPath)}`),
  });

  const { toast } = useToast();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [folderName, setFolderName] = useState("");
  const [renameTarget, setRenameTarget] = useState<FileEntry | null>(null);
  const [newName, setNewName] = useState("");

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

  const navigateToFolder = (folderName: string) => {
    const newPath = currentPath === "/" ? `/${folderName}` : `${currentPath}/${folderName}`;
    setCurrentPath(newPath);
  };

  const navigateUp = () => {
    const parts = currentPath.split("/").filter(Boolean);
    if (parts.length > 0) {
      parts.pop();
      setCurrentPath(parts.length > 0 ? `/${parts.join("/")}` : "/data");
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2 flex-1">
        <CardTitle>File Manager</CardTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {currentPath !== "/data" && (
              <Button variant="ghost" size="sm" onClick={navigateUp}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
            )}
            <span className="font-mono text-xs">{currentPath}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-upload-file">
                <Download className="w-4 h-4 mr-2" />
                Upload
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload File</DialogTitle>
                <DialogDescription>Upload a file to {currentPath}</DialogDescription>
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
                      Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
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
                <Folder className="w-4 h-4 mr-2" />
                New Folder
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Folder</DialogTitle>
                <DialogDescription>Create a new folder in {currentPath}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Folder Name</Label>
                  <Input
                    value={folderName}
                    onChange={(e) => setFolderName(e.target.value)}
                    className="mt-2"
                    placeholder="New Folder"
                    onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
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
            <p>No files in this directory</p>
            <p className="text-xs mt-2">Upload a file or create a folder to get started</p>
          </div>
        ) : (
          <ScrollArea className="h-96">
            <div className="space-y-1">
              {files.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 rounded-md hover:bg-muted/50 transition-colors group"
                  data-testid={`file-${file.name}`}
                >
                  <div 
                    className="flex items-center gap-3 flex-1 cursor-pointer"
                    onClick={() => file.type === "directory" && navigateToFolder(file.name)}
                  >
                    {file.type === "directory" ? (
                      <Folder className="w-5 h-5 text-blue-500" />
                    ) : (
                      <FileText className="w-5 h-5 text-muted-foreground" />
                    )}
                    <div className="flex-1">
                      <div className="text-sm font-medium flex items-center gap-2">
                        {file.name}
                        {file.type === "directory" && (
                          <ChevronRight className="w-3 h-3 text-muted-foreground" />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-3 mt-1">
                        <span>{file.type === "directory" ? "Folder" : formatFileSize(file.size)}</span>
                        <span>•</span>
                        <span>{formatDate(file.modified)}</span>
                    </div>
                  </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {file.type === "file" && (
                      <Button variant="ghost" size="sm" title="Edit file">
                        <Edit className="w-4 h-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" title="Rename">
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" title="Delete">
                      <Trash className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
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
  const { toast } = useToast();

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const exportStats = () => {
    if (!stats) {
      toast({ title: "No data", description: "No statistics available to export", variant: "destructive" });
      return;
    }

    const statsData = {
      timestamp: new Date().toISOString(),
      server: {
        id: server.id,
        name: server.name,
        gameType: server.gameType,
      },
      resources: {
        cpu: {
          usage: stats.cpuUsage,
          limit: server.cpuLimit,
          unit: "%",
        },
        memory: {
          usage: stats.ramUsage / 1024 / 1024 / 1024,
          limit: server.ramLimit,
          unit: "GB",
        },
        disk: {
          usage: stats.diskUsage,
          limit: server.diskLimit,
          unit: "GB",
        },
      },
      network: {
        rx: stats.networkRx,
        tx: stats.networkTx,
        rxFormatted: formatBytes(stats.networkRx),
        txFormatted: formatBytes(stats.networkTx),
      },
      uptime: {
        seconds: stats.uptime,
        formatted: formatUptime(stats.uptime),
      },
    };

    const blob = new Blob([JSON.stringify(statsData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `server-${server.id}-stats-${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Statistics exported", description: "Statistics have been exported to JSON file" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Server Statistics</h3>
        {stats && (
          <Button variant="outline" size="sm" onClick={exportStats}>
            <Download className="w-4 h-4 mr-2" />
            Export Data
          </Button>
        )}
      </div>
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
                  value={stats.ramUsage / 1024 / 1024 / 1024}
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
              <div className="text-muted-foreground text-sm text-center py-8">
                <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Start the server to see resource usage</p>
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
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-muted/50 rounded-md">
                    <div>
                      <div className="text-sm text-muted-foreground">Network RX</div>
                      <div className="text-lg font-semibold">{formatBytes(stats.networkRx)}</div>
              </div>
                    <Download className="w-5 h-5 text-green-500" />
              </div>
                  <div className="flex justify-between items-center p-3 bg-muted/50 rounded-md">
                    <div>
                      <div className="text-sm text-muted-foreground">Network TX</div>
                      <div className="text-lg font-semibold">{formatBytes(stats.networkTx)}</div>
                    </div>
                    <Send className="w-5 h-5 text-blue-500" />
                  </div>
                  <div className="flex justify-between items-center p-3 bg-muted/50 rounded-md">
                    <div>
                      <div className="text-sm text-muted-foreground">Uptime</div>
                      <div className="text-lg font-semibold">{formatUptime(stats.uptime)}</div>
                    </div>
                    <Clock className="w-5 h-5 text-muted-foreground" />
                  </div>
              </div>
            </>
          ) : (
              <div className="text-muted-foreground text-sm text-center py-8">
                <Network className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Start the server to see network statistics</p>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

function SettingsTab({ server }: { server: Server }) {
  const { toast } = useToast();
  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState(server.name);
  const [port, setPort] = useState(server.port);
  const [cpuLimit, setCpuLimit] = useState(server.cpuLimit);
  const [ramLimit, setRamLimit] = useState(server.ramLimit);
  const [diskLimit, setDiskLimit] = useState(server.diskLimit);
  const [autoStart, setAutoStart] = useState(server.autoStart);
  
  // Startup settings
  const config = server.config as any || {};
  const startupSettings = config.startupSettings || {};
  const [jarFile, setJarFile] = useState(startupSettings.jarFile || "server.jar");
  const [javaVersion, setJavaVersion] = useState(startupSettings.javaVersion || "Java 21");
  const [garbageCollector, setGarbageCollector] = useState(startupSettings.garbageCollector || "UseG1GC");
  const [timeZone, setTimeZone] = useState(startupSettings.timeZone || "Europe/Moscow");
  const [memoryPercent, setMemoryPercent] = useState(startupSettings.memoryPercent || 95);
  const [minMemory, setMinMemory] = useState(startupSettings.minMemory || "128M");
  const [additionalArgs, setAdditionalArgs] = useState(startupSettings.additionalArgs || "");
  const [startupCommand, setStartupCommand] = useState(startupSettings.startupCommand || "");

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<Server>) => {
      return apiRequest("PATCH", `/api/servers/${server.id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servers", server.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
      toast({ title: "Settings updated", description: "Server settings have been updated successfully" });
      setEditMode(false);
    },
    onError: (error: any) => {
      toast({ title: "Update failed", description: error.message || "Failed to update settings", variant: "destructive" });
    },
  });

  const handleSave = () => {
    const config = server.config as any || {};
    updateMutation.mutate({
      name,
      port,
      cpuLimit,
      ramLimit,
      diskLimit,
      autoStart,
      config: {
        ...config,
        startupSettings: {
          jarFile,
          javaVersion,
          garbageCollector,
          timeZone,
          memoryPercent,
          minMemory,
          additionalArgs,
          startupCommand,
        },
      },
    });
  };

  const handleCancel = () => {
    setName(server.name);
    setPort(server.port);
    setCpuLimit(server.cpuLimit);
    setRamLimit(server.ramLimit);
    setDiskLimit(server.diskLimit);
    setAutoStart(server.autoStart);
    const config = server.config as any || {};
    const startupSettings = config.startupSettings || {};
    setJarFile(startupSettings.jarFile || "server.jar");
    setJavaVersion(startupSettings.javaVersion || "Java 21");
    setGarbageCollector(startupSettings.garbageCollector || "UseG1GC");
    setTimeZone(startupSettings.timeZone || "Europe/Moscow");
    setMemoryPercent(startupSettings.memoryPercent || 95);
    setMinMemory(startupSettings.minMemory || "128M");
    setAdditionalArgs(startupSettings.additionalArgs || "");
    setStartupCommand(startupSettings.startupCommand || "");
    setEditMode(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Server Configuration</CardTitle>
        <div className="flex gap-2">
          {editMode ? (
            <>
              <Button variant="outline" size="sm" onClick={handleCancel} disabled={updateMutation.isPending}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
                <Save className="w-4 h-4 mr-2" />
                {updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label>Server Name</Label>
            {editMode ? (
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Server name"
              />
            ) : (
              <p className="font-medium">{server.name}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Game Type</Label>
            <p className="font-medium capitalize">{server.gameType}</p>
          </div>
          <div className="space-y-2">
            <Label>Port</Label>
            {editMode ? (
              <Input
                type="number"
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value) || 0)}
                min="1"
                max="65535"
              />
            ) : (
              <p className="font-mono">{server.port}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Auto Start</Label>
            {editMode ? (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoStart}
                  onChange={(e) => setAutoStart(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm text-muted-foreground">Start server when node boots</span>
              </div>
            ) : (
              <p className="font-medium">{server.autoStart ? "Enabled" : "Disabled"}</p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="font-semibold">Resource Limits</h4>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>CPU Limit</Label>
              {editMode ? (
                <div className="space-y-2">
                  <Input
                    type="number"
                    value={cpuLimit}
                    onChange={(e) => setCpuLimit(parseInt(e.target.value) || 0)}
                    min="10"
                    max="100"
                  />
                  <p className="text-xs text-muted-foreground">{cpuLimit}%</p>
                </div>
              ) : (
                <p className="font-medium">{server.cpuLimit}%</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>RAM Limit</Label>
              {editMode ? (
                <div className="space-y-2">
                  <Input
                    type="number"
                    value={ramLimit}
                    onChange={(e) => setRamLimit(parseInt(e.target.value) || 0)}
                    min="1"
                    max="32"
                  />
                  <p className="text-xs text-muted-foreground">{ramLimit} GB</p>
                </div>
              ) : (
                <p className="font-medium">{server.ramLimit} GB</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Disk Limit</Label>
              {editMode ? (
                <div className="space-y-2">
                  <Input
                    type="number"
                    value={diskLimit}
                    onChange={(e) => setDiskLimit(parseInt(e.target.value) || 0)}
                    min="5"
                    max="100"
                  />
                  <p className="text-xs text-muted-foreground">{diskLimit} GB</p>
                </div>
              ) : (
                <p className="font-medium">{server.diskLimit} GB</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t">
          <h4 className="font-semibold">Startup Settings</h4>
          <div className="space-y-4">
            {/* Java-specific settings for Minecraft and Custom servers */}
            {(server.gameType === "minecraft" || server.gameType === "custom") && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>JAR File</Label>
                    {editMode ? (
                      <Input
                        value={jarFile}
                        onChange={(e) => setJarFile(e.target.value)}
                        placeholder="server.jar"
                      />
                    ) : (
                      <p className="font-mono text-sm">{jarFile}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Java Version</Label>
                    {editMode ? (
                      <Select value={javaVersion} onValueChange={setJavaVersion}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Java 8">Java 8</SelectItem>
                          <SelectItem value="Java 11">Java 11</SelectItem>
                          <SelectItem value="Java 17">Java 17</SelectItem>
                          <SelectItem value="Java 21">Java 21</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm">{javaVersion}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Garbage Collector</Label>
                    {editMode ? (
                      <Select value={garbageCollector} onValueChange={setGarbageCollector}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="UseSerialGC">UseSerialGC</SelectItem>
                          <SelectItem value="UseG1GC">UseG1GC</SelectItem>
                          <SelectItem value="UseZGC">UseZGC</SelectItem>
                          <SelectItem value="UseParallelGC">UseParallelGC</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm font-mono">{garbageCollector}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Memory Percent (%)</Label>
                    {editMode ? (
                      <Input
                        type="number"
                        value={memoryPercent}
                        onChange={(e) => setMemoryPercent(parseInt(e.target.value) || 95)}
                        min="1"
                        max="100"
                      />
                    ) : (
                      <p className="text-sm">{memoryPercent}%</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Min Memory</Label>
                    {editMode ? (
                      <Input
                        value={minMemory}
                        onChange={(e) => setMinMemory(e.target.value)}
                        placeholder="128M"
                      />
                    ) : (
                      <p className="text-sm font-mono">{minMemory}</p>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Additional JVM Arguments</Label>
                  {editMode ? (
                    <Textarea
                      value={additionalArgs}
                      onChange={(e) => setAdditionalArgs(e.target.value)}
                      placeholder="Additional JVM arguments"
                      rows={3}
                    />
                  ) : (
                    <p className="text-sm font-mono whitespace-pre-wrap">{additionalArgs || "None"}</p>
                  )}
                </div>
              </>
            )}
            
            {/* Common settings for all game types */}
            <div className="space-y-2">
              <Label>Time Zone</Label>
              {editMode ? (
                <Input
                  value={timeZone}
                  onChange={(e) => setTimeZone(e.target.value)}
                  placeholder="Europe/Moscow"
                />
              ) : (
                <p className="text-sm">{timeZone}</p>
              )}
            </div>
            
            {/* Additional arguments for non-Java servers */}
            {(server.gameType !== "minecraft" && server.gameType !== "custom") && (
              <div className="space-y-2">
                <Label>Additional Arguments</Label>
                {editMode ? (
                  <Textarea
                    value={additionalArgs}
                    onChange={(e) => setAdditionalArgs(e.target.value)}
                    placeholder="Additional command line arguments"
                    rows={3}
                  />
                ) : (
                  <p className="text-sm font-mono whitespace-pre-wrap">{additionalArgs || "None"}</p>
                )}
              </div>
            )}
            
            {/* Custom startup command (available for all game types) */}
            <div className="space-y-2">
              <Label>Custom Startup Command (optional - overrides auto-generated command)</Label>
              {editMode ? (
                <Textarea
                  value={startupCommand}
                  onChange={(e) => setStartupCommand(e.target.value)}
                  placeholder="Custom startup command (leave empty to use auto-generated command based on game type)"
                  rows={4}
                  className="font-mono text-xs"
                />
              ) : (
                <p className="text-sm font-mono whitespace-pre-wrap bg-muted p-2 rounded">{startupCommand || "Auto-generated based on game type"}</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t">
          <h4 className="font-semibold">System Information</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
              <Label className="text-muted-foreground">Server ID</Label>
              <p className="font-mono mt-1 text-xs">{server.id}</p>
          </div>
          <div>
              <Label className="text-muted-foreground">Container ID</Label>
              <p className="font-mono mt-1 text-xs">{server.containerId || "Not created"}</p>
          </div>
          <div>
              <Label className="text-muted-foreground">Status</Label>
              <div className="mt-1">
                <StatusBadge status={server.status as any} />
          </div>
          </div>
          <div>
              <Label className="text-muted-foreground">Created</Label>
              <p className="font-medium mt-1">{new Date(server.createdAt).toLocaleString()}</p>
          </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface Backup {
  id: string;
  serverId: string;
  name: string;
  description?: string | null;
  size: number;
  path: string;
  createdAt: string;
}

function BackupsTab({ serverId, server }: { serverId: string; server: Server }) {
  const { data: backups = [], refetch } = useQuery<Backup[]>({
    queryKey: ["/api/servers", serverId, "backups"],
  });
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [backupName, setBackupName] = useState("");
  const [backupDescription, setBackupDescription] = useState("");

  const createBackupMutation = useMutation({
    mutationFn: async () => {
      const meResponse = await fetch("/api/auth/me", { credentials: "include" });
      const meData = await meResponse.json();
      const csrfToken = meData.csrfToken;

      const response = await fetch(`/api/servers/${serverId}/backups`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ name: backupName, description: backupDescription }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create backup");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Backup created", description: "Backup has been created successfully" });
      setCreateDialogOpen(false);
      setBackupName("");
      setBackupDescription("");
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "Failed to create backup", description: error.message || "An error occurred", variant: "destructive" });
    },
  });

  const restoreBackupMutation = useMutation({
    mutationFn: async (backupId: string) => {
      const meResponse = await fetch("/api/auth/me", { credentials: "include" });
      const meData = await meResponse.json();
      const csrfToken = meData.csrfToken;

      const response = await fetch(`/api/servers/${serverId}/backups/${backupId}/restore`, {
        method: "POST",
        credentials: "include",
        headers: {
          "X-CSRF-Token": csrfToken,
        },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to restore backup");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Backup restored", description: "Backup has been restored successfully" });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "Failed to restore backup", description: error.message || "An error occurred", variant: "destructive" });
    },
  });

  const deleteBackupMutation = useMutation({
    mutationFn: async (backupId: string) => {
      const meResponse = await fetch("/api/auth/me", { credentials: "include" });
      const meData = await meResponse.json();
      const csrfToken = meData.csrfToken;

      const response = await fetch(`/api/servers/${serverId}/backups/${backupId}`, {
        method: "DELETE",
        credentials: "include",
        headers: {
          "X-CSRF-Token": csrfToken,
        },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete backup");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Backup deleted", description: "Backup has been deleted successfully" });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete backup", description: error.message || "An error occurred", variant: "destructive" });
    },
  });

  const maxBackups = server.limits?.maxBackups;
  const canCreateBackup = maxBackups === undefined || backups.length < maxBackups;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-3">
        <CardTitle>Backups</CardTitle>
          {maxBackups !== undefined && (
            <span className="text-sm text-muted-foreground">
              {backups.length} / {maxBackups}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={!canCreateBackup}>
                <Database className="w-4 h-4 mr-2" />
                Create Backup
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Backup</DialogTitle>
                <DialogDescription>Create a backup of the server files</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Backup Name</Label>
                  <Input
                    value={backupName}
                    onChange={(e) => setBackupName(e.target.value)}
                    className="mt-2"
                    placeholder="backup-2024-01-01"
                  />
                </div>
                <div>
                  <Label>Description (optional)</Label>
                  <Input
                    value={backupDescription}
                    onChange={(e) => setBackupDescription(e.target.value)}
                    className="mt-2"
                    placeholder="Pre-update backup"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => createBackupMutation.mutate()}
                    disabled={createBackupMutation.isPending || !backupName.trim()}
                  >
                    {createBackupMutation.isPending ? "Creating..." : "Create"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {backups.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Database className="w-12 h-12 mx-auto mb-2 opacity-50" />
            No backups yet
          </div>
        ) : (
          <ScrollArea className="h-96">
            <div className="space-y-2">
              {backups.map((backup) => (
                <div key={backup.id} className="flex items-center justify-between p-3 rounded-md border">
                  <div className="flex-1">
                    <div className="font-medium flex items-center gap-2">
                      {backup.name}
                      <span className="text-xs text-muted-foreground font-normal">
                        ({(backup.size / 1024 / 1024).toFixed(2)} MB)
                      </span>
                    </div>
                    {backup.description && (
                      <div className="text-sm text-muted-foreground mt-1">{backup.description}</div>
                    )}
                    <div className="text-xs text-muted-foreground mt-2 flex items-center gap-2">
                      <Calendar className="w-3 h-3" />
                      {new Date(backup.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (confirm("Are you sure you want to restore this backup? This will overwrite current files.")) {
                          restoreBackupMutation.mutate(backup.id);
                        }
                      }}
                      disabled={restoreBackupMutation.isPending}
                      title="Restore backup"
                    >
                      <RotateCw className="w-4 h-4 mr-2" />
                      Restore
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this backup?")) {
                          deleteBackupMutation.mutate(backup.id);
                        }
                      }}
                      disabled={deleteBackupMutation.isPending}
                      title="Delete backup"
                    >
                      <Trash className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

interface ServerPort {
  id: string;
  serverId: string;
  port: number;
  protocol: string;
  name?: string | null;
  description?: string | null;
  isPublic: boolean;
  createdAt: string;
}

function PortsTab({ serverId, server }: { serverId: string; server: Server }) {
  const { data: ports = [], refetch } = useQuery<ServerPort[]>({
    queryKey: ["/api/servers", serverId, "ports"],
  });
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [portNumber, setPortNumber] = useState("");
  const [protocol, setProtocol] = useState<"tcp" | "udp">("tcp");
  const [portName, setPortName] = useState("");
  const [portDescription, setPortDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);

  const createPortMutation = useMutation({
    mutationFn: async () => {
      const meResponse = await fetch("/api/auth/me", { credentials: "include" });
      const meData = await meResponse.json();
      const csrfToken = meData.csrfToken;

      const response = await fetch(`/api/servers/${serverId}/ports`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({
          port: parseInt(portNumber),
          protocol,
          name: portName || null,
          description: portDescription || null,
          isPublic,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create port");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Port added", description: "Port has been added successfully" });
      setCreateDialogOpen(false);
      setPortNumber("");
      setPortName("");
      setPortDescription("");
      setIsPublic(false);
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "Failed to add port", description: error.message || "An error occurred", variant: "destructive" });
    },
  });

  const deletePortMutation = useMutation({
    mutationFn: async (portId: string) => {
      const meResponse = await fetch("/api/auth/me", { credentials: "include" });
      const meData = await meResponse.json();
      const csrfToken = meData.csrfToken;

      const response = await fetch(`/api/servers/${serverId}/ports/${portId}`, {
        method: "DELETE",
        credentials: "include",
        headers: {
          "X-CSRF-Token": csrfToken,
        },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete port");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Port deleted", description: "Port has been deleted successfully" });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete port", description: error.message || "An error occurred", variant: "destructive" });
    },
  });

  const maxPorts = server.limits?.maxPorts;
  const canCreatePort = maxPorts === undefined || ports.length < maxPorts;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-3">
        <CardTitle>Ports</CardTitle>
          {maxPorts !== undefined && (
            <span className="text-sm text-muted-foreground">
              {ports.length} / {maxPorts}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={!canCreatePort}>
                <Network className="w-4 h-4 mr-2" />
                Add Port
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Port</DialogTitle>
                <DialogDescription>Add a new port mapping for this server</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Port Number</Label>
                  <Input
                    type="number"
                    value={portNumber}
                    onChange={(e) => setPortNumber(e.target.value)}
                    className="mt-2"
                    placeholder="25565"
                    min="1"
                    max="65535"
                  />
                </div>
                <div>
                  <Label>Protocol</Label>
                  <select
                    value={protocol}
                    onChange={(e) => setProtocol(e.target.value as "tcp" | "udp")}
                    className="mt-2 w-full p-2 border rounded-md"
                  >
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                  </select>
                </div>
                <div>
                  <Label>Name (optional)</Label>
                  <Input
                    value={portName}
                    onChange={(e) => setPortName(e.target.value)}
                    className="mt-2"
                    placeholder="Rcon, Query, etc."
                  />
                </div>
                <div>
                  <Label>Description (optional)</Label>
                  <Input
                    value={portDescription}
                    onChange={(e) => setPortDescription(e.target.value)}
                    className="mt-2"
                    placeholder="Remote console port"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isPublic"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="isPublic">Public port (accessible from internet)</Label>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => createPortMutation.mutate()}
                    disabled={createPortMutation.isPending || !portNumber || parseInt(portNumber) < 1 || parseInt(portNumber) > 65535}
                  >
                    {createPortMutation.isPending ? "Adding..." : "Add"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 p-4 rounded-md bg-muted border">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-base">Main Port</div>
              <div className="text-sm text-muted-foreground mt-1">Primary server port</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-lg font-semibold">{server.port}/tcp</div>
              <div className="text-xs text-muted-foreground mt-1">Always active</div>
            </div>
          </div>
        </div>
        {ports.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Network className="w-12 h-12 mx-auto mb-2 opacity-50" />
            No additional ports configured
          </div>
        ) : (
          <ScrollArea className="h-96">
            <div className="space-y-2">
              {ports.map((port) => (
                <div key={port.id} className="flex items-center justify-between p-3 rounded-md border">
                  <div className="flex-1">
                    <div className="font-medium flex items-center gap-2">
                      <span className="font-mono">{port.port}/{port.protocol.toUpperCase()}</span>
                      {port.name && (
                        <span className="text-sm text-muted-foreground font-normal">({port.name})</span>
                      )}
                      {port.isPublic && (
                        <span className="text-xs bg-green-500/20 text-green-600 dark:text-green-400 px-2 py-0.5 rounded">Public</span>
                      )}
                    </div>
                    {port.description && (
                      <div className="text-sm text-muted-foreground mt-1">{port.description}</div>
                    )}
                    <div className="text-xs text-muted-foreground mt-2 flex items-center gap-2">
                      <Calendar className="w-3 h-3" />
                      {new Date(port.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (confirm("Are you sure you want to delete this port?")) {
                        deletePortMutation.mutate(port.id);
                      }
                    }}
                    disabled={deletePortMutation.isPending}
                    title="Delete port"
                  >
                    <Trash className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

interface SftpUser {
  id: string;
  serverId: string;
  username: string;
  homeDirectory: string;
  isActive: boolean;
  createdAt: string;
}

function SftpTab({ serverId, server }: { serverId: string; server: Server }) {
  const { data: sftpUsers = [], refetch } = useQuery<SftpUser[]>({
    queryKey: ["/api/servers", serverId, "sftp"],
  });
  const { data: node } = useQuery<Node>({
    queryKey: ["/api/nodes", server.nodeId],
  });
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SftpUser | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [homeDirectory, setHomeDirectory] = useState("/data");
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editHomeDirectory, setEditHomeDirectory] = useState("/data");
  const [editIsActive, setEditIsActive] = useState(true);

  const createSftpUserMutation = useMutation({
    mutationFn: async () => {
      const meResponse = await fetch("/api/auth/me", { credentials: "include" });
      const meData = await meResponse.json();
      const csrfToken = meData.csrfToken;

      const response = await fetch(`/api/servers/${serverId}/sftp`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ username, password, homeDirectory }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create SFTP user");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "SFTP user created", description: "SFTP user has been created successfully" });
      setCreateDialogOpen(false);
      setUsername("");
      setPassword("");
      setHomeDirectory("/data");
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "Failed to create SFTP user", description: error.message || "An error occurred", variant: "destructive" });
    },
  });

  const updateSftpUserMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: { username?: string; password?: string; homeDirectory?: string; isActive?: boolean } }) => {
      const meResponse = await fetch("/api/auth/me", { credentials: "include" });
      const meData = await meResponse.json();
      const csrfToken = meData.csrfToken;

      const payload: any = {};
      if (data.username !== undefined) payload.username = data.username;
      if (data.password !== undefined && data.password.length > 0) payload.password = data.password;
      if (data.homeDirectory !== undefined) payload.homeDirectory = data.homeDirectory;
      if (data.isActive !== undefined) payload.isActive = data.isActive;

      const response = await fetch(`/api/servers/${serverId}/sftp/${userId}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update SFTP user");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "SFTP user updated", description: "SFTP user has been updated successfully" });
      setEditDialogOpen(false);
      setEditingUser(null);
      setEditUsername("");
      setEditPassword("");
      setEditHomeDirectory("/data");
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "Failed to update SFTP user", description: error.message || "An error occurred", variant: "destructive" });
    },
  });

  const deleteSftpUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const meResponse = await fetch("/api/auth/me", { credentials: "include" });
      const meData = await meResponse.json();
      const csrfToken = meData.csrfToken;

      const response = await fetch(`/api/servers/${serverId}/sftp/${userId}`, {
        method: "DELETE",
        credentials: "include",
        headers: {
          "X-CSRF-Token": csrfToken,
        },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete SFTP user");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "SFTP user deleted", description: "SFTP user has been deleted successfully" });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete SFTP user", description: error.message || "An error occurred", variant: "destructive" });
    },
  });

  const handleEdit = (user: SftpUser) => {
    setEditingUser(user);
    setEditUsername(user.username);
    setEditPassword("");
    setEditHomeDirectory(user.homeDirectory);
    setEditIsActive(user.isActive);
    setEditDialogOpen(true);
  };

  const maxSftpUsers = server.limits?.maxSftpUsers;
  const canCreateUser = maxSftpUsers === undefined || sftpUsers.length < maxSftpUsers;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-3">
        <CardTitle>SFTP Users</CardTitle>
          {maxSftpUsers !== undefined && (
            <span className="text-sm text-muted-foreground">
              {sftpUsers.length} / {maxSftpUsers}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={!canCreateUser}>
                <Key className="w-4 h-4 mr-2" />
                Create SFTP User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create SFTP User</DialogTitle>
                <DialogDescription>Create a new SFTP user for file access</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Username</Label>
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="mt-2"
                    placeholder="sftp_user"
                  />
                </div>
                <div>
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-2"
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <Label>Home Directory</Label>
                  <Input
                    value={homeDirectory}
                    onChange={(e) => setHomeDirectory(e.target.value)}
                    className="mt-2"
                    placeholder="/data"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => createSftpUserMutation.mutate()}
                    disabled={createSftpUserMutation.isPending || !username.trim() || !password.trim()}
                  >
                    {createSftpUserMutation.isPending ? "Creating..." : "Create"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {sftpUsers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Key className="w-12 h-12 mx-auto mb-2 opacity-50" />
            No SFTP users configured
          </div>
        ) : (
          <>
            <div className="mb-4 p-4 rounded-md bg-muted space-y-2">
              <div className="font-medium text-sm">SFTP Connection Info:</div>
              <div className="text-sm space-y-1">
                <div>
                  <span className="text-muted-foreground">Host:</span>{" "}
                  <span className="font-mono">{node?.ip || "N/A"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Port:</span>{" "}
                  <span className="font-mono">22</span>{" "}
                  <span className="text-xs text-muted-foreground">(or use SFTP port if configured)</span>
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  Use FileZilla, WinSCP, or any SFTP client to connect. Make sure port 22 is exposed from the container.
                </div>
              </div>
            </div>
            <ScrollArea className="h-96">
              <div className="space-y-2">
                {sftpUsers.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-3 rounded-md border">
                    <div className="flex-1">
                      <div className="font-medium flex items-center gap-2">
                        {user.username}
                        {user.isActive ? (
                          <span className="text-xs bg-green-500/20 text-green-600 dark:text-green-400 px-2 py-0.5 rounded">Active</span>
                        ) : (
                          <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">Inactive</span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">Home: <span className="font-mono">{user.homeDirectory}</span></div>
                      <div className="text-xs text-muted-foreground mt-2 flex items-center gap-2">
                        <Calendar className="w-3 h-3" />
                        {new Date(user.createdAt).toLocaleString()}
                    </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        title="Edit user"
                        onClick={() => handleEdit(user)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this SFTP user?")) {
                          deleteSftpUserMutation.mutate(user.id);
                        }
                      }}
                      disabled={deleteSftpUserMutation.isPending}
                        title="Delete user"
                    >
                        <Trash className="w-4 h-4" />
                    </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}
        {editingUser && (
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit SFTP User</DialogTitle>
                <DialogDescription>Update SFTP user information</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Username</Label>
                  <Input
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    className="mt-2"
                    placeholder="sftp_user"
                  />
                </div>
                <div>
                  <Label>New Password (leave empty to keep current)</Label>
                  <Input
                    type="password"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    className="mt-2"
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <Label>Home Directory</Label>
                  <Input
                    value={editHomeDirectory}
                    onChange={(e) => setEditHomeDirectory(e.target.value)}
                    className="mt-2"
                    placeholder="/data"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="edit-is-active"
                    checked={editIsActive}
                    onChange={(e) => setEditIsActive(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  <Label htmlFor="edit-is-active" className="cursor-pointer">Active</Label>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => updateSftpUserMutation.mutate({
                      userId: editingUser.id,
                      data: {
                        username: editUsername,
                        password: editPassword,
                        homeDirectory: editHomeDirectory,
                        isActive: editIsActive,
                      }
                    })}
                    disabled={updateSftpUserMutation.isPending || !editUsername.trim()}
                  >
                    {updateSftpUserMutation.isPending ? "Updating..." : "Update"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}
