import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import type { AnalysisReport } from "@/lib/ai/schemas";
import {
  buildImprovedResume,
  buildImprovementQuestions,
  type ImprovementAnswer,
} from "@/lib/improvement";
import {
  ImprovementAccessError,
  loadImprovementContext,
  loadOriginalResumeText,
} from "@/lib/improvement-server";
import type { PersonaId } from "@/lib/personas";
import { prisma } from "@/lib/prisma";
import { runHeuristicAnalysis } from "@/lib/ai/heuristics";
import { trackServer } from "@/lib/analytics-server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  hasProductAccess,
  PAID_ACTION_PRICE_RUB,
  RESUME_REWRITE_PRODUCT_CODE,
} from "@/lib/payments";

const BodySchema = z.object({
  answers: z.array(z.object({
    problemId: z.string().min(1),
    answer: z.string().trim().max(1500),
  })).max(7),
});

const EditorSchema = z.object({
  improvedText: z.string().trim().min(80).max(60_000),
});

async function context(analysisId: string) {
  const session = await auth();
  return loadImprovementContext(analysisId, session?.user?.id);
}

function paymentRequired() {
  return NextResponse.json(
    {
      error: `Готовая новая версия стоит ${PAID_ACTION_PRICE_RUB} ₽ в бете.`,
      paymentRequired: true,
      priceRub: PAID_ACTION_PRICE_RUB,
    },
    { status: 402 },
  );
}

function errorResponse(error: unknown) {
  if (error instanceof ImprovementAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ error: "Не удалось собрать новую версию." }, { status: 500 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ analysisId: string }> },
) {
  try {
    const { analysisId } = await params;
    const analysis = await context(analysisId);
    const report = analysis.reportPayload as AnalysisReport;
    const saved = analysis.improvements[0] ?? null;
    const originalText = await loadOriginalResumeText(analysis.resumeVersion.resume);

    return NextResponse.json({
      analysisId,
      questions: buildImprovementQuestions(report),
      beforeScore: report.score.total,
      originalText,
      improvement: saved
        ? {
            answers: saved.answers,
            replacements: saved.replacements,
            improvedText: saved.improvedText,
            afterScore: saved.afterScore,
            ready: saved.status === "ready",
          }
        : null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ analysisId: string }> },
) {
  try {
    const limited = rateLimit(`improvement:${clientIp(request)}`, 20, 60_000);
    if (!limited.ok) {
      return NextResponse.json(
        { error: `Слишком много сохранений. Подожди ${limited.retryAfterSec}с.` },
        { status: 429 },
      );
    }

    const { analysisId } = await params;
    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Проверь ответы." }, { status: 400 });

    const answers = parsed.data.answers.filter((item) => item.answer.length > 0);
    if (answers.length === 0) {
      return NextResponse.json({ error: "Ответь хотя бы на один вопрос." }, { status: 400 });
    }

    const analysis = await context(analysisId);
    if (!(await hasProductAccess(analysisId, RESUME_REWRITE_PRODUCT_CODE))) return paymentRequired();

    const report = analysis.reportPayload as AnalysisReport;
    const sanitizedText = analysis.resumeVersion.resume.sanitizedText ?? "";
    if (!sanitizedText) {
      return NextResponse.json({ error: "Текст резюме недоступен." }, { status: 409 });
    }

    const result = await buildImprovedResume({
      report,
      resumeText: sanitizedText,
      answers: answers as ImprovementAnswer[],
      personaId: (analysis.persona?.code ?? "lera") as PersonaId,
    });
    if (result.replacements.length === 0) {
      return NextResponse.json(
        { error: "Пока фактов недостаточно, чтобы сделать текст сильнее. Добавь личное действие, масштаб или проверяемый результат хотя бы в один ответ." },
        { status: 422 },
      );
    }

    const originalText = await loadOriginalResumeText(analysis.resumeVersion.resume);
    let improvedText = originalText || result.improvedText;
    for (const replacement of result.replacements) {
      if (improvedText.includes(replacement.original)) {
        improvedText = improvedText.replace(replacement.original, replacement.replacement);
      }
    }

    const existing = analysis.improvements[0] ?? null;
    let resumeVersionId = existing?.resumeVersionId ?? null;
    const structuredContent = {
      text: improvedText,
      replacements: result.replacements,
    } as Prisma.InputJsonValue;

    if (resumeVersionId) {
      await prisma.resumeVersion.update({
        where: { id: resumeVersionId },
        data: { structuredContent },
      });
    } else {
      const latest = await prisma.resumeVersion.aggregate({
        where: { resumeId: analysis.resumeVersion.resumeId },
        _max: { versionNumber: true },
      });
      const version = await prisma.resumeVersion.create({
        data: {
          resumeId: analysis.resumeVersion.resumeId,
          parentVersionId: analysis.resumeVersionId,
          versionNumber: (latest._max.versionNumber ?? 1) + 1,
          source: "improvement",
          structuredContent,
        },
      });
      resumeVersionId = version.id;
    }

    const saved = await prisma.resumeImprovement.upsert({
      where: { analysisId },
      create: {
        analysisId,
        userId: analysis.userId,
        resumeVersionId,
        status: "ready",
        answers: answers as Prisma.InputJsonValue,
        replacements: result.replacements as Prisma.InputJsonValue,
        improvedText,
        beforeScore: report.score.total,
        afterScore: result.afterScore,
      },
      update: {
        resumeVersionId,
        status: "ready",
        answers: answers as Prisma.InputJsonValue,
        replacements: result.replacements as Prisma.InputJsonValue,
        improvedText,
        afterScore: result.afterScore,
      },
    });

    await trackServer("fix_generated", {
      analysisId,
      afterScore: saved.afterScore,
      replacements: result.replacements.length,
    });

    return NextResponse.json({
      ready: true,
      beforeScore: saved.beforeScore,
      afterScore: saved.afterScore,
      replacements: saved.replacements,
      improvedText: saved.improvedText,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ analysisId: string }> },
) {
  try {
    const limited = rateLimit(`editor:${clientIp(request)}`, 30, 60_000);
    if (!limited.ok) {
      return NextResponse.json(
        { error: `Слишком много сохранений. Подожди ${limited.retryAfterSec}с.` },
        { status: 429 },
      );
    }

    const { analysisId } = await params;
    if (!(await hasProductAccess(analysisId, RESUME_REWRITE_PRODUCT_CODE))) return paymentRequired();

    const parsed = EditorSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Версия должна содержать от 80 до 60 000 знаков." }, { status: 400 });
    }

    const analysis = await context(analysisId);
    const improvement = analysis.improvements[0];
    if (!improvement?.resumeVersionId) {
      return NextResponse.json({ error: "Сначала собери новую версию по ответам." }, { status: 409 });
    }

    const report = analysis.reportPayload as AnalysisReport;
    const personaId = (analysis.persona?.code ?? "lera") as PersonaId;
    const originalText = analysis.resumeVersion.resume.sanitizedText ?? "";
    const baseline = runHeuristicAnalysis(originalText, personaId).score.total;
    const edited = runHeuristicAnalysis(parsed.data.improvedText, personaId).score.total;
    const afterScore = Math.max(0, Math.min(100, report.score.total + edited - baseline));
    const replacements = improvement.replacements ?? [];

    await prisma.$transaction([
      prisma.resumeVersion.update({
        where: { id: improvement.resumeVersionId },
        data: {
          structuredContent: {
            text: parsed.data.improvedText,
            replacements,
            editedManually: true,
          } as Prisma.InputJsonValue,
        },
      }),
      prisma.resumeImprovement.update({
        where: { analysisId },
        data: {
          improvedText: parsed.data.improvedText,
          afterScore,
          status: "ready",
        },
      }),
    ]);

    await trackServer("resume_editor_saved", {
      analysisId,
      afterScore,
      length: parsed.data.improvedText.length,
    });

    return NextResponse.json({
      ready: true,
      improvedText: parsed.data.improvedText,
      afterScore,
      savedAt: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
