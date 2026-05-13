import { defineConfig } from "drizzle-kit";


if (!process.env.DATABASE_URL) {
  console.warn("Warning: DATABASE_URL is not set. Database migrations will be skipped.");
  console.warn("The application will use in-memory storage (MemStorage) by default.");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    
    url: process.env.DATABASE_URL || "postgresql://dummy:dummy@localhost:5432/dummy",
  },
});
