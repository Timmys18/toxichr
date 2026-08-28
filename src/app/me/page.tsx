import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { AnalysisReport } from "@/lib/ai/schemas";
import { PERSONAS } from "@/lib/personas";
import { CabinetClient, type CabItem } from "./cabinet-client";

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

  const [analyses, vacancyCount] = await Promise.all([
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
        afterScore: a.improvements[0]?.afterScore ?? null,
        hasImprovement: a.improvements[0]?.status === "ready",
      };
    })
    .filter((x): x is CabItem => x !== null);

  const name =
    session.user.name?.split(/[\s@]/)[0] ||
    session.user.email?.split("@")[0] ||
    "Кандидат";

  return (
    <>
      <main id="main" className="flex flex-1 flex-col">
        <CabinetClient name={name} items={items} vacancyCount={vacancyCount} />
      </main>
    </>
  );
}
