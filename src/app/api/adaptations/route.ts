import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  buildAdaptationQuestions,
  buildAdaptedResume,
  type AdaptationAnswer,
} from "@/lib/adaptation";
import { trackServer } from "@/lib/analytics-server";
import { ImprovementAccessError, loadImprovementContext, loadOriginalResumeText } from "@/lib/improvement-server";
import {
  completePackageAction,
  getPackageSnapshot,
  PackageAccessError,
  releasePackageAction,
  reservePackageAction,
  TOXICHR_PACKAGE_PRICE_RUB,
} from "@/lib/package";
import { prisma } from "@/lib/prisma";
import type { VacancyReview } from "@/lib/vacancy";

const QuerySchema = z.object({ analysisId: z.string().min(1), vacancyId: z.string().min(1) });
const BodySchema = QuerySchema.extend({
  answers: z.array(z.object({ requirementId: z.string().min(1), answer: z.string().trim().max(1_500) })).max(5),
});

async function loadAdaptationContext(analysisId: string, vacancyId: string, userId?: string | null) {
  const analysis = await loadImprovementContext(analysisId, userId);
  const ownerId = userId ?? analysis.userId ?? null;
  const vacancy = await prisma.vacancy.findFirst({
    where: { id: vacancyId, OR: [{ userId: ownerId }, { userId: null }] },
  });
  if (!vacancy) throw new ImprovementAccessError("Вакансия не найдена или недоступна.", 404);
  const match = await prisma.vacancyMatch.findUnique({
    where: { vacancyId_analysisId: { vacancyId, analysisId } },
  });
  if (!match) throw new ImprovementAccessError("Сначала сопоставь это резюме с вакансией.", 409);
  const review = match.result as VacancyReview;
  if (!review.matchAssessment) throw new ImprovementAccessError("Для этой вакансии пока нет персонального сопоставления.", 409);
  const adaptation = await prisma.resumeAdaptation.findUnique({
    where: { vacancyId_analysisId: { vacancyId, analysisId } },
  });
  return { analysis, vacancy, match, adaptation, review, ownerId };
}

function responseError(error: unknown) {
  if (error instanceof PackageAccessError) {
    return NextResponse.json({
      error: error.message,
      paymentRequired: error.reason === "package_required",
      limitReached: error.reason === "limit_reached",
      priceRub: TOXICHR_PACKAGE_PRICE_RUB,
    }, { status: error.status });
  }
  if (error instanceof ImprovementAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(error);
  return NextResponse.json({ error: "Не удалось подготовить адаптацию." }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return NextResponse.json({ error: "Нужны резюме и вакансия." }, { status: 400 });
    const session = await auth();
    const context = await loadAdaptationContext(parsed.data.analysisId, parsed.data.vacancyId, session?.user?.id);
    const questions = buildAdaptationQuestions(context.review.vacancyAssessment, context.review.matchAssessment!);
    const adaptation = context.adaptation;
    return NextResponse.json({
      questions,
      adaptation: adaptation ? {
        id: adaptation.id,
        status: adaptation.status,
        answers: adaptation.answers,
        changes: adaptation.changes,
        adaptedText: adaptation.adaptedText,
        recheckAnalysisId: adaptation.recheckAnalysisId,
      } : null,
      package: await getPackageSnapshot(parsed.data.analysisId, session?.user?.id),
    });
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request: Request) {
  let reservationId: string | null = null;
  try {
    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Проверь ответы для адаптации." }, { status: 400 });
    const answers = parsed.data.answers.filter((item) => item.answer.length > 0);
    if (!answers.length) return NextResponse.json({ error: "Ответь хотя бы на один вопрос по вакансии." }, { status: 400 });

    const session = await auth();
    const context = await loadAdaptationContext(parsed.data.analysisId, parsed.data.vacancyId, session?.user?.id);
    const existing = context.adaptation;
    if (existing?.status === "ready" && existing.adaptedText) {
      return NextResponse.json({ ready: true, adaptationId: existing.id, adaptedText: existing.adaptedText, changes: existing.changes, recheckAnalysisId: existing.recheckAnalysisId, reused: true });
    }

    const reservation = await reservePackageAction({
      analysisId: parsed.data.analysisId,
      currentUserId: session?.user?.id,
      kind: "ADAPTATION",
      vacancyId: parsed.data.vacancyId,
    });
    reservationId = reservation.reservationId;
    if (reservation.reused) {
      const saved = await prisma.resumeAdaptation.findUnique({ where: { vacancyId_analysisId: { vacancyId: parsed.data.vacancyId, analysisId: parsed.data.analysisId } } });
      if (saved?.status === "ready" && saved.adaptedText) return NextResponse.json({ ready: true, adaptationId: saved.id, adaptedText: saved.adaptedText, changes: saved.changes, recheckAnalysisId: saved.recheckAnalysisId, reused: true });
      return NextResponse.json({ error: "Адаптация не найдена. Лимит не списан — открой это сопоставление ещё раз." }, { status: 409 });
    }

    const versionContent = context.analysis.resumeVersion.structuredContent as { text?: string } | null;
    const resumeText = versionContent?.text?.trim() || await loadOriginalResumeText(context.analysis.resumeVersion.resume);
    if (!resumeText.trim()) return NextResponse.json({ error: "Текст резюме недоступен." }, { status: 409 });
    const result = await buildAdaptedResume({
      resumeText,
      vacancy: context.review.vacancyAssessment,
      match: context.review.matchAssessment!,
      answers: answers as AdaptationAnswer[],
    });
    if (!result.changes.length) return NextResponse.json({ error: "Пока подтверждённых фактов недостаточно, чтобы безопасно адаптировать текст. Уточни личное действие или оставь строку без изменений." }, { status: 422 });

    const saved = await prisma.$transaction(async (tx) => {
      const latest = await tx.resumeVersion.aggregate({ where: { resumeId: context.analysis.resumeVersion.resumeId }, _max: { versionNumber: true } });
      const version = await tx.resumeVersion.create({
        data: {
          resumeId: context.analysis.resumeVersion.resumeId,
          parentVersionId: context.analysis.resumeVersionId,
          versionNumber: (latest._max.versionNumber ?? 1) + 1,
          source: "adaptation",
          structuredContent: { text: result.adaptedText, changes: result.changes, vacancyId: parsed.data.vacancyId } as Prisma.InputJsonValue,
        },
      });
      return tx.resumeAdaptation.upsert({
        where: { vacancyId_analysisId: { vacancyId: parsed.data.vacancyId, analysisId: parsed.data.analysisId } },
        create: {
          analysisId: parsed.data.analysisId,
          vacancyId: parsed.data.vacancyId,
          userId: context.ownerId,
          resumeVersionId: version.id,
          status: "ready",
          answers: answers as Prisma.InputJsonValue,
          changes: result.changes as Prisma.InputJsonValue,
          adaptedText: result.adaptedText,
        },
        update: {
          resumeVersionId: version.id,
          status: "ready",
          answers: answers as Prisma.InputJsonValue,
          changes: result.changes as Prisma.InputJsonValue,
          adaptedText: result.adaptedText,
        },
      });
    });
    await completePackageAction(reservationId);
    reservationId = null;
    await trackServer("adaptation_used", { analysisId: parsed.data.analysisId, vacancyId: parsed.data.vacancyId, changes: result.changes.length });
    return NextResponse.json({ ready: true, adaptationId: saved.id, adaptedText: saved.adaptedText, changes: saved.changes, package: await getPackageSnapshot(parsed.data.analysisId, session?.user?.id) });
  } catch (error) {
    await releasePackageAction(reservationId).catch(() => undefined);
    return responseError(error);
  }
}
