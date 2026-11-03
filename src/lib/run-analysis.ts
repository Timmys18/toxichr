import type { Prisma } from "@prisma/client";
import { acquireLease } from "./analysis-lease";
import { aiCallContext } from "./ai/call-context";
import { validatePlan, resumeHash, type CoordinatedPlan } from "./ai/coordinated-plan";
import { aiMockEnabled, resolveProvider } from "./ai/gateway";
/**
 * Общий запуск анализа для sync-роута и SSE-стрима:
 * загрузка резюме → запись Analysis → пайплайн v3 → сохранение результата.
 */

import { runAnalysisPipeline, type PipelineEvent } from "@/lib/ai/pipeline";
import { ProfessionalAssessmentSchema, type ProfessionalAssessment } from "@/lib/ai/professional-assessment";
import type { PersonaId } from "@/lib/personas";
import { prisma } from "@/lib/prisma";
import { trackServer } from "@/lib/analytics-server";
import { hasPaidPackageForResume } from "@/lib/package";

export const PERSONA_CODES: PersonaId[] = ["tamara", "lera", "gleb", "vadik"];

export class AnalysisInputError extends Error {
  status: number;
  constructor(message: string, status = 400, public purchaseAnalysisId?: string) {
    super(message);
    this.name = "AnalysisInputError";
    this.status = status;
  }
}

const FREE_PERSONA_LIMIT = 2;

/**
 * Один исходный разбор и ровно один дополнительный голос входят в бесплатный
 * контур. Проверка находится рядом с созданием Analysis, а не в интерфейсе:
 * прямой POST или ссылка на /session не могут обойти лимит.
 */
async function createFreePersonaAnalysis(
  resumeVersionId: string,
  resumeId: string,
  personaId: string,
  userId: string | null,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.analysis.findMany({
      where: {
        resumeVersion: { resumeId },
        status: { in: ["RUNNING", "COMPLETED"] },
      },
      select: { id: true, personaId: true, status: true, reportPayload: true },
    });
    const validExisting = existing.filter((item) => {
      const report = item.reportPayload as { generationMeta?: { stages?: { name?: string }[] } } | null;
      return item.status === "RUNNING" || (Boolean(report) && !report?.generationMeta?.stages?.some(stage => /fallback/.test(stage.name ?? "")));
    });
    const usedPersonaIds = new Set(
      validExisting.map((item) => item.personaId).filter((value): value is string => Boolean(value)),
    );

    const packageOpen = await hasPaidPackageForResume(resumeId);
    if (!usedPersonaIds.has(personaId) && usedPersonaIds.size >= FREE_PERSONA_LIMIT && !packageOpen) {
      throw new AnalysisInputError(
        "Бесплатный лимит исчерпан: первый разбор и один дополнительный HR-взгляд уже доступны. Остальные голоса открывает пакет ToxicHR.",
        403,
        validExisting.find((item) => item.status === "COMPLETED")?.id,
      );
    }

    return tx.analysis.create({
      data: {
        resumeVersionId,
        personaId,
        userId,
        status: "RUNNING",
      },
    });
  });
}



export async function findReusableAnalysis(
  resumeId: string,
  personaId: PersonaId,
  currentUserId?: string | null,
): Promise<{ id: string; status: "RUNNING" | "COMPLETED" } | null> {
  const resume = await assertResumeAccess(resumeId, currentUserId);
  const latest = await prisma.resumeVersion.findFirst({ where: { resumeId: resume.id }, orderBy: { versionNumber: "desc" }, select: { id: true, structuredContent: true } });
  if (!latest) return null;
  const recent = await prisma.analysis.findMany({
    where: {
      status: { in: ["RUNNING", "COMPLETED"] },

      resumeVersionId: latest.id,
      persona: { code: personaId },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, status: true, reportPayload: true },
  });
  const currentResume = await prisma.resume.findUniqueOrThrow({ where: { id: resumeId }, select: { sanitizedText: true } });
  const content = latest.structuredContent as { text?: string } | null;
  const textHash = resumeHash(content?.text?.trim() || currentResume.sanitizedText || "");
  const activeLease = await prisma.analysisLease.findFirst({ where: { id: `resume:${latest.id}`, expiresAt: { gt: new Date() } } });
  const reusable = recent.find((item) => {
    if (item.status === "RUNNING") return Boolean(activeLease);
    const report = item.reportPayload as { sourceTextHash?: string; generationMeta?: { promptVersion?: string; stages?: Array<{ name?: string }> } } | null;
    return Boolean(report) && (aiMockEnabled() || resolveProvider() !== "openai" || (report?.generationMeta?.promptVersion?.includes("coordinated@2") && report.sourceTextHash === textHash)) && !report?.generationMeta?.stages?.some((stage) => stage.name === "professional-analyst-fallback");
  });
  return reusable ? { id: reusable.id, status: reusable.status as "RUNNING" | "COMPLETED" } : null;
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

async function createAndRunAnalysisLocked(
  resumeId: string,
  personaId: PersonaId,
  onEvent?: (event: PipelineEvent) => void,
  targetResumeVersionId?: string,
  currentUserId?: string | null,
  assertOwner: () => Promise<void> = async () => {},
  fence?: { id: string; owner: string },
): Promise<{ analysisId: string }> {
  await assertResumeAccess(resumeId, currentUserId);
  const resume = await prisma.resume.findUnique({
    where: { id: resumeId },
    include: {
      versions: targetResumeVersionId
        ? { where: { id: targetResumeVersionId }, take: 1 }
        : { orderBy: { versionNumber: "desc" }, take: 1 },
    },
  });

  if (!resume?.sanitizedText || resume.deletedAt) {
    throw new AnalysisInputError("Резюме не найдено.", 404);
  }
  const version = resume.versions[0];
  if (!version) {
    throw new AnalysisInputError("Версия резюме не найдена.", 404);
  }

  const verifyFence = async (tx: Prisma.TransactionClient) => {
    if (fence && !await tx.analysisLease.findFirst({ where: { ...fence, expiresAt: { gt: new Date() } } })) throw new Error("Блокировка утрачена до сохранения");
  };
  let persona = await prisma.persona.findUnique({ where: { code: personaId } });
  if (!persona) {
    persona = await prisma.persona.create({
      data: { code: personaId, name: personaId, title: personaId },
    });
  }

  const analysis = await createFreePersonaAnalysis(version.id, resumeId, persona.id, resume.userId ?? currentUserId ?? null);

  await trackServer("analysis_started", { analysisId: analysis.id, personaId });

  try {
    const versionContent = version.structuredContent as { text?: string } | null;
    const resumeText = versionContent?.text?.trim() || resume.sanitizedText;
    const freshVersion = await prisma.resumeVersion.findUniqueOrThrow({ where: { id: version.id } });
    const stored = freshVersion.structuredContent as { coordinatedPlan?: unknown; sharedFacts?: { textHash: string; facts: CoordinatedPlan["facts"] } } | null;
    let coordinatedPlan: CoordinatedPlan | undefined;
    if (stored?.coordinatedPlan) {
      try { coordinatedPlan = validatePlan(stored.coordinatedPlan, resumeText); } catch { /* changed text needs a fresh foundation */ }
    }
    const previous = await prisma.analysis.findMany({
      where: { resumeVersionId: version.id, status: "COMPLETED", reportPayload: { not: undefined } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { reportPayload: true },
    });
    const previousReport = previous.map((item) => item.reportPayload as {
      professionalAssessment?: unknown;
      generationMeta?: { promptVersion?: string; stages?: Array<{ name?: string }> };
    } | null).find((report) => report?.generationMeta?.stages?.some((stage) =>
      stage.name === "professional-analyst" || stage.name === "professional-analyst-reused",
    ));
    const reused = ProfessionalAssessmentSchema.safeParse(previousReport?.professionalAssessment);
    const result = await aiCallContext.run({
      assertOwner,
      started: async request => {
        const call = await prisma.aiCall.create({ data: { analysisId: analysis.id, stage: request.stage, model: request.model ?? "default", provider: resolveProvider() } });
        await prisma.analysis.update({ where: { id: analysis.id }, data: { accountingIncomplete: true } });
        return call.id;
      },
      finished: async (id, elapsedMs, response) => {
        const known = response && response.usageKnown !== false;
        await prisma.aiCall.update({ where: { id }, data: { elapsedMs, status: response ? "COMPLETED" : "ERROR", tokensIn: known ? response.tokensIn : null, tokensOut: known ? response.tokensOut : null, costAmount: known ? (response.cost?.amount ?? response.costUsd) : null, currency: response?.cost?.currency ?? (response ? "USD" : undefined), usage: response?.rawUsage ? JSON.parse(JSON.stringify(response.rawUsage)) : undefined, requestId: response?.requestId } });
        const calls = await prisma.aiCall.findMany({ where: { analysisId: analysis.id } });
        const currency = calls.find(c => c.currency)?.currency;
        if (currency && calls.every(c => !c.currency || c.currency === currency)) await prisma.analysis.update({ where: { id: analysis.id }, data: { accountingIncomplete: calls.some(c => c.status !== "COMPLETED" || c.costAmount === null), costAmount: calls.reduce((n,c) => n+(c.costAmount ?? 0),0), costCurrency: currency, tokensIn: calls.reduce((n,c) => n+(c.tokensIn ?? 0),0), tokensOut: calls.reduce((n,c) => n+(c.tokensOut ?? 0),0) } });
      },
    }, () => runAnalysisPipeline({
      resumeText,
      personaId,
      professionalAssessment: reused.success ? reused.data as ProfessionalAssessment : undefined,
      sharedFacts: stored?.sharedFacts?.textHash === resumeHash(resumeText) ? stored.sharedFacts.facts : undefined,
      onPlanInvalid: async () => {
        await assertOwner();
        await prisma.$transaction(async tx => {
          await verifyFence(tx);
          const current = await tx.resumeVersion.findUniqueOrThrow({ where: { id: version.id } });
          const content = current.structuredContent as Record<string, unknown> | null;
          if (content?.redacted) return;
          const next = { ...content }; delete next.coordinatedPlan;
          await tx.resumeVersion.update({ where: { id: version.id }, data: { structuredContent: JSON.parse(JSON.stringify(next)) } });
        });
      },
      onFacts: async facts => {
        await assertOwner();
        await prisma.$transaction(async tx => {
          await verifyFence(tx);
          const current = await tx.resumeVersion.findUniqueOrThrow({ where: { id: version.id }, include: { resume: true } });
          const content = current.structuredContent as Record<string, unknown> | null;
          if (current.resume.deletedAt || content?.redacted) throw new AnalysisInputError("Резюме удалено", 404);
          await tx.resumeVersion.update({ where: { id: version.id }, data: { structuredContent: JSON.parse(JSON.stringify({ ...content, sharedFacts: { textHash: resumeHash(resumeText), facts } })) } });
        });
      },
      coordinatedPlan,
      onPlan: async plan => {
        await assertOwner();
        await prisma.$transaction(async tx => {
          await verifyFence(tx);
          const current = await tx.resumeVersion.findUniqueOrThrow({ where: { id: version.id }, include: { resume: true } });
          const content = current.structuredContent as Record<string, unknown> | null;
          if (current.resume.deletedAt || content?.redacted) throw new AnalysisInputError("Резюме удалено", 404);
          await tx.resumeVersion.update({ where: { id: version.id }, data: { structuredContent: JSON.parse(JSON.stringify({ ...content, coordinatedPlan: plan })) } });
        });
      },
      onEvent,
    }));

    await assertOwner();
    await prisma.$transaction(async tx => {
          await verifyFence(tx);
      const current = await tx.resume.findUnique({ where: { id: resumeId }, select: { deletedAt: true } });
      if (!current || current.deletedAt) throw new AnalysisInputError("Резюме удалено", 404);
    await tx.analysis.update({
      where: { id: analysis.id },
      data: {
        status: "COMPLETED",
        modelProvider: result.provider,
        modelName: result.model,
        scorePayload: result.report.score,
        reportPayload: result.report,
      },
    });

    await tx.candidateProfile.upsert({
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

    });

    await trackServer("analysis_completed", {
      analysisId: analysis.id,
      costAmount: result.cost?.amount ?? result.costUsd,
      costCurrency: result.cost?.currency ?? "USD",
      costUsd: result.costUsd,
    });
    return { analysisId: analysis.id };
  } catch (error) {
    await prisma.analysis.update({
      where: { id: analysis.id },
      data: { status: "FAILED" },
    });
    throw error;
  }
}

export async function assertResumeAccess(resumeId: string, currentUserId?: string | null) {
  const resume = await prisma.resume.findUnique({ where: { id: resumeId }, select: { id: true, userId: true, deletedAt: true } });
  if (!resume || resume.deletedAt) throw new AnalysisInputError("Резюме не найдено.", 404);
  if (resume.userId && resume.userId !== currentUserId) throw new AnalysisInputError("Нет доступа.", 403);
  return resume;
}

/** Serializes all personas of one version across processes; completed answers are immutable. */
export async function createAndRunAnalysis(
  resumeId: string, personaId: PersonaId, onEvent?: (event: PipelineEvent) => void,
  targetResumeVersionId?: string, currentUserId?: string | null,
): Promise<{ analysisId: string }> {
  await assertResumeAccess(resumeId, currentUserId);
  const version = await prisma.resumeVersion.findFirst({ where: { resumeId, ...(targetResumeVersionId ? { id: targetResumeVersionId } : {}) }, orderBy: { versionNumber: "desc" } });
  if (!version) throw new AnalysisInputError("Версия резюме не найдена", 404);
  const cachedAnswer = async () => {
    const candidates = await prisma.analysis.findMany({ where: { resumeVersionId: version.id, persona: { code: personaId }, status: "COMPLETED" }, orderBy: { createdAt: "desc" }, select: { id: true, reportPayload: true } });
    const current = await prisma.resume.findUniqueOrThrow({ where: { id: resumeId } });
    const content = version.structuredContent as { text?: string } | null;
    const textHash = resumeHash(content?.text?.trim() || current.sanitizedText || "");
    const cached = candidates.find(c => {
      const r = c.reportPayload as { sourceTextHash?: string; generationMeta?: { promptVersion?: string; voice?: { status?: string }, stages?: { name?: string }[] } } | null;
      return r && (!(!aiMockEnabled() && resolveProvider() === "openai") || (r.generationMeta?.promptVersion?.includes("coordinated@2") && r.sourceTextHash === textHash)) && !r.generationMeta?.stages?.some(s => /fallback/.test(s.name ?? ""));
    });
    return cached ? { analysisId: cached.id } : null;
  };
  const ready = await cachedAnswer();
  if (ready) return ready;
  const deadline = Date.now() + 210000;
  let lease: Awaited<ReturnType<typeof acquireLease>> = null;
  while (!lease && Date.now() < deadline) {
    lease = await acquireLease(`resume:${version.id}`);
    if (!lease) { const ready = await cachedAnswer(); if (ready) return ready; await new Promise(resolve => setTimeout(resolve,250)); }
  }
  if (!lease) throw new AnalysisInputError("Разбор ещё занят. Повторите открытие позднее.",409);
  try {
    await assertResumeAccess(resumeId,currentUserId);
    const ready = await cachedAnswer(); if (ready) return ready;
    await lease.assertOwner();
    await prisma.analysis.updateMany({ where: { resumeVersionId: version.id, status: "RUNNING" }, data: { status: "FAILED" } });
    return await createAndRunAnalysisLocked(resumeId, personaId, onEvent, version.id, currentUserId, lease.assertOwner, { id: `resume:${version.id}`, owner: lease.owner });
  } finally { await lease.release(); }
}
