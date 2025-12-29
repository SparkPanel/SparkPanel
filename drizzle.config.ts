import { defineConfig } from "drizzle-kit";

// DATABASE_URL is optional - app uses in-memory storage by default
// This config is only used when running db:push command
if (!process.env.DATABASE_URL) {
  console.warn("Warning: DATABASE_URL is not set. Database migrations will be skipped.");
  console.warn("The application will use in-memory storage (MemStorage) by default.");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    // Use dummy URL if DATABASE_URL is not set (migrations won't work, but app will run)
    url: process.env.DATABASE_URL || "postgresql://dummy:dummy@localhost:5432/dummy",
  },
});
