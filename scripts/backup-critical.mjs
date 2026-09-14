import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";

const destinationRoot = process.argv[2];
const databaseUrl = process.env.DATABASE_URL;
const workspace = process.cwd();
if (!destinationRoot || !path.isAbsolute(destinationRoot)) {
  throw new Error("Укажи абсолютный путь к защищённому каталогу резервных копий.");
}
const destination = path.resolve(destinationRoot);
if (destination === workspace || destination.startsWith(`${workspace}${path.sep}`)) {
  throw new Error("Резервную копию нельзя хранить внутри проекта.");
}
if (!databaseUrl?.startsWith("file:")) throw new Error("Поддерживается только текущая SQLite-конфигурация.");
if (process.env.STORAGE_DRIVER && process.env.STORAGE_DRIVER !== "local") {
  throw new Error("Для внешнего хранилища нужен отдельный backup-процесс.");
}

const rawDatabasePath = databaseUrl.slice(5);
const databasePath = path.resolve(rawDatabasePath);
await stat(databasePath);
const backupId = `toxichr-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
const backupDir = path.join(destination, backupId);
await mkdir(backupDir, { recursive: false, mode: 0o700 });

const database = new Database(databasePath, { readonly: true, fileMustExist: true });
try {
  await database.backup(path.join(backupDir, "database.sqlite"));
} finally {
  database.close();
}

const uploadsDir = path.join(workspace, ".data", "uploads");
const uploadNames = await readdir(uploadsDir).catch((error) => {
  if (error?.code === "ENOENT") return [];
  throw error;
});
const files = ["database.sqlite"];
if (uploadNames.length) await mkdir(path.join(backupDir, "uploads"), { mode: 0o700 });
for (const name of uploadNames) {
  const source = path.join(uploadsDir, name);
  if (!(await stat(source)).isFile()) throw new Error("Хранилище содержит не-файл; копия не завершена.");
  const relative = path.join("uploads", name);
  await copyFile(source, path.join(backupDir, relative));
  files.push(relative);
}

const checksums = {};
for (const relative of files) {
  checksums[relative.replaceAll(path.sep, "/")] = createHash("sha256")
    .update(await readFile(path.join(backupDir, relative))).digest("hex");
}
await writeFile(path.join(backupDir, "manifest.json"), JSON.stringify({
  version: 1,
  createdAt: new Date().toISOString(),
  files: checksums,
}, null, 2), { mode: 0o600 });
console.log(`Копия создана: ${backupDir}; файлов: ${files.length}. Храни её в шифрованном хранилище с ограниченным доступом.`);
