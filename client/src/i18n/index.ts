import { RU } from "./ru";

/**
 * Перевод интерфейса RU/EN. Исходные строки интерфейса — английские; русский перевод хранится словарём
 * (ключ — английский текст) и шаблонами для строк с числами и именами. Переводчик заменяет текст узлов
 * и атрибуты placeholder/title/aria-label прямо в документе и следит за изменениями через MutationObserver,
 * поэтому переводятся и окна, и уведомления, и всё, что отрисуется позже. Исходный текст запоминается —
 * при переключении на английский он возвращается без перезагрузки.
 *
 * Не переводится: вывод консоли и редакторы (code/pre/textarea), поля ввода и всё внутри [translate="no"].
 */
export type Language = "en" | "ru";
const STORAGE_KEY = "sparkpanel.language";

const plural = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

/** Строки с подстановками: число, имя, путь. Шаблон должен совпасть с текстом узла целиком. */
const PATTERNS: [RegExp, (...m: string[]) => string][] = [
  [/^Server '(.+)' was (started|stopped|restarted|deleted|killed)$/, (_, n, v) => `Сервер «${n}» ${({ started: "запущен", stopped: "остановлен", restarted: "перезапущен", deleted: "удалён", killed: "принудительно остановлен" } as Record<string, string>)[v]}`],
  [/^Server '(.+)' (started|stopped|restarted)$/, (_, n, v) => `Сервер «${n}» ${({ started: "запущен", stopped: "остановлен", restarted: "перезапущен" } as Record<string, string>)[v]}`],
  [/^Server migrated to node '(.+)'$/, (_, n) => `Сервер перенесён на ноду «${n}»`],
  [/^API key '(.+)' created with (\d+) permissions$/, (_, n, a) => `API-ключ «${n}» создан, прав: ${a}`],
  [/^API key '(.+)' (deleted|activated|deactivated)$/, (_, n, v) => `API-ключ «${n}» ${({ deleted: "удалён", activated: "включён", deactivated: "отключён" } as Record<string, string>)[v]}`],
  [/^Command sent to '(.+)'$/, (_, n) => `Команда для «${n}»`],
  [/^Command executed: (.*)$/, (_, c) => `Выполнена команда: ${c}`],
  [/^Scheduled task: (.+)$/, (_, n) => `Задача по расписанию: ${n}`],
  [/^Created by scheduled task '(.+)'$/, (_, n) => `Создан задачей по расписанию «${n}»`],
  [/^Task '(.+)' \((.+)\)$/, (_, n, c) => `Задача «${n}» (${c})`],
  [/^Security Event: (.+)$/, (_, e) => `Событие безопасности: ${e}`],
  [/^Invalid CSRF token: (.+)$/, (_, a) => `Неверный CSRF-токен: ${a}`],
  [/^(.+) from IP: (.+)$/, (_, a, ip) => `${translateText(a) ?? a} с IP: ${ip}`],
  [/^SFTP user '(.+)' (created for|updated for|deleted from) server '(.+)'$/, (_, u, v, n) =>
    `SFTP-пользователь «${u}» ${({ "created for": "создан", "updated for": "изменён", "deleted from": "удалён" } as Record<string, string>)[v]} для сервера «${n}»`],
  [/^Backup '(.+)' created for '(.+)'$/, (_, b, n) => `Бэкап «${b}» создан для «${n}»`],
  [/^DDoS protection settings updated for server '(.+)'$/, (_, n) => `Изменены настройки DDoS-защиты сервера «${n}»`],
  [/^Node '(.+)' \((.*)\) was added( — Docker is not reachable yet)?$/, (_, n, l, off) => `Нода «${n}» (${l}) добавлена${off ? " — Docker пока недоступен" : ""}`],
  [/^Node '(.+)' is offline$/, (_, n) => `Нода «${n}» не в сети`],
  [/^Plugin '(.+)' \((.+)\) uploaded$/, (_, n, v) => `Плагин «${n}» (${v}) загружен`],
  [/^Plugin '(.+)' was (enabled|disabled)$/, (_, n, v) => `Плагин «${n}» ${v === "enabled" ? "включён" : "отключён"}`],
  [/^Port (\d+)\/(\w+) (added to|removed from) server '(.+)' \(applies after restart\)$/, (_, p, pr, v, n) =>
    `Порт ${p}/${pr} ${v === "added to" ? "добавлен серверу" : "удалён с сервера"} «${n}» (вступит в силу после перезапуска)`],
  [/^Template '(.+)' from server '(.+)'$/, (_, t, n) => `Шаблон «${t}» из сервера «${n}»`],
  [/^Template '(.+)'$/, (_, t) => `Шаблон «${t}»`],
  [/^Two-factor authentication of '(.+)' was reset by '(.+)'$/, (_, u, by) => `Двухфакторная аутентификация «${u}» сброшена пользователем «${by}»`],
  [/^User (.+) connected to VDS terminal$/, (_, u) => `Пользователь ${u} подключился к терминалу VDS`],
  [/^(.+): autoscale off$/, (_, n) => `${n}: автомасштабирование выключено`],
  [/^(.+): autoscale (\d+)–(\d+) copies at (\d+)% CPU$/, (_, n, a, b, c) => `${n}: автомасштабирование ${a}–${b} копий при ${c}% CPU`],
  [/^(.+): files copied to (\d+) copies$/, (_, n, a) => `${n}: файлы скопированы в копии: ${a}`],
  [/^(.+): copy (\d+) on port (\d+)$/, (_, n, c, p) => `${n}: копия ${c} на порту ${p}`],
  [/^(.+): (added|removed) a copy$/, (_, n, v) => `${n}: ${v === "added" ? "добавлена" : "удалена"} копия`],
  [/^(.+): turned off$/, (_, n) => `${n}: выключено`],
  [/^(.+): deploys from Git turned off\. Files stay as they are\.$/, (_, n) => `${n}: деплой из Git выключен. Файлы остаются как есть.`],
  [/^(.+): files were not copied from (.+) \((.+)\)$/, (_, n, s, e) => `${n}: файлы не скопированы из ${s} (${e})`],
  [/^(.+): (added|removed) (\S+) (?:to|from) (.+)$/, (_, n, v, id, l) => `${n}: ${id} ${v === "added" ? "добавлен в" : "удалён из"} ${RU[l] ?? l}`],
  [/^(.+) from (Modrinth|uMod|Thunderstore)$/, (_, a, s) => `${a} с ${s}`],
  [/^(\d+) servers?, (\d+) running\. (\d+) cores, (\S+) GB RAM, (\S+) GB disk$/, (_, s, r, c, m, d) =>
    `${s} ${plural(+s, "сервер", "сервера", "серверов")}, работает ${r}. ${c} ${plural(+c, "ядро", "ядра", "ядер")}, ${m} ГБ RAM, ${d} ГБ диска`],
  [/^(Full access|(\d+) permissions), signed in as (.+)$/, (_, all, n, u) => `${n ? `${n} ${plural(+n, "право", "права", "прав")}` : "Полный доступ"}, вы вошли как ${u}`],
  [/^Owner: (.+)\.$/, (_, u) => `Владелец: ${u}.`],
  [/^port (\d+)$/, (_, p) => `порт ${p}`],
  [/^Server '(.+)' \((\w+)\) was created$/, (_, n, t) => `Сервер «${n}» (${t}) создан`],
  [/^Server '(.+)' settings updated$/, (_, n) => `Изменены настройки сервера «${n}»`],
  [/^Server '(.+)' stopped with an error$/, (_, n) => `Сервер «${n}» остановился с ошибкой`],
  [/^Server '(.+)' crashed and was restarted \(attempt (\d+)\)$/, (_, n, a) => `Сервер «${n}» упал и был перезапущен (попытка ${a})`],
  [/^Server '(.+)' was created from '(.+)'( with its files)?$/, (_, n, s, f) => `Сервер «${n}» создан из «${s}»${f ? " вместе с файлами" : ""}`],
  [/^Server '(.+)' migrated from '(.+)' to '(.+)'$/, (_, n, a, b) => `Сервер «${n}» перенесён с «${a}» на «${b}»`],
  [/^User '(.+)' logged in from (.+)$/, (_, u, ip) => `Пользователь «${u}» вошёл с ${ip}`],
  [/^User '(.+)' logged in with 2FA \((.+)\) from (.+)$/, (_, u, m, ip) => `Пользователь «${u}» вошёл с 2FA (${m}) с ${ip}`],
  [/^User '(.+)' was created with (\d+) permissions$/, (_, u, n) => `Пользователь «${u}» создан, прав: ${n}`],
  [/^User '(.+)' was (deleted|updated)$/, (_, u, v) => `Пользователь «${u}» ${v === "deleted" ? "удалён" : "изменён"}`],
  [/^User '(.+)' changed their password$/, (_, u) => `Пользователь «${u}» сменил пароль`],
  [/^User '(.+)' updated their profile$/, (_, u) => `Пользователь «${u}» изменил профиль`],
  [/^User '(.+)' generated new 2FA recovery codes$/, (_, u) => `Пользователь «${u}» создал новые коды восстановления 2FA`],
  [/^Backup '(.+)' (created|restored) for server '(.+)'$/, (_, b, v, n) => `Бэкап «${b}» ${v === "created" ? "создан" : "восстановлен"} для сервера «${n}»`],
  [/^Backup '(.+)' deleted$/, (_, b) => `Бэкап «${b}» удалён`],
  [/^Command sent to '(.+)': (.*)$/, (_, n, c) => `Команда для «${n}»: ${c}`],
  [/^Node '(.+)' was deleted$/, (_, n) => `Нода «${n}» удалена`],
  [/^Plugin '(.+)' was deleted$/, (_, n) => `Плагин «${n}» удалён`],
  [/^Public status page shows (\d+) servers$/, (_, a) => `Публичная страница показывает серверов: ${a}`],
  [/^(.+): payment period ended$/, (_, n) => `${n}: оплаченный срок закончился`],
  [/^(.+): valid for 24 hours$/, (_, n) => `${n}: действует 24 часа`],
  [/^(.+): no domains$/, (_, n) => `${n}: доменов нет`],
  [/^(.+): access removed$/, (_, n) => `${n}: доступ снят`],
  [/^(.+): database and its data removed$/, (_, n) => `${n}: база и её данные удалены`],
  [/^(.+): new image downloaded \(by (.+)\)$/, (_, n, u) => `${n}: скачан новый образ (${u})`],
  [/^Environment variables of '(.+)' were changed \((\d+) set\)$/, (_, n, a) => `Изменены переменные окружения «${n}» (задано: ${a})`],
  [/^(\d+) of (\d+) servers online$/, (_, a, b) => `${a} из ${b} серверов в сети`],
  [/^(\d+) of (\d+) online\. Machines with Docker where servers run\.$/, (_, a, b) => `${a} из ${b} в сети. Машины с Docker, на которых работают серверы.`],
  [/^(\d+) of (\d+) kept\. When the limit is reached, the oldest backup is removed\.$/, (_, a, b) => `Хранится ${a} из ${b}. Когда лимит достигнут, удаляется самый старый бэкап.`],
  [/^(\d+) of (\d+) extra ports used\. New ports open after the next restart\.$/, (_, a, b) => `Использовано ${a} из ${b} доп. портов. Новые порты открываются после перезапуска.`],
  [/^(\d+) of (\d+) accounts used$/, (_, a, b) => `Использовано ${a} из ${b} аккаунтов`],
  [/^(\d+) of (\d+) lines$/, (_, a, b) => `${a} из ${b} строк`],
  [/^(\d+) lines$/, (_, a) => `${a} ${plural(+a, "строка", "строки", "строк")}`],
  [/^(\d+) selected$/, (_, a) => `Выбрано: ${a}`],
  [/^(\d+) items? deleted$/, (_, a) => `Удалено: ${a}`],
  [/^(\d+) not deleted$/, (_, a) => `Не удалено: ${a}`],
  [/^(\d+) files uploaded$/, (_, a) => `Загружено файлов: ${a}`],
  [/^(\d+) failed$/, (_, a) => `С ошибкой: ${a}`],
  [/^(\d+) (?:server|servers) (started|stopped|restarted)$/, (_, a, verb) => `${verb === "started" ? "Запущено" : verb === "stopped" ? "Остановлено" : "Перезапущено"} серверов: ${a}`],
  [/^(\d+) skipped \(already in that state\)$/, (_, a) => `${a} пропущено (уже в этом состоянии)`],
  [/^(\d+) (?:match|matches) for “(.+)” in (\S+)( \(showing the first 200\))?$/, (_, a, q, p, t) => `Найдено ${a} по «${q}» в ${p}${t ? " (показаны первые 200)" : ""}`],
  [/^(\d+) (?:account|accounts), (\d+) with full access$/, (_, a, b) => `${a} ${plural(+a, "учётная запись", "учётные записи", "учётных записей")}, с полным доступом: ${b}`],
  [/^(\d+) versions available, newest first$/, (_, a) => `Доступно версий: ${a}, сначала новые`],
  [/^(\d+) permissions$/, (_, a) => `${a} ${plural(+a, "право", "права", "прав")}`],
  [/^(\d+(?:\.\d+)?)% now$/, (_, a) => `${a}% сейчас`],
  [/^(\d+(?:\.\d+)?) GB now$/, (_, a) => `${a} ГБ сейчас`],
  [/^(\d+)% of the node$/, (_, a) => `${a}% ноды`],
  [/^Online now — (\d+)(?: of (\d+))?$/, (_, a, b) => `Сейчас в сети — ${a}${b ? ` из ${b}` : ""}`],
  [/^Whitelist — (\d+)$/, (_, a) => `Белый список — ${a}`],
  [/^Operators — (\d+)$/, (_, a) => `Операторы — ${a}`],
  [/^Banned — (\d+)$/, (_, a) => `Забанены — ${a}`],
  [/^On, up to (\d+) times in a row$/, (_, a) => `Вкл., до ${a} раз подряд`],
  [/^Ports (\d+)–(\d+) saved$/, (_, a, b) => `Порты ${a}–${b} сохранены`],
  [/^Ports (\d+)–(\d+): (\d+) used(, none free|, next free (\d+))$/, (_, a, b, u, tail, n) => `Порты ${a}–${b}: занято ${u}${n ? `, следующий свободный ${n}` : ", свободных нет"}`],
  [/^Use free port (\d+) from this node's range$/, (_, a) => `Взять свободный порт ${a} из диапазона ноды`],
  [/^Address and ports of (.+)$/, (_, a) => `Адрес и порты ноды ${a}`],
  [/^Players connect to (.+)$/, (_, a) => `Игроки подключаются к ${a}`],
  [/^Open the game console \(~\) and type: connect (.+)$/, (_, a) => `Откройте консоль игры (~) и введите: connect ${a}`],
  [/^Press F1 in the game and type: client\.connect (.+)$/, (_, a) => `Нажмите F1 в игре и введите: client.connect ${a}`],
  [/^In Steam: View → Game Servers → Favorites → Add a server → (.+)\. Then join from the ARK server list\.$/, (_, a) =>
    `В Steam: Вид → Серверы → Избранное → Добавить сервер → ${a}. Затем подключитесь из списка серверов ARK.`],
  [/^In Valheim: Start game → Join game → Add server → (.+)\. Or in Steam: View → Game Servers → Favorites → Add a server → (.+)\.$/, (_, a, b) =>
    `В Valheim: Начать игру → Присоединиться → Добавить сервер → ${a}. Или в Steam: Вид → Серверы → Избранное → Добавить сервер → ${b}.`],
  [/^(.+): at least (\d+) characters$/, (_, f, n) => `${RU[f] ?? f}: не короче ${n} символов`],
  [/^(.+): at least (\d+)$/, (_, f, n) => `${RU[f] ?? f}: не меньше ${n}`],
  [/^(.+): at most (\d+)$/, (_, f, n) => `${RU[f] ?? f}: не больше ${n}`],
  [/^(.+): enter a whole number$/, (_, f) => `${RU[f] ?? f}: введите целое число`],
  [/^(.+): choose a value from the list$/, (_, f) => `${RU[f] ?? f}: выберите значение из списка`],
  [/^(.+): quotes, backslashes and line breaks are not allowed$/, (_, f) => `${RU[f] ?? f}: кавычки, обратная косая черта и переносы строк недопустимы`],
  [/^Join password: Valheim does not allow the server name inside the password$/, () => "Пароль для входа: Valheim не разрешает название сервера внутри пароля"],
  [/^(\d+) (plugins|mods) on (\S+)(?: for (.+))?, installed to$/, (_, n, kind, src, forWhat) => `${n} ${kind === "mods" ? "модов" : "плагинов"} на ${src}${forWhat ? ` для ${forWhat}` : ""}, установка в`],
  [/^Search (plugins|mods) on (.+)$/, (_, kind, src) => `Поиск ${kind === "mods" ? "модов" : "плагинов"} на ${src}`],
  [/^(Admins|Banned|Allowed players) — (\d+)$/, (_, l, n) => `${RU[l] ?? l} — ${n}`],
  [/^Plugins need the (.+) core\. Switch the core in Settings and restart the server\.$/, (_, c) => `Для плагинов нужно ядро ${c}. Переключите ядро в настройках и перезапустите сервер.`],
  [/^Cannot reach RCON: (.+)$/, (_, e) => `Не удалось подключиться к RCON: ${e}`],
  [/^(\d+) \/ (\d+) online$/, (_, a, b) => `${a} / ${b} в сети`],
  [/^Node (\d+)$/, (_, a) => `Нода ${a}`],
  [/^Copies — (\d+)$/, (_, a) => `Копии — ${a}`],
  [/^Copy (\d+)$/, (_, a) => `Копия ${a}`],
  [/^Balanced through (.+)$/, (_, a) => `Балансировка через ${a}`],
  [/^Files copied to (\d+) copies one by one\.$/, (_, a) => `Файлы скопированы в копии по очереди: ${a}`],
  [/^(.+): copy (\d+) (added|removed), CPU (\d+)%$/, (_, n, c, v, cpu) => `${n}: копия ${c} ${v === "added" ? "добавлена" : "удалена"}, CPU ${cpu}%`],
  [/^Set the public address of node (.+) on the Nodes page: copies on other machines need it to reach this node\.$/, (_, n) => `Задайте публичный адрес ноды ${n} на странице «Ноды»: по нему копии на других машинах подключаются к этой ноде.`],
  [/^Copies: at least 1, at most 20, and the maximum not below the minimum$/, () => "Копии: не меньше 1, не больше 20, максимум не меньше минимума"],
  [/^CPU threshold: from 10 to 95%$/, () => "Порог CPU: от 10 до 95%"],
  [/^Saved to (.+)$/, (_, a) => `Сохранено в ${a}`],
  [/^Files are in (.+)$/, (_, a) => `Файлы в ${a}`],
  [/^(.+) was deleted$/, (_, a) => `${a} удалён`],
  [/^(.+) has been saved$/, (_, a) => `${a} сохранён`],
  [/^(.+) and its files were removed$/, (_, a) => `${a} и его файлы удалены`],
  [/^(.+) is no longer used by the panel$/, (_, a) => `${a} больше не используется панелью`],
  [/^(.+) is ready\. Start it when you need it\.$/, (_, a) => `${a} готов. Запустите, когда понадобится.`],
  [/^(.+) installed$/, (_, a) => `${a} установлен`],
  [/^(.+) can create servers$/, (_, a) => `${a} может создавать серверы`],
  [/^(.+) can no longer create servers$/, (_, a) => `${a} больше не может создавать серверы`],
  [/^Choose “(.+)” when creating a new server\.$/, (_, a) => `Выберите «${a}» при создании сервера.`],
  [/^DNS points to (.+), not to this node$/, (_, a) => `DNS указывает на ${a}, а не на эту ноду`],
  [/^Next backup (.+?)\. (.*)$/, (_, a, rest) => `Следующий бэкап ${a}. ${translateText(rest) ?? rest}`],
  [/^Last run (.+?)\. (.*)$/, (_, a, rest) => `Последний запуск ${a}. ${translateText(rest) ?? rest}`],
  [/^Last run failed: (.+?)\. (.*)$/, (_, a, rest) => `Последний запуск с ошибкой: ${a}. ${translateText(rest) ?? rest}`],
  [/^The oldest backups are deleted to keep (\d+)\.$/, (_, a) => `Старые бэкапы удаляются, чтобы осталось ${a}.`],
  [/^All backups are kept until you delete them\.$/, () => "Все бэкапы хранятся, пока вы их не удалите."],
  [/^Welcome to (.+)$/, (_, a) => `Добро пожаловать в ${a}`],
  [/^More actions for (.+)$/, (_, a) => `Другие действия: ${a}`],
  [/^(Delete|Remove|Rename|Download|Edit|Select|Extract|Copy|Kick|Ban|Enable|Disable) (.+)\??$/, (_, verb, what) => `${RU[verb] ?? verb} ${what}`],
  [/^(\d+) of (\d+) running$/, (_, a, b) => `Работает ${a} из ${b}`],
  [/^(\d+) (running|stopped|with errors)$/, (_, a, w) => `${a} ${RU[w] ?? w}`],
  [/^(.+): peak (.+)$/, (_, a, b) => `${RU[a] ?? a}: пик ${b}`],
  [/^Open a website or web app on this server at your own domain with HTTPS\. Point the domain's A record to (.+); ports 80 and 443 on the node must be free\. Requests go to port (\d+)\.$/, (_, ip, port) =>
    `Откройте сайт или веб-приложение этого сервера на своём домене с HTTPS. Направьте A-запись домена на ${ip}; порты 80 и 443 на ноде должны быть свободны. Запросы идут на порт ${port}.`],
  [/^Your quota: (\d+) of (\d+) servers, (-?\d+) GB memory, (-?\d+)% CPU and (-?\d+) GB disk left\.$/, (_, s, m, r, c, d) => `Ваша квота: ${s} из ${m} серверов, осталось ${r} ГБ памяти, ${c}% CPU и ${d} ГБ диска.`],
  [/^Updated (.+)\. Refreshes every 30 seconds\.$/, (_, a) => `Обновлено в ${a}. Обновляется каждые 30 секунд.`],
  [/^Works once, until (.+)\. The machine must be able to reach this panel at the address in the command\. Set$/, (_, a) => `Работает один раз, до ${a}. Машина должна видеть панель по адресу из команды. Задайте`],
  [/^(\d+(?:\.\d+)?[KMB]?) downloads$/, (_, a) => `${a} загрузок`],
  [/^by (.+)$/, (_, a) => `от ${a}`],
];

/** Перевод одной строки целиком или null, если перевода нет. */
export function translateText(text: string): string | null {
  const key = text.trim();
  if (!key || !/[A-Za-z]/.test(key)) return null;
  const direct = RU[key];
  if (direct) return direct;
  for (const [pattern, render] of PATTERNS) {
    const m = key.match(pattern);
    if (m) return render(...m);
  }
  return null;
}

export function getLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "ru" || saved === "en") return saved;
  } catch {
  }
  return navigator.language?.toLowerCase().startsWith("ru") ? "ru" : "en";
}

const ATTRIBUTES = ["placeholder", "title", "aria-label", "alt"] as const;
const SKIP = "code, pre, textarea, script, style, [translate='no'], [contenteditable='true'], [data-testid='console-output']";

/** Английский оригинал узлов и атрибутов, чтобы вернуть его при переключении языка. */
const originalText = new WeakMap<Text, string>();
const translatedText = new WeakMap<Text, string>();
const originalAttr = new WeakMap<Element, Map<string, string>>();

let language: Language = getLanguage();
let observer: MutationObserver | null = null;

const skipped = (el: Element | null) => Boolean(el?.closest(SKIP));

function translateNode(node: Text) {
  if (skipped(node.parentElement)) return;
  const current = node.nodeValue ?? "";
  if (translatedText.get(node) !== current) originalText.set(node, current);
  const original = originalText.get(node) ?? current;
  if (language === "en") {
    if (current !== original) node.nodeValue = original;
    translatedText.delete(node);
    return;
  }
  const translated = translateText(original);
  if (!translated) return;
  const lead = original.match(/^\s*/)![0];
  const trail = original.match(/\s*$/)![0];
  const next = `${lead}${translated}${trail}`;
  translatedText.set(node, next);
  if (current !== next) node.nodeValue = next;
}

function translateAttributes(el: Element) {
  if (skipped(el) && !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  let saved = originalAttr.get(el);
  for (const name of ATTRIBUTES) {
    const value = el.getAttribute(name);
    if (value === null) continue;
    if (!saved) originalAttr.set(el, (saved = new Map()));
    const known = saved.get(name);
    const ownTranslation = known !== undefined ? translateText(known) : null;
    if (known === undefined || (value !== known && value !== ownTranslation)) saved.set(name, value);
    const original = saved.get(name)!;
    const next = language === "ru" ? (translateText(original) ?? original) : original;
    if (value !== next) el.setAttribute(name, next);
  }
}

function translateTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return translateNode(root as Text);
  if (!(root instanceof Element)) return;
  translateAttributes(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) translateNode(n as Text);
    else translateAttributes(n as Element);
  }
}

/** Включает перевод документа и следит за новыми элементами. */
export function startTranslator() {
  language = getLanguage();
  document.documentElement.lang = language;
  translateTree(document.body);
  observer?.disconnect();
  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "characterData") translateNode(m.target as Text);
      else if (m.type === "attributes") translateAttributes(m.target as Element);
      else m.addedNodes.forEach(translateTree);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRIBUTES] });
}

const listeners = new Set<(lang: Language) => void>();

export function setLanguage(next: Language) {
  language = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
  }
  document.documentElement.lang = next;
  translateTree(document.body);
  listeners.forEach((fn) => fn(next));
}

export function onLanguageChange(fn: (lang: Language) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const currentLanguage = () => language;
