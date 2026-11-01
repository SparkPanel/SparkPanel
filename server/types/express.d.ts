import "express";
import type { User } from "@shared/schema";

declare global {
  namespace Express {
    interface Request {
      currentUser?: User;
      /** Запрос аутентифицирован API-ключом (без cookie-сессии и CSRF). */
      apiKeyId?: string;
      /** Исходные байты JSON-тела — для проверки подписи вебхуков. */
      rawBody?: Buffer;
    }
  }
}
