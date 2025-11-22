import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Terminal as TerminalIcon, Power, RefreshCw } from "lucide-react";

export default function KvmConsolePage() {
  const [isConnected, setIsConnected] = useState(false);
  const [output, setOutput] = useState<string[]>([]);
  const [command, setCommand] = useState("");
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const outputEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    outputEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [output]);

  const connect = () => {
    try {
      setError(null);
      
      // Создаем WebSocket подключение
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("WebSocket connected");
        setIsConnected(true);
        
        // Отправляем сообщение о подключении к VDS терминалу
        ws.send(JSON.stringify({
          type: "vds_terminal_connect",
        }));

        // Добавляем приветственное сообщение
        setOutput(prev => [...prev, "=== VDS Console Connected ==="]);
        setOutput(prev => [...prev, "Type commands to execute on the VDS server."]);
        setOutput(prev => [...prev, "Use 'exit' to disconnect.\n"]);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === "vds_terminal_output") {
            // Добавляем вывод команды
            if (data.output) {
              setOutput(prev => [...prev, data.output]);
            }
          } else if (data.type === "vds_terminal_error") {
            setError(data.message || "Unknown error");
            setOutput(prev => [...prev, `[ERROR] ${data.message || "Unknown error"}`]);
          } else if (data.type === "vds_terminal_connected") {
            setOutput(prev => [...prev, "[CONNECTED] Terminal session started\n"]);
          }
        } catch (err) {
          console.error("Failed to parse WebSocket message:", err);
        }
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        setError("Connection error occurred");
        setIsConnected(false);
      };

      ws.onclose = () => {
        console.log("WebSocket disconnected");
        setIsConnected(false);
        setOutput(prev => [...prev, "\n=== VDS Console Disconnected ==="]);
        wsRef.current = null;
      };

      wsRef.current = ws;
    } catch (err) {
      console.error("Failed to connect:", err);
      setError("Failed to connect to server");
      setIsConnected(false);
    }
  };

  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({
        type: "vds_terminal_disconnect",
      }));
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  };

  const sendCommand = () => {
    if (!command.trim()) return;
    
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError("Not connected to server");
      return;
    }

    // Показываем команду в выводе
    setOutput(prev => [...prev, `$ ${command}`]);

    // Проверяем на команду выхода
    if (command.trim().toLowerCase() === "exit") {
      disconnect();
      setCommand("");
      return;
    }

    // Отправляем команду
    try {
      wsRef.current.send(JSON.stringify({
        type: "vds_terminal_command",
        command: command,
      }));
      setCommand("");
      setError(null);
    } catch (err) {
      console.error("Failed to send command:", err);
      setError("Failed to send command");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      sendCommand();
    }
  };

  useEffect(() => {
    // Автоматически подключаемся при загрузке страницы
    connect();

    // Очистка при размонтировании
    return () => {
      if (wsRef.current) {
        disconnect();
      }
    };
  }, []);

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <TerminalIcon className="w-8 h-8" />
          VDS Console (KVM)
        </h1>
        <p className="text-muted-foreground mt-2">
          Terminal для управления VDS сервером. Выполняйте команды напрямую на сервере.
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Console Terminal</CardTitle>
              <CardDescription>
                Подключение: {isConnected ? (
                  <span className="text-green-500 font-semibold">Connected</span>
                ) : (
                  <span className="text-red-500 font-semibold">Disconnected</span>
                )}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {isConnected ? (
                <Button variant="outline" onClick={disconnect} size="sm">
                  <Power className="w-4 h-4 mr-2" />
                  Disconnect
                </Button>
              ) : (
                <Button variant="outline" onClick={connect} size="sm">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Connect
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Terminal Output */}
          <div className="bg-black text-green-400 font-mono text-sm p-4 rounded-lg h-[500px] overflow-y-auto mb-4">
            {output.length === 0 ? (
              <div className="text-gray-500">Waiting for connection...</div>
            ) : (
              output.map((line, index) => (
                <div key={index} className="whitespace-pre-wrap break-words">
                  {line}
                </div>
              ))
            )}
            <div ref={outputEndRef} />
          </div>

          {/* Command Input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={!isConnected}
              placeholder={isConnected ? "Enter command..." : "Connect to start"}
              className="flex-1 px-4 py-2 border border-input bg-background rounded-md font-mono text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <Button 
              onClick={sendCommand} 
              disabled={!isConnected || !command.trim()}
            >
              Send
            </Button>
          </div>

          <div className="mt-4 text-xs text-muted-foreground">
            <p>💡 Tip: Команды выполняются от имени пользователя, под которым запущен Node.js процесс.</p>
            <p>⚠️ Warning: Будьте осторожны при выполнении системных команд!</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

