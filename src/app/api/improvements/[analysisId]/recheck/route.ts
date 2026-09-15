import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ImprovementAccessError, loadImprovementContext } from "@/lib/improvement-server";
import { prisma } from "@/lib/prisma";
import { AnalysisInputError, createAndRunAnalysis } from "@/lib/run-analysis";
import type { PersonaId } from "@/lib/personas";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request, { params }: { params: Promise<{ analysisId: string }> }) {
  if (!rateLimit(`improvement-recheck:${clientIp(request)}`, 10, 60_000).ok) return NextResponse.json({ error: "Слишком много запросов. Подожди минуту." }, { status: 429 });
  try {
    const session = await auth();
    const source = await loadImprovementContext((await params).analysisId, session?.user?.id);
    const improvement = source.improvements.find((item) => item.status === "ready");
    if (!improvement?.resumeVersionId) return NextResponse.json({ error: "Сначала сохрани улучшенную версию." }, { status: 409 });
    const saved = await prisma.analysis.findFirst({ where: { resumeVersionId: improvement.resumeVersionId, status: "COMPLETED", personaId: source.personaId }, orderBy: { createdAt: "desc" }, select: { id: true } });
    const analysisId = saved?.id ?? (await createAndRunAnalysis(source.resumeVersion.resumeId, (source.persona?.code ?? "lera") as PersonaId, undefined, improvement.resumeVersionId, session?.user?.id)).analysisId;
    return NextResponse.json({ analysisId });
  } catch (error) {
    if (error instanceof ImprovementAccessError || error instanceof AnalysisInputError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Не удалось проверить новую версию. Попробуй ещё раз." }, { status: 503 });
  }
}
