import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const repo = process.cwd();

test("backup verification accepts a clean copy and rejects a changed database", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "toxichr-backup-test-"));
  try {
    const source = path.join(root, "source");
    const destination = path.join(root, "backups");
    await mkdir(source);
    await mkdir(destination);
    const databasePath = path.join(source, "synthetic.sqlite");
    const database = new Database(databasePath);
    database.exec("CREATE TABLE User(id TEXT); CREATE TABLE Resume(id TEXT);");
    database.close();

    execFileSync(process.execPath, [path.join(repo, "scripts/backup-critical.mjs"), destination], {
      cwd: source,
      env: { ...process.env, DATABASE_URL: `file:${databasePath}` },
    });
    const [name] = await readdir(destination);
    const backup = path.join(destination, name);
    const verify = () => execFileSync(process.execPath, [path.join(repo, "scripts/verify-backup.mjs"), backup], { encoding: "utf8" });
    assert.match(verify(), /Копия проверена/);

    const copiedDatabase = path.join(backup, "database.sqlite");
    await writeFile(copiedDatabase, Buffer.concat([await readFile(copiedDatabase), Buffer.from("tampered")]));
    assert.throws(verify, /Контрольная сумма не совпадает/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
