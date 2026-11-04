import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";

const backupDir = process.argv[2];
if (!backupDir || !path.isAbsolute(backupDir)) {
  throw new Error("Укажи абсолютный путь к каталогу конкретной резервной копии.");
}

const root = path.resolve(backupDir);
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
if (manifest.version !== 1 || !manifest.files || typeof manifest.files !== "object" || Array.isArray(manifest.files)) {
  throw new Error("Формат резервной копии не поддерживается.");
}
if (!Object.hasOwn(manifest.files, "database.sqlite")) {
  throw new Error("В копии нет базы данных.");
}

for (const [name, expected] of Object.entries(manifest.files)) {
  if (name !== "database.sqlite" && !/^uploads\/[a-zA-Z0-9._-]+$/.test(name)) {
    throw new Error("Недопустимый путь в манифесте копии.");
  }
  if (typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected)) {
    throw new Error("Некорректная контрольная сумма в манифесте.");
  }
  const fullPath = path.join(root, name);
  if (!(await stat(fullPath)).isFile()) throw new Error(`В копии отсутствует файл: ${name}`);
  const actual = createHash("sha256").update(await readFile(fullPath)).digest("hex");
  if (actual !== expected) throw new Error(`Контрольная сумма не совпадает: ${name}`);
}

const database = new Database(path.join(root, "database.sqlite"), { readonly: true, fileMustExist: true });
try {
  const integrity = database.pragma("integrity_check", { simple: true });
  if (integrity !== "ok") throw new Error("SQLite сообщает о повреждении резервной копии.");
  database.prepare("SELECT 1 FROM User LIMIT 1").get();
  database.prepare("SELECT 1 FROM Resume LIMIT 1").get();
} finally {
  database.close();
}

console.log(`Копия проверена: ${root}; файлов: ${Object.keys(manifest.files).length}. Это не заменяет пробное восстановление на отдельном узле.`);
