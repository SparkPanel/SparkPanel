/**
 * Система логирования безопасности для отслеживания подозрительных действий
 */
import { storage } from "./storage";

export interface SecurityEvent {
  type: "csrf_attack" | "brute_force" | "unauthorized_access" | "suspicious_command" | "path_traversal" | "xss_attempt";
  ip: string;
  userId?: string;
  details: string;
  timestamp: Date;
}

/**
 * Логировать событие безопасности
 */
export async function logSecurityEvent(event: SecurityEvent): Promise<void> {
  try {
    // Сохраняем в activity log
    await storage.addActivity({
      type: "security_event",
      title: `Security Event: ${event.type}`,
      description: `${event.details} from IP: ${event.ip}`,
      timestamp: event.timestamp,
      userId: event.userId,
    });

    // Дополнительно логируем в консоль для мониторинга
    console.warn(`[SECURITY] ${event.type} - IP: ${event.ip}${event.userId ? ` User: ${event.userId}` : ""} - ${event.details}`);
  } catch (error) {
    // Не позволяем ошибкам логирования сломать приложение
    console.error("Failed to log security event:", error);
  }
}

/**
 * Проверить подозрительность команды
 */
export function isSuspiciousCommand(command: string): boolean {
  const suspiciousPatterns = [
    /rm\s+-rf/,           // Опасные удаления
    /dd\s+if=/,           // dd команды
    /mkfs/,               // Форматирование
    /format/,             // Форматирование
    /fdisk/,              // Работа с разделами
    /chmod\s+777/,        // Изменение прав на все
    /chown\s+root/,       // Изменение владельца на root
    /sudo/,               // sudo команды
    /su\s+root/,          // Переключение на root
    /passwd/,             // Изменение паролей
    /shadow/,             // Доступ к shadow
    /etc\/passwd/,        // Доступ к passwd
    /\/etc\/shadow/,      // Доступ к shadow
    /crontab/,            // Изменение cron
    /systemctl/,          // Управление системой
    /service\s+/,         // Управление сервисами
    /killall/,            // Убийство процессов
    /kill\s+-9/,          // Жесткое убийство
    /shutdown/,           // Выключение
    /reboot/,             // Перезагрузка
    /init\s+0/,           // Выключение
    /init\s+6/,           // Перезагрузка
  ];

  const lowerCommand = command.toLowerCase();
  return suspiciousPatterns.some(pattern => pattern.test(lowerCommand));
}

/**
 * Проверить подозрительность пути к файлу
 */
export function isSuspiciousPath(path: string): boolean {
  const suspiciousPatterns = [
    /\.\./,               // Path traversal
    /\/etc\//,            // Системные файлы
    /\/proc\//,           // /proc
    /\/sys\//,            // /sys
    /\/dev\//,            // /dev
    /\/root\//,           // root директория
    /\/home\/[^/]+\/\.ssh/, // SSH ключи
    /\/var\/log/,         // Логи
    /\/var\/run/,         // PID файлы
    /\/tmp\/[^/]*\.sh$/,  // Shell скрипты в /tmp
    /\.\.\/\.\./,         // Двойной path traversal
  ];

  return suspiciousPatterns.some(pattern => pattern.test(path));
}

/**
 * Проверить опасные расширения файлов
 */
export function isDangerousFileExtension(filename: string): boolean {
  const dangerousExtensions = [
    '.php', '.phtml', '.php3', '.php4', '.php5', '.phps',
    '.sh', '.bash', '.zsh', '.fish',
    '.exe', '.bat', '.cmd', '.com', '.scr',
    '.py', '.pyc', '.pyo', '.pyd',
    '.pl', '.perl',
    '.rb', '.rbw',
    '.js', '.jsp', '.jspx',
    '.asp', '.aspx',
    '.cgi', '.pl',
    '.jar', '.war',
    '.dll', '.so', '.dylib',
  ];

  const lowerFilename = filename.toLowerCase();
  return dangerousExtensions.some(ext => lowerFilename.endsWith(ext));
}

