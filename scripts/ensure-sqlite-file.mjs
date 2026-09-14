import "dotenv/config";
import { mkdir, open } from "node:fs/promises";
import path from "node:path";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.startsWith("file:") || databaseUrl.length <= 5) {
  throw new Error("DATABASE_URL должен указывать на SQLite-файл.");
}

const databasePath = path.resolve(databaseUrl.slice(5));
await mkdir(path.dirname(databasePath), { recursive: true });
const file = await open(databasePath, "a");
await file.close();
