import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { AnalysisReport } from "@/lib/ai/schemas";
import { PERSONAS } from "@/lib/personas";
import { CabinetClient, type CabDocument, type CabDraftTarget, type CabItem, type CabinetPackage } from "./cabinet-client";

export const metadata: Metadata = { title: "Центр карьеры" };

const IMG: Record<string, string> = {
  vadik: "/hr/vadik.jpg",
  lera: "/hr/lera.jpg",
  gleb: "/hr/gleb.jpg",
  tamara: "/hr/tamara.jpg",
};

export default async function MePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth?next=/me");
  }

  const [analyses, vacancyCount, packages, adaptations, matchTargets] = await Promise.all([
    prisma.analysis.findMany({
      where: { userId: session.user.id, status: "COMPLETED" },
      include: {
        persona: true,
        resumeVersion: { include: { resume: true } },
        improvements: { orderBy: { updatedAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.vacancy.count({ where: { userId: session.user.id } }),
    prisma.toxicHrPackage.findMany({
      where: { userId: session.user.id },
      include: { usages: { where: { status: "COMPLETED" } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.resumeAdaptation.findMany({
      where: { userId: session.user.id, status: "ready", adaptedText: { not: null } },
      include: { vacancy: true, analysis: { include: { resumeVersion: true } } },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    prisma.vacancyMatch.findMany({
      where: { userId: session.user.id },
      include: { vacancy: true, analysis: { include: { resumeVersion: true } } },
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
  ]);

  const items: CabItem[] = analyses
    .map((a): CabItem | null => {
      const report = a.reportPayload as AnalysisReport | null;
      if (!report) return null;
      const code = a.persona?.code ?? report.recommendedPersonaId ?? "lera";
      const persona = PERSONAS.find((item) => item.id === code);
      return {
        id: a.id,
        personaName: persona?.name ?? a.persona?.name ?? report.candidateProfile.primaryRole,
        img: IMG[code] ?? "/hr/lera.jpg",
        verdictTitle: report.verdict.title,
        score: report.score.total,
        createdAt: a.createdAt.toISOString(),
        responsibilities: report.viralMetrics.responsibilitiesCount,
        achievements: report.viralMetrics.achievementsCount,
        unproven: report.viralMetrics.unprovenClaimsCount,
        filename: a.resumeVersion?.resume?.originalFilename ?? "резюме",
        resumeId: a.resumeVersion.resumeId,
        afterScore: a.improvements[0]?.afterScore ?? null,
        hasImprovement: a.improvements[0]?.status === "ready",
      };
    })
    .filter((x): x is CabItem => x !== null);

  const name =
    session.user.name?.split(/[\s@]/)[0] ||
    session.user.email?.split("@")[0] ||
    "Кандидат";

  const documents: CabDocument[] = [
    ...analyses.flatMap((analysis) => analysis.improvements.filter((improvement) => improvement.status === "ready" && improvement.improvedText).map((improvement) => ({
      id: improvement.id,
      kind: "improvement" as const,
      analysisId: analysis.id,
      resumeId: analysis.resumeVersion.resumeId,
      title: "Улучшенная версия резюме",
      detail: improvement.afterScore === null ? "Оценка новой версии не рассчитана" : `Оценка новой версии: ${improvement.afterScore}/100`,
      updatedAt: improvement.updatedAt.toISOString(),
      href: `/revenge?analysisId=${analysis.id}`,
    }))),
    ...adaptations.map((adaptation) => ({
      id: adaptation.id,
      kind: "adaptation" as const,
      analysisId: adaptation.analysisId,
      resumeId: adaptation.analysis.resumeVersion.resumeId,
      title: `Адаптация под «${adaptation.vacancy.title ?? "вакансию"}»`,
      detail: "Это отдельная версия под вакансию; общая оценка резюме не пересчитывалась",
      updatedAt: adaptation.updatedAt.toISOString(),
      href: `/adaptation?analysisId=${adaptation.analysisId}&vacancyId=${adaptation.vacancyId}`,
    })),
  ].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

  const draftTargets: CabDraftTarget[] = matchTargets.map((match) => ({
    analysisId: match.analysisId,
    vacancyId: match.vacancyId,
    vacancyTitle: match.vacancy.title ?? "вакансию",
  }));

  // The package panel must describe the same resume as the document promoted
  // above it. A user can have a newer analysis while their latest ready
  // document still belongs to an older resume.
  const currentResumeId = documents[0]?.resumeId ?? items[0]?.resumeId;
  const currentPackage = currentResumeId ? packages.find((item) => item.resumeId === currentResumeId) : null;
  const packageStatus: CabinetPackage = currentPackage
    ? {
        active: true,
        matchesRemaining: Math.max(0, 5 - currentPackage.usages.filter((item) => item.kind === "MATCH").length),
        rechecksRemaining: Math.max(0, 5 - currentPackage.usages.filter((item) => item.kind === "RECHECK").length),
        improvementUsed: currentPackage.usages.some((item) => item.kind === "IMPROVEMENT"),
        adaptationUsed: currentPackage.usages.some((item) => item.kind === "ADAPTATION"),
      }
    : { active: false, matchesRemaining: 5, rechecksRemaining: 5, improvementUsed: false, adaptationUsed: false };

  return (
    <>
      <main id="main" className="flex flex-1 flex-col">
        <CabinetClient name={name} items={items} vacancyCount={vacancyCount} packageStatus={packageStatus} documents={documents} draftTargets={draftTargets} />
      </main>
    </>
  );
}
