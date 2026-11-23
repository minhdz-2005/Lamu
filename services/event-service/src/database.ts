import { PrismaClient } from "./generated/client";
import { PrismaPg } from "@prisma/adapter-pg";

export const DATABASE = Symbol("DATABASE");

export function createDatabase(url: string) {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: url,
      connectionTimeoutMillis: 2000,
      query_timeout: 3000,
    }),
  });
}

export type Database = ReturnType<typeof createDatabase>;
