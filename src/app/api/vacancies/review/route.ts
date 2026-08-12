import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { AnalysisReport } from "@/lib/ai/schemas";
import { trackServer } from "@/lib/analytics-server";
import { auth } from "@/lib/auth";
import {
  ImprovementAccessError,
  loadImprovementContext,
} from "@/lib/improvement-server";
import { redactPii } from "@/lib/documents/redact-pii";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { reviewVacancy } from "@/lib/vacancy";

const BodySchema = z.object({
  text: z.string().trim().min(80).max(30_000),
  analysisId: z.string().min(1).optional(),
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
    const report = analysis?.reportPayload as AnalysisReport | undefined;
    const sourceResumeText =
      analysis?.improvements[0]?.improvedText ??
      analysis?.resumeVersion.resume.sanitizedText ??
      undefined;
    const resumeText = sourceResumeText
      ? redactPii(sourceResumeText).sanitizedText
      : undefined;
    const result = await reviewVacancy({
      vacancyText: parsed.data.text,
      resumeText,
      report,
    });

    const vacancy = await prisma.vacancy.create({
      data: {
        userId: session?.user?.id ?? analysis?.userId ?? null,
        sourceText: parsed.data.text,
        title: result.title,
        review: result as Prisma.InputJsonValue,
      },
    });

    if (analysis) {
      await prisma.vacancyMatch.create({
        data: {
          vacancyId: vacancy.id,
          analysisId: analysis.id,
          userId: session?.user?.id ?? analysis.userId ?? null,
          result: result as Prisma.InputJsonValue,
          tailoredIntro: result.tailoredIntro,
          coverLetter: result.coverLetter,
          interviewQuestions: result.interviewQuestions as Prisma.InputJsonValue,
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
