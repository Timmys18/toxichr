import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ProfessionalAssessmentSchema } from "@/lib/ai/professional-assessment";
import { trackServer } from "@/lib/analytics-server";
import {
  completePackageAction,
  matchPackageAction,
  PackageAccessError,
  releasePackageAction,
  reservePackageAction,
} from "@/lib/package";
import { prisma } from "@/lib/prisma";
import { createAndRunAnalysis } from "@/lib/run-analysis";
import { reviewVacancy } from "@/lib/vacancy";
import type { PersonaId } from "@/lib/personas";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  let reservationId: string | null = null;
  try {
    const session = await auth();
    const { id } = await params;
    const adaptation = await prisma.resumeAdaptation.findUnique({
      where: { id },
      include: {
        vacancy: true,
        analysis: { include: { persona: true, resumeVersion: { include: { resume: true } } } },
        recheckAnalysis: true,
      },
    });
    if (!adaptation || adaptation.status !== "ready" || !adaptation.resumeVersionId) {
      return NextResponse.json({ error: "Готовая адаптация не найдена." }, { status: 404 });
    }
    const ownerId = session?.user?.id ?? adaptation.userId ?? adaptation.analysis.userId ?? null;
    if ((adaptation.userId && adaptation.userId !== session?.user?.id) || (adaptation.analysis.userId && adaptation.analysis.userId !== session?.user?.id)) {
      return NextResponse.json({ error: "Нет доступа к этой адаптации." }, { status: 403 });
    }
    if (adaptation.recheckAnalysis?.status === "COMPLETED") {
      const saved = await prisma.vacancyMatch.findUnique({ where: { vacancyId_analysisId: { vacancyId: adaptation.vacancyId, analysisId: adaptation.recheckAnalysis.id } } });
      return NextResponse.json({ analysisId: adaptation.recheckAnalysis.id, vacancyId: adaptation.vacancyId, result: saved?.result ?? null, reused: true });
    }

    const personaId = (adaptation.analysis.persona?.code ?? "lera") as PersonaId;
    const { analysisId } = await createAndRunAnalysis(adaptation.analysis.resumeVersion.resumeId, personaId);
    const recheck = await prisma.analysis.findUnique({ where: { id: analysisId }, select: { reportPayload: true } });
    const professional = ProfessionalAssessmentSchema.safeParse((recheck?.reportPayload as { professionalAssessment?: unknown } | null)?.professionalAssessment);
    if (!professional.success) throw new Error("Новая версия не получила профессиональную оценку.");

    const kind = await matchPackageAction(analysisId, adaptation.vacancyId, session?.user?.id);
    const reservation = await reservePackageAction({ analysisId, currentUserId: session?.user?.id, kind, vacancyId: adaptation.vacancyId });
    reservationId = reservation.reservationId;
    const result = await reviewVacancy({ vacancyText: adaptation.vacancy.sourceText, professionalAssessment: professional.data, personaId });
    const interviewQuestions = (result.matchAssessment?.candidateQuestions ?? []) as Prisma.InputJsonValue;
    await prisma.$transaction([
      prisma.vacancy.update({ where: { id: adaptation.vacancyId }, data: { title: result.vacancyAssessment.title, review: result as Prisma.InputJsonValue } }),
      prisma.vacancyMatch.upsert({
        where: { vacancyId_analysisId: { vacancyId: adaptation.vacancyId, analysisId } },
        create: { vacancyId: adaptation.vacancyId, analysisId, userId: ownerId, result: result as Prisma.InputJsonValue, interviewQuestions },
        update: { userId: ownerId, result: result as Prisma.InputJsonValue, interviewQuestions },
      }),
      prisma.resumeAdaptation.update({ where: { id }, data: { recheckAnalysisId: analysisId } }),
    ]);
    await completePackageAction(reservationId);
    reservationId = null;
    await trackServer("recheck_used", { analysisId, vacancyId: adaptation.vacancyId, adaptationId: id });
    return NextResponse.json({ analysisId, vacancyId: adaptation.vacancyId, result });
  } catch (error) {
    await releasePackageAction(reservationId).catch(() => undefined);
    if (error instanceof PackageAccessError) {
      if (error.reason === "limit_reached") await trackServer("package_limit_reached", { action: "recheck" }).catch(() => undefined);
      return NextResponse.json({ error: error.message, paymentRequired: error.reason === "package_required", limitReached: error.reason === "limit_reached" }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Не удалось повторно проверить новую версию." }, { status: 500 });
  }
}
