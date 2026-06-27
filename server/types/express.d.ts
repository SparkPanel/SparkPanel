import "express";
import type { User } from "@shared/schema";

declare global {
  namespace Express {
    interface Request {
      currentUser?: User;
    }
  }
}

