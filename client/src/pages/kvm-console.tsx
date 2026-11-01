import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Power, RefreshCw } from "lucide-react";
import { PageHeader, PageShell } from "@/components/page-header";

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
      
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("WebSocket connected");
        setIsConnected(true);
        
        ws.send(JSON.stringify({
          type: "vds_terminal_connect",
        }));

        setOutput(prev => [...prev, "Connected. Commands run on the panel host."]);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === "vds_terminal_output") {
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
        setOutput(prev => [...prev, "Disconnected."]);
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
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: "vds_terminal_disconnect",
          }));
        }
        wsRef.current.close();
      } catch (err) {
        console.error("Error during disconnect:", err);
      }
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

    setOutput(prev => [...prev, `$ ${command}`]);

    if (command.trim().toLowerCase() === "exit") {
      disconnect();
      setCommand("");
      return;
    }

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      sendCommand();
    }
  };

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        try {
          if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
            wsRef.current.close();
          }
        } catch (err) {
          console.error("Error closing WebSocket:", err);
        }
        wsRef.current = null;
      }
    };
  }, []);

  return (
    <PageShell>
      <PageHeader
        title="Host console"
        description="A shell on the machine that runs the panel. Commands run with the panel's system permissions, so be careful."
        actions={
          isConnected ? (
            <Button variant="outline" onClick={disconnect}>
              <Power /> Disconnect
            </Button>
          ) : (
            <Button onClick={connect}>
              <RefreshCw /> Connect
            </Button>
          )
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Терминал всегда тёмный, как и консоль серверов. */}
      <div className="overflow-hidden rounded-lg border border-[hsl(214_18%_17%)] bg-[hsl(213_26%_8%)]">
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2 text-xs text-[hsl(215_14%_62%)]">
          <span className="status-led" style={{ ["--led" as string]: isConnected ? "hsl(157 57% 46%)" : "hsl(215 11% 45%)" }} />
          {isConnected ? "Connected to the host" : "Not connected"}
        </div>
        <div className="h-[min(60vh,32rem)] overflow-y-auto px-4 py-3 font-mono text-[13px] leading-relaxed text-[hsl(216_22%_88%)]">
          {output.length === 0 ? (
            <div className="text-[hsl(215_11%_50%)]">Press Connect to open a shell.</div>
          ) : (
            output.map((line, index) => (
              <div key={index} className="whitespace-pre-wrap break-words">
                {line}
              </div>
            ))
          )}
          <div ref={outputEndRef} />
        </div>
        <div className="flex items-center gap-2 border-t border-white/[0.06] px-3 py-2">
          <span className="select-none pl-1 font-mono text-sm text-[hsl(157_50%_62%)]">$</span>
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!isConnected}
            placeholder={isConnected ? "Type a command and press Enter" : "Connect to type commands"}
            aria-label="Host command"
            className="h-9 flex-1 bg-transparent font-mono text-sm text-[hsl(216_22%_92%)] placeholder:text-[hsl(215_11%_45%)] focus:outline-none disabled:cursor-not-allowed"
          />
          <Button size="sm" onClick={sendCommand} disabled={!isConnected || !command.trim()}>
            Run
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Type exit to close the session.</p>
    </PageShell>
  );
}
