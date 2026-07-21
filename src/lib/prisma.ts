import { mkdirSync } from "node:fs";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function resolveSqlitePath(databaseUrl: string): string {
  const raw = databaseUrl.replace(/^file:/, "");
  if (path.isAbsolute(raw)) return raw;
  // Keep DB under .data only — avoid tracing whole project cwd for NFT
  return path.join(/* turbopackIgnore: true */ process.cwd(), raw);
}

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  if (!databaseUrl.startsWith("file:")) {
    throw new Error(
      "ToxicHR local MVP uses SQLite. Set DATABASE_URL=file:./.data/toxichr.db",
    );
  }

  const dbPath = resolveSqlitePath(databaseUrl);
  mkdirSync(path.dirname(dbPath), { recursive: true });

  const adapter = new PrismaBetterSqlite3({ url: dbPath });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
