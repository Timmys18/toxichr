/**
 * Общий запуск анализа для sync-роута и SSE-стрима:
 * загрузка резюме → запись Analysis → пайплайн v3 → сохранение результата.
 */

import { runAnalysisPipeline, type PipelineEvent } from "@/lib/ai/pipeline";
import { ProfessionalAssessmentSchema, type ProfessionalAssessment } from "@/lib/ai/professional-assessment";
import type { PersonaId } from "@/lib/personas";
import { prisma } from "@/lib/prisma";
import { trackServer } from "@/lib/analytics-server";

export const PERSONA_CODES: PersonaId[] = ["tamara", "lera", "gleb", "vadik"];

export class AnalysisInputError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "AnalysisInputError";
    this.status = status;
  }
}

const REUSABLE_ANALYSIS_WINDOW_MS = 15 * 60 * 1000;

export async function findReusableAnalysis(
  resumeId: string,
  personaId: PersonaId,
): Promise<{ id: string; status: "RUNNING" | "COMPLETED" } | null> {
  return prisma.analysis.findFirst({
    where: {
      status: { in: ["RUNNING", "COMPLETED"] },
      createdAt: {
        gte: new Date(Date.now() - REUSABLE_ANALYSIS_WINDOW_MS),
      },
      resumeVersion: { resumeId },
      persona: { code: personaId },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true },
  }) as Promise<{ id: string; status: "RUNNING" | "COMPLETED" } | null>;
}

export async function waitForAnalysis(
  analysisId: string,
  timeoutMs = 75_000,
): Promise<"COMPLETED" | "FAILED" | "TIMEOUT"> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
      select: { status: true },
    });
    if (analysis?.status === "COMPLETED") return "COMPLETED";
    if (!analysis || analysis.status === "FAILED") return "FAILED";
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return "TIMEOUT";
}

export async function createAndRunAnalysis(
  resumeId: string,
  personaId: PersonaId,
  onEvent?: (event: PipelineEvent) => void,
): Promise<{ analysisId: string }> {
  const resume = await prisma.resume.findUnique({
    where: { id: resumeId },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });

  if (!resume?.sanitizedText || resume.deletedAt) {
    throw new AnalysisInputError("Резюме не найдено.", 404);
  }
  const version = resume.versions[0];
  if (!version) {
    throw new AnalysisInputError("Версия резюме не найдена.", 404);
  }

  let persona = await prisma.persona.findUnique({ where: { code: personaId } });
  if (!persona) {
    persona = await prisma.persona.create({
      data: { code: personaId, name: personaId, title: personaId },
    });
  }

  const analysis = await prisma.analysis.create({
    data: {
      resumeVersionId: version.id,
      personaId: persona.id,
      status: "RUNNING",
    },
  });

  await trackServer("analysis_started", { analysisId: analysis.id, personaId });

  try {
    const versionContent = version.structuredContent as { text?: string } | null;
    const resumeText = versionContent?.text?.trim() || resume.sanitizedText;
    const previous = await prisma.analysis.findFirst({
      where: { resumeVersionId: version.id, status: "COMPLETED", reportPayload: { not: undefined } },
      orderBy: { createdAt: "desc" },
      select: { reportPayload: true },
    });
    const previousReport = previous?.reportPayload as { professionalAssessment?: unknown } | null;
    const reused = ProfessionalAssessmentSchema.safeParse(previousReport?.professionalAssessment);
    const result = await runAnalysisPipeline({
      resumeText,
      personaId,
      professionalAssessment: reused.success ? reused.data as ProfessionalAssessment : undefined,
      onEvent,
    });

    await prisma.analysis.update({
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

    await trackServer("analysis_completed", { analysisId: analysis.id });
    return { analysisId: analysis.id };
  } catch (error) {
    await prisma.analysis.update({
      where: { id: analysis.id },
      data: { status: "FAILED" },
    });
    throw error;
  }
}
