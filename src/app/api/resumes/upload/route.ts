import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { extractTextFromBuffer } from "@/lib/documents/extract-text";
import { redactPii } from "@/lib/documents/redact-pii";
import { prisma } from "@/lib/prisma";
import { saveUpload } from "@/lib/storage";
import { trackServer } from "@/lib/analytics-server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const limited = rateLimit(`upload:${clientIp(request)}`, 30, 60_000);
  if (!limited.ok) {
    return jsonError(
      `Слишком много загрузок. Подожди ${limited.retryAfterSec}с.`,
      429,
    );
  }

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return jsonError("Файл не найден.", 400);
  }

  if (file.size > MAX_BYTES) {
    return jsonError("Файл больше 8 МБ.", 400);
  }
  const supported =
    file.type === "application/pdf" ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    /\.(pdf|docx)$/i.test(file.name);
  if (!supported) {
    return jsonError("Поддерживаются только PDF и DOCX.", 415);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let extracted;
  try {
    extracted = await extractTextFromBuffer(
      buffer,
      file.type,
      file.name,
    );
  } catch {
    await trackServer("resume_parse_failed", {
      reason: "unsupported_or_corrupt",
    });
    return jsonError(
      "Ваше резюме технически победило искусственный интеллект. Попробуй другой файл или вставь текст.",
      422,
    );
  }

  if (extracted.text.trim().length < 80) {
    return jsonError(
      "Резюме настолько краткое, что разбирать пока нечего.",
      422,
    );
  }

  const storageKey = await saveUpload(buffer, file.name);
  const { sanitizedText } = redactPii(extracted.text);

  const resume = await prisma.resume.create({
    data: {
      originalFilename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      privateStorageKey: storageKey,
      sanitizedText,
      status: "READY",
      pageCount: extracted.pageCount,
      versions: {
        create: {
          versionNumber: 1,
          source: "upload",
          structuredContent: { filename: file.name },
        },
      },
    },
    include: { versions: true },
  });

  await trackServer("resume_uploaded", {
    resumeId: resume.id,
    mime: file.type || "unknown",
  });

  return NextResponse.json({
    resumeId: resume.id,
    versionId: resume.versions[0]?.id,
  });
}
