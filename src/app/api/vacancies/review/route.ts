import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ProfessionalAssessmentSchema } from "@/lib/ai/professional-assessment";
import { trackServer } from "@/lib/analytics-server";
import { auth } from "@/lib/auth";
import {
  ImprovementAccessError,
  loadImprovementContext,
} from "@/lib/improvement-server";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  hasProductAccess,
  PAID_ACTION_PRICE_RUB,
  vacancyMatchProductCode,
} from "@/lib/payments";
import {
  reviewVacancy,
  VACANCY_ASSESSMENT_VERSION,
  type VacancyReview,
} from "@/lib/vacancy";
import type { PersonaId } from "@/lib/personas";

const BodySchema = z.object({
  text: z.string().trim().min(80).max(30_000),
  analysisId: z.string().min(1).optional(),
  vacancyId: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const limited = rateLimit(`vacancy:${clientIp(request)}`, 20, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "Слишком много запросов." }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Вставь полный текст вакансии." },
      { status: 400 },
    );
  }

  const session = await auth();
  try {
    const analysis = parsed.data.analysisId
      ? await loadImprovementContext(
          parsed.data.analysisId,
          session?.user?.id,
        )
      : null;
    const professionalAssessment = analysis
      ? ProfessionalAssessmentSchema.safeParse(
          (analysis.reportPayload as { professionalAssessment?: unknown })
            ?.professionalAssessment,
        )
      : null;
    if (analysis && !professionalAssessment?.success) {
      return NextResponse.json(
        { error: "В этом разборе нет структурированной профессиональной оценки. Откройте новый разбор резюме и попробуйте снова." },
        { status: 409 },
      );
    }

    const ownerId = session?.user?.id ?? analysis?.userId ?? null;
    const existingVacancy = parsed.data.vacancyId
      ? await prisma.vacancy.findFirst({
          where: {
            id: parsed.data.vacancyId,
            OR: [{ userId: ownerId }, { userId: null }],
          },
        })
      : null;
    if (parsed.data.vacancyId && !existingVacancy) {
      return NextResponse.json({ error: "Вакансия не найдена." }, { status: 404 });
    }

    const sourceChanged = Boolean(
      existingVacancy && existingVacancy.sourceText !== parsed.data.text,
    );

    // Сначала сохраняем текст вакансии: это бесплатно и позволяет вернуться к
    // нему после оплаты. Сам Match Analyst до оплаты не запускается.
    const vacancy = existingVacancy
      ? await prisma.vacancy.update({
          where: { id: existingVacancy.id },
          data: { userId: ownerId, sourceText: parsed.data.text },
        })
      : await prisma.vacancy.create({
          data: { userId: ownerId, sourceText: parsed.data.text },
        });

    if (analysis) {
      const productCode = vacancyMatchProductCode(vacancy.id);
      if (!(await hasProductAccess(analysis.id, productCode))) {
        return NextResponse.json(
          {
            error: `Сопоставление резюме с этой вакансией стоит ${PAID_ACTION_PRICE_RUB} ₽.`,
            paymentRequired: true,
            product: "vacancy_match",
            vacancyId: vacancy.id,
            priceRub: PAID_ACTION_PRICE_RUB,
          },
          { status: 402 },
        );
      }
    }

    const cached = analysis
      ? await prisma.vacancyMatch.findUnique({
          where: { vacancyId_analysisId: { vacancyId: vacancy.id, analysisId: analysis.id } },
          select: { result: true },
        })
      : null;
    const cachedReview = cached?.result as VacancyReview | undefined;
    if (
      !sourceChanged &&
      cachedReview?.schemaVersion === VACANCY_ASSESSMENT_VERSION
    ) {
      return NextResponse.json({ vacancyId: vacancy.id, matched: true, cached: true, result: cachedReview });
    }

    // Match Analyst получает только сохранённую профессиональную оценку и её
    // дословные цитаты. Полный текст резюме и полный AnalysisReport сюда не идут.
    const result = await reviewVacancy({
      vacancyText: parsed.data.text,
      professionalAssessment: professionalAssessment?.data,
      personaId: (analysis?.persona?.code as PersonaId | undefined) ?? "lera",
    });

    await prisma.vacancy.update({
      where: { id: vacancy.id },
      data: {
        title: result.vacancyAssessment.title,
        review: result as Prisma.InputJsonValue,
      },
    });

    if (analysis) {
      await prisma.vacancyMatch.upsert({
        where: {
          vacancyId_analysisId: {
            vacancyId: vacancy.id,
            analysisId: analysis.id,
          },
        },
        create: {
          vacancyId: vacancy.id,
          analysisId: analysis.id,
          userId: ownerId,
          result: result as Prisma.InputJsonValue,
          tailoredIntro: null,
          coverLetter: null,
          interviewQuestions: (result.matchAssessment?.candidateQuestions ?? []) as Prisma.InputJsonValue,
        },
        update: {
          userId: ownerId,
          result: result as Prisma.InputJsonValue,
          tailoredIntro: null,
          coverLetter: null,
          interviewQuestions: (result.matchAssessment?.candidateQuestions ?? []) as Prisma.InputJsonValue,
        },
      });
    }

    await trackServer("vacancy_review_completed", {
      vacancyId: vacancy.id,
      analysisId: analysis?.id,
      userId: session?.user?.id,
    });

    return NextResponse.json({
      vacancyId: vacancy.id,
      matched: Boolean(analysis),
      result,
    });
  } catch (error) {
    if (error instanceof ImprovementAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json(
      { error: "Не удалось разобрать вакансию." },
      { status: 500 },
    );
  }
}
