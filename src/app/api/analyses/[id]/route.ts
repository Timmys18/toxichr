import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { AnalysisReport } from "@/lib/ai/schemas";
import { auth } from "@/lib/auth";
import { hasFullReportAccess } from "@/lib/payments";
import { redactReportForFree } from "@/lib/report-access";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const session = await auth();

  const analysis = await prisma.analysis.findUnique({
    where: { id },
    include: { persona: true },
  });

  if (!analysis) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Guest analyses (no owner): readable by cuid. Owned: only owner.
  if (analysis.userId && analysis.userId !== session?.user?.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const unlocked = await hasFullReportAccess(id, session?.user?.id);
  const full = analysis.reportPayload as AnalysisReport | null;
  const normalized = full
    ? {
        ...full,
        hrReview: full.hrReview ?? {
          firstImpression: full.verdict?.comment ?? "Разбор устарел — запусти новую прожарку.",
          deepDive: (full.topProblems ?? [])
            .map((p) => `${p.title}. ${p.roast}`)
            .join("\n\n") || "Нет текста разбора.",
          hiringTake: `Оценка ${full.score?.total ?? "—"}/100 по убедительности текста.`,
          fixPriority: "Запусти новую прожарку для полного письма HR.",
        },
        improvementPlan: full.improvementPlan ?? [],
      }
    : null;
  const report = normalized
    ? unlocked
      ? normalized
      : redactReportForFree(normalized)
    : null;

  return NextResponse.json({
    id: analysis.id,
    status: analysis.status,
    personaId: analysis.persona?.code ?? null,
    score: analysis.scorePayload,
    report,
    createdAt: analysis.createdAt,
    unlocked,
    claimed: Boolean(analysis.userId),
  });
}
