import { extractTextFromBuffer } from "@/lib/documents/extract-text";
import { prisma } from "@/lib/prisma";
import { readUpload } from "@/lib/storage";

export class ImprovementAccessError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function loadImprovementContext(
  analysisId: string,
  currentUserId?: string | null,
) {
  const analysis = await prisma.analysis.findUnique({
    where: { id: analysisId },
    include: {
      persona: true,
      resumeVersion: { include: { resume: true } },
      improvements: true,
    },
  });

  if (!analysis || analysis.status !== "COMPLETED" || !analysis.reportPayload) {
    throw new ImprovementAccessError("Разбор не найден.", 404);
  }
  if (analysis.userId && analysis.userId !== currentUserId) {
    throw new ImprovementAccessError("Нет доступа.", 403);
  }

  return analysis;
}

export async function loadOriginalResumeText(
  resume: {
    privateStorageKey: string | null;
    sanitizedText: string | null;
    mimeType: string | null;
    originalFilename: string | null;
  },
) {
  if (resume.privateStorageKey) {
    try {
      const buffer = await readUpload(resume.privateStorageKey);
      const extracted = await extractTextFromBuffer(
        buffer,
        resume.mimeType ?? "application/octet-stream",
        resume.originalFilename ?? "resume",
      );
      if (extracted.text.trim()) return extracted.text.trim();
    } catch {
      // The sanitized text remains a safe fallback if the original file moved.
    }
  }

  return resume.sanitizedText ?? "";
}
