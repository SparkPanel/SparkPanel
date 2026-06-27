import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    csrfToken?: string;
    require2FA?: boolean;
  }
}

