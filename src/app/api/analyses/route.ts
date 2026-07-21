import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { runAnalysisPipeline } from "@/lib/ai/pipeline";
import { AiConfigError } from "@/lib/ai/gateway";
import type { PersonaId } from "@/lib/personas";
import { prisma } from "@/lib/prisma";
import { trackServer } from "@/lib/analytics";
import { clientIp, rateLimit } from "@/lib/rate-limit";

type Body = {
  resumeId?: string;
  personaId?: PersonaId;
};

const PERSONA_CODES: PersonaId[] = ["tamara", "lera", "gleb", "vadik"];

export async function POST(request: Request) {
  const limited = rateLimit(`analysis:${clientIp(request)}`, 20, 60_000);
  if (!limited.ok) {
    return jsonError(
      `Слишком много запросов. Подожди ${limited.retryAfterSec}с.`,
      429,
    );
  }

  const body = await readJson<Body>(request);
  const resumeId = body?.resumeId;
  const personaId = body?.personaId;

  if (!resumeId || !personaId || !PERSONA_CODES.includes(personaId)) {
    return jsonError("Нужны resumeId и personaId.", 400);
  }

  const resume = await prisma.resume.findUnique({
    where: { id: resumeId },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });

  if (!resume?.sanitizedText || resume.deletedAt) {
    return jsonError("Резюме не найдено.", 404);
  }

  const version = resume.versions[0];
  if (!version) {
    return jsonError("Версия резюме не найдена.", 404);
  }

  let persona = await prisma.persona.findUnique({ where: { code: personaId } });
  if (!persona) {
    persona = await prisma.persona.create({
      data: {
        code: personaId,
        name: personaId,
        title: personaId,
      },
    });
  }

  const analysis = await prisma.analysis.create({
    data: {
      resumeVersionId: version.id,
      personaId: persona.id,
      status: "RUNNING",
    },
  });

  trackServer("analysis_started", { analysisId: analysis.id, personaId });

  try {
    const result = await runAnalysisPipeline({
      resumeText: resume.sanitizedText,
      personaId,
    });

    const updated = await prisma.analysis.update({
      where: { id: analysis.id },
      data: {
        status: "COMPLETED",
        modelProvider: result.provider,
        modelName: result.model,
        cost: result.costUsd,
        scorePayload: result.report.score,
        reportPayload: result.report,
      },
    });

    await prisma.candidateProfile.upsert({
      where: { resumeVersionId: version.id },
      create: {
        resumeVersionId: version.id,
        primaryRole: result.report.candidateProfile.primaryRole,
        professionalFamily: result.report.candidateProfile.professionalFamily,
        claimedLevel: result.report.candidateProfile.claimedLevel,
        inferredLevel: result.report.candidateProfile.inferredLevel,
        classificationConfidence: result.report.candidateProfile.confidence,
      },
      update: {
        primaryRole: result.report.candidateProfile.primaryRole,
        professionalFamily: result.report.candidateProfile.professionalFamily,
        claimedLevel: result.report.candidateProfile.claimedLevel,
        inferredLevel: result.report.candidateProfile.inferredLevel,
        classificationConfidence: result.report.candidateProfile.confidence,
      },
    });

    trackServer("analysis_completed", { analysisId: updated.id });

    return NextResponse.json({ analysisId: updated.id });
  } catch (error) {
    await prisma.analysis.update({
      where: { id: analysis.id },
      data: { status: "FAILED" },
    });
    console.error(error);

    if (error instanceof AiConfigError) {
      return jsonError(error.message, 503);
    }

    const message =
      error instanceof Error && error.message
        ? error.message
        : "Анализ не удался. Попробуй ещё раз.";
    return jsonError(message, 500);
  }
}
