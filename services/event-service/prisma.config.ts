import { defineConfig } from "prisma/config";

// DATABASE_URL is only needed for migrate commands; generate runs without a database.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url:
      process.env.DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
  },
});
