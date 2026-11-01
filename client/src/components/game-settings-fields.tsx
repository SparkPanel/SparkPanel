import { GAME_PROFILES, type GameSettings, type ProfiledGame } from "@shared/game-profiles";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Поля настроек игры по её профилю: выбор ядра и параметры именно этой игры.
 * Используется при создании сервера и на вкладке настроек.
 */
export function GameSettingsFields({
  gameType,
  value,
  onChange,
  secretsSet = [],
  disabled,
}: {
  gameType: ProfiledGame;
  value: GameSettings;
  onChange: (next: GameSettings) => void;
  /** Секретные поля, у которых на сервере уже сохранено значение. */
  secretsSet?: string[];
  disabled?: boolean;
}) {
  const profile = GAME_PROFILES[gameType];
  const variant = profile.variants.find((v) => v.id === value.variant) ?? profile.variants[0];
  const set = (key: string, v: string | number | boolean) => onChange({ ...value, values: { ...value.values, [key]: v } });

  return (
    <div className="space-y-4">
      {profile.variants.length > 1 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Server core</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {profile.variants.map((v) => (
              <button
                key={v.id}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ ...value, variant: v.id })}
                className={cn(
                  "rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/50 disabled:cursor-not-allowed",
                  v.id === variant.id && "border-primary bg-primary/5",
                )}
                aria-pressed={v.id === variant.id}
              >
                <span className="block text-sm font-medium">{v.label}</span>
                <span className="block text-xs text-muted-foreground">{v.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {profile.fields
          .filter((f) => !f.variants || f.variants.includes(variant.id))
          .map((field) => {
            const id = `game-${gameType}-${field.key}`;
            const current = value.values[field.key] ?? field.default;
            if (field.type === "boolean") {
              return (
                <label key={field.key} className="flex items-start justify-between gap-3 rounded-md border px-3 py-2 sm:col-span-2" htmlFor={id}>
                  <span>
                    <span className="block text-sm font-medium">{field.label}</span>
                    {field.help && <span className="block text-xs text-muted-foreground">{field.help}</span>}
                  </span>
                  <Switch id={id} checked={Boolean(current)} onCheckedChange={(on) => set(field.key, on)} disabled={disabled} />
                </label>
              );
            }
            return (
              <div key={field.key} className={cn("space-y-1.5", (field.help?.length ?? 0) > 60 && "sm:col-span-2")}>
                <label className="text-sm font-medium" htmlFor={id}>
                  {field.label}
                </label>
                {field.type === "select" ? (
                  <Select value={String(current)} onValueChange={(v) => set(field.key, v)} disabled={disabled}>
                    <SelectTrigger id={id}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options!.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={id}
                    type={field.type === "number" ? "number" : field.type === "password" ? "password" : "text"}
                    min={field.min}
                    max={field.max}
                    value={String(current)}
                    placeholder={field.secret && secretsSet.includes(field.key) ? "Saved — type to replace" : undefined}
                    autoComplete="off"
                    disabled={disabled}
                    onChange={(e) => set(field.key, field.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
                  />
                )}
                {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
              </div>
            );
          })}
      </div>
    </div>
  );
}
