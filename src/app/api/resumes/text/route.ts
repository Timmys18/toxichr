import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { redactPii } from "@/lib/documents/redact-pii";
import { prisma } from "@/lib/prisma";
import { trackServer } from "@/lib/analytics-server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

type Body = { text?: string };
const MAX_TEXT_LENGTH = 60_000;

export async function POST(request: Request) {
  const limited = rateLimit(`resume-text:${clientIp(request)}`, 20, 60_000);
  if (!limited.ok) {
    return jsonError("Слишком много загрузок. Подожди минуту.", 429);
  }

  const body = await readJson<Body>(request);
  const raw = body?.text?.trim();

  if (!raw || raw.length < 80) {
    return jsonError("Слишком коротко — разбирать пока нечего.", 400);
  }
  if (raw.length > MAX_TEXT_LENGTH) {
    return jsonError("Текст длиннее 60 000 знаков. Оставь только резюме.", 413);
  }

  const { sanitizedText } = redactPii(raw);

  const resume = await prisma.resume.create({
    data: {
      originalFilename: "pasted.txt",
      mimeType: "text/plain",
      size: Buffer.byteLength(sanitizedText, "utf8"),
      sanitizedText,
      status: "READY",
      pageCount: Math.max(1, Math.ceil(sanitizedText.length / 2800)),
      versions: {
        create: {
          versionNumber: 1,
          source: "paste",
          structuredContent: { rawLength: sanitizedText.length },
        },
      },
    },
    include: { versions: true },
  });

  await trackServer("resume_uploaded", {
    resumeId: resume.id,
    mime: "text/plain",
  });

  return NextResponse.json({
    resumeId: resume.id,
    versionId: resume.versions[0]?.id,
  });
}
