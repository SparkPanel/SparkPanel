import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    csrfToken?: string;
    require2FA?: boolean;
    /** Секрет TOTP, выданный при настройке 2FA и ещё не подтверждённый кодом из приложения. */
    pendingTotpSecret?: string;
  }
}

