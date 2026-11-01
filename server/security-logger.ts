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
