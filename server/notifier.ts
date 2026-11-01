import { settingsStore } from "./data-dir";

/** События, о которых панель может сообщать администратору. */
export const NOTIFICATION_EVENTS = {
  server_crash: "A server crashed or stopped with an error",
  server_recovered: "A crashed server was restarted automatically",
  backup_failed: "A backup could not be created",
  disk_almost_full: "A server used 90% of its disk limit",
  node_offline: "A node went offline or came back",
} as const;

export type NotificationEvent = keyof typeof NOTIFICATION_EVENTS;

export interface NotificationSettings {
  discordWebhookUrl?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  events: Record<NotificationEvent, boolean>;
}

const DEFAULT_EVENTS = Object.fromEntries(Object.keys(NOTIFICATION_EVENTS).map((e) => [e, true])) as Record<NotificationEvent, boolean>;
const DISCORD_WEBHOOK = /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;
const TELEGRAM_TOKEN = /^\d{5,}:[\w-]{30,}$/;

export function getNotificationSettings(): NotificationSettings {
  const stored = settingsStore.get<Partial<NotificationSettings>>("notifications", {});
  return { ...stored, events: { ...DEFAULT_EVENTS, ...(stored.events ?? {}) } };
}

/** Проверяет и сохраняет настройки. Пустая строка удаляет канал. */
export async function saveNotificationSettings(input: Partial<NotificationSettings>): Promise<NotificationSettings> {
  const current = getNotificationSettings();
  const next: NotificationSettings = { ...current, events: { ...current.events } };
  if (input.discordWebhookUrl !== undefined) {
    const url = input.discordWebhookUrl.trim();
    if (url && !DISCORD_WEBHOOK.test(url)) throw Object.assign(new Error("This is not a Discord webhook URL"), { status: 400 });
    next.discordWebhookUrl = url || undefined;
  }
  if (input.telegramBotToken !== undefined) {
    const token = input.telegramBotToken.trim();
    if (token && !TELEGRAM_TOKEN.test(token)) throw Object.assign(new Error("This is not a Telegram bot token"), { status: 400 });
    next.telegramBotToken = token || undefined;
  }
  if (input.telegramChatId !== undefined) {
    const chat = input.telegramChatId.trim();
    if (chat && !/^-?\d+$|^@\w{4,}$/.test(chat)) throw Object.assign(new Error("Chat ID must be a number or @channel"), { status: 400 });
    next.telegramChatId = chat || undefined;
  }
  if (input.events) {
    for (const key of Object.keys(NOTIFICATION_EVENTS) as NotificationEvent[]) {
      if (typeof input.events[key] === "boolean") next.events[key] = input.events[key];
    }
  }
  await settingsStore.set("notifications", next);
  return next;
}

/** Настройки для ответа API: токены не отдаются целиком. */
export function publicNotificationSettings() {
  const s = getNotificationSettings();
  return {
    discordWebhookUrl: s.discordWebhookUrl ? `${s.discordWebhookUrl.slice(0, 48)}…` : "",
    discordConfigured: Boolean(s.discordWebhookUrl),
    telegramConfigured: Boolean(s.telegramBotToken && s.telegramChatId),
    telegramChatId: s.telegramChatId ?? "",
    events: s.events,
    available: NOTIFICATION_EVENTS,
  };
}

async function post(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`${new URL(url).hostname} answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/** Отправляет сообщение во все настроенные каналы. Возвращает ошибки каналов (пустой массив — всё дошло). */
export async function sendToChannels(title: string, message: string, settings = getNotificationSettings()): Promise<string[]> {
  const jobs: Promise<void>[] = [];
  if (settings.discordWebhookUrl) {
    jobs.push(post(settings.discordWebhookUrl, { username: "SparkPanel", embeds: [{ title, description: message, color: 0x0f8b5f }] }));
  }
  if (settings.telegramBotToken && settings.telegramChatId) {
    jobs.push(
      post(`https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`, {
        chat_id: settings.telegramChatId,
        text: `${title}\n${message}`,
        disable_web_page_preview: true,
      }),
    );
  }
  const results = await Promise.allSettled(jobs);
  return results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => String(r.reason?.message ?? r.reason));
}

const lastSent = new Map<string, number>();

/**
 * Уведомление о событии. dedupeKey + cooldown не дают завалить канал одинаковыми сообщениями
 * (например, о заполненном диске каждые 5 секунд).
 */
export function notify(event: NotificationEvent, title: string, message: string, dedupeKey?: string, cooldownMs = 0): void {
  const settings = getNotificationSettings();
  if (!settings.events[event] || (!settings.discordWebhookUrl && !(settings.telegramBotToken && settings.telegramChatId))) return;
  if (dedupeKey) {
    const key = `${event}:${dedupeKey}`;
    const last = lastSent.get(key) ?? 0;
    if (Date.now() - last < cooldownMs) return;
    lastSent.set(key, Date.now());
  }
  sendToChannels(title, message, settings)
    .then((errors) => errors.forEach((e) => console.warn(`Notification '${event}' failed:`, e)))
    .catch(() => {});
}
