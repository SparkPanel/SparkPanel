import { storage } from "./storage";

export interface SecurityEvent {
  type: "csrf_attack" | "brute_force" | "unauthorized_access" | "suspicious_command" | "path_traversal" | "xss_attempt";
  ip: string;
  userId?: string;
  details: string;
  timestamp: Date;
}


export async function logSecurityEvent(event: SecurityEvent): Promise<void> {
  try {
    
    await storage.addActivity({
      type: "security_event",
      title: `Security Event: ${event.type}`,
      description: `${event.details} from IP: ${event.ip}`,
      timestamp: event.timestamp,
      userId: event.userId,
    });

    
    console.warn(`[SECURITY] ${event.type} - IP: ${event.ip}${event.userId ? ` User: ${event.userId}` : ""} - ${event.details}`);
  } catch (error) {
    
    console.error("Failed to log security event:", error);
  }
}

export function isSuspiciousCommand(command: string): boolean {
  const suspiciousPatterns = [
    /rm\s+-rf/,
    /dd\s+if=/,
    /mkfs/,
    /format/,
    /fdisk/,
    /chmod\s+777/,
    /chown\s+root/,
    /sudo/,
    /su\s+root/,
    /passwd/,
    /shadow/,
    /etc\/passwd/,
    /\/etc\/shadow/,
    /crontab/,
    /systemctl/,
    /service\s+/,
    /killall/,
    /kill\s+-9/,
    /shutdown/,
    /reboot/,
    /init\s+0/,
    /init\s+6/,
  ];

  const lowerCommand = command.toLowerCase();
  return suspiciousPatterns.some(pattern => pattern.test(lowerCommand));
}


export function isSuspiciousPath(path: string): boolean {
  const suspiciousPatterns = [
    /\.\./,
    /\/etc\//,
    /\/proc\//,
    /\/sys\//,
    /\/dev\//,
    /\/root\//,
    /\/home\/[^/]+\/\.ssh/,
    /\/var\/log/,
    /\/var\/run/,
    /\/tmp\/[^/]*\.sh$/,
    /\.\.\/\.\./,
  ];

  return suspiciousPatterns.some(pattern => pattern.test(path));
}


export function isDangerousFileExtension(filename: string): boolean {
  const dangerousExtensions = [
    '.php', '.phtml', '.php3', '.php4', '.php5', '.phps',
    '.asp', '.aspx',
    '.jsp', '.jspx',
    '.exe', '.bat', '.cmd', '.com', '.scr',
    '.cgi',
  ];

  const lowerFilename = filename.toLowerCase();
  return dangerousExtensions.some(ext => lowerFilename.endsWith(ext));
}

