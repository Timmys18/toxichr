import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { redactPii } from "@/lib/documents/redact-pii";
import { prisma } from "@/lib/prisma";
import { trackServer } from "@/lib/analytics-server";

type Body = { text?: string };

export async function POST(request: Request) {
  const body = await readJson<Body>(request);
  const raw = body?.text?.trim();

  if (!raw || raw.length < 80) {
    return jsonError("Слишком коротко — разбирать пока нечего.", 400);
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
