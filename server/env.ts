import { existsSync } from "fs";

if (existsSync(".env")) {
  try {
    process.loadEnvFile(".env");
  } catch (error) {
    console.warn("Failed to load .env:", (error as Error).message);
  }
}
