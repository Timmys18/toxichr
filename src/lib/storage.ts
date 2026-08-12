import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const UPLOAD_DIR = path.join(process.cwd(), ".data", "uploads");

export async function saveUpload(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const key = `${randomUUID()}-${filename.replace(/[^\w.-]+/g, "_")}`;
  const fullPath = path.join(UPLOAD_DIR, key);
  await writeFile(fullPath, buffer);
  return key;
}

export async function readUpload(key: string): Promise<Buffer> {
  const safeKey = path.basename(key);
  if (safeKey !== key) throw new Error("Invalid storage key");
  return readFile(path.join(UPLOAD_DIR, safeKey));
}
