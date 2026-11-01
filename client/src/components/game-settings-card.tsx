import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { Server } from "@shared/schema";
import { GAME_PROFILES, resolveGameSettings, type GameSettings, type ProfiledGame } from "@shared/game-profiles";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GameSettingsFields } from "@/components/game-settings-fields";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type Stored = Partial<GameSettings> & { secretsSet?: string[] };

/** Настройки игры сервера (ядро, карта, пароль, игроки…). Применяются при следующем запуске. */
export function GameSettingsCard({ server, gameType, canEdit }: { server: Server; gameType: ProfiledGame; canEdit: boolean }) {
  const { toast } = useToast();
  const stored = ((server.config as Record<string, any> | null)?.gameSettings ?? null) as Stored | null;
  const [value, setValue] = useState<GameSettings>(() => resolveGameSettings(gameType, stored));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setValue(resolveGameSettings(gameType, stored));
  }, [JSON.stringify(stored), dirty]);

  const save = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/servers/${server.id}`, { config: { gameSettings: value } }),
    onSuccess: () => {
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["/api/servers", server.id] });
      toast({ title: "Game settings saved", description: server.status === "running" ? "Restart the server to apply them." : "They apply on the next start." });
    },
    onError: (error: Error) => toast({ title: "Game settings not saved", description: error.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{GAME_PROFILES[gameType].label}</CardTitle>
        <CardDescription>Settings of this game server. Everything else is in its config files on the Files tab.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <GameSettingsFields
          gameType={gameType}
          value={value}
          onChange={(next) => {
            setValue(next);
            setDirty(true);
          }}
          secretsSet={stored?.secretsSet}
          disabled={!canEdit}
        />
        {canEdit && (
          <div className="flex justify-end gap-2">
            {dirty && (
              <Button variant="ghost" onClick={() => setDirty(false)}>
                Discard changes
              </Button>
            )}
            <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
              {save.isPending ? "Saving…" : "Save game settings"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
