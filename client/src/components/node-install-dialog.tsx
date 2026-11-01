import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Copy, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

/** Команда для подключения новой машины: ставит Docker и включает TLS-доступ только для этой панели. */
export function NodeInstallDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [result, setResult] = useState<{ command: string; expiresAt: string } | null>(null);

  const create = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/nodes/enrollments", { name: name.trim(), location: location.trim() })).json(),
    onSuccess: setResult,
    onError: (error: Error) => toast({ title: "Command not created", description: error.message, variant: "destructive" }),
  });

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setResult(null);
      setName("");
      setLocation("");
      queryClient.invalidateQueries({ queryKey: ["/api/nodes"] });
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Terminal /> Install with a command
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add a machine with one command</DialogTitle>
            <DialogDescription>
              Run the command as root on a Linux machine with systemd. It installs Docker if needed and opens Docker on port 2376 only to this panel's certificate.
            </DialogDescription>
          </DialogHeader>
          {result ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3">
                <code className="min-w-0 flex-1 break-all font-mono text-xs">{result.command}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label="Copy command"
                  onClick={() => navigator.clipboard?.writeText(result.command).then(() => toast({ title: "Command copied" }))}
                >
                  <Copy />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Works once, until {new Date(result.expiresAt).toLocaleString()}. The machine must be able to reach this panel at the address in the command. Set{" "}
                <span className="font-mono">SPARKPANEL_NODE_IP</span> before the command if the machine has several addresses.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="install-name">
                    Name
                  </label>
                  <Input id="install-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Frankfurt 1" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="install-location">
                    Location
                  </label>
                  <Input id="install-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Germany" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
                  Create command
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
