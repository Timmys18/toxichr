import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TopNav } from "@/components/shared/top-nav";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { AnalysisReport } from "@/lib/ai/schemas";
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

  const analyses = await prisma.analysis.findMany({
    where: { userId: session.user.id, status: "COMPLETED" },
    include: {
      persona: true,
      resumeVersion: { include: { resume: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const items: CabItem[] = analyses
    .map((a): CabItem | null => {
      const report = a.reportPayload as AnalysisReport | null;
      if (!report) return null;
      const code = a.persona?.code ?? report.recommendedPersonaId ?? "lera";
      return {
        id: a.id,
        personaName: a.persona?.name ?? report.candidateProfile.primaryRole,
        img: IMG[code] ?? "/hr/lera.jpg",
        verdictTitle: report.verdict.title,
        score: report.score.total,
        createdAt: a.createdAt.toISOString(),
        responsibilities: report.viralMetrics.responsibilitiesCount,
        achievements: report.viralMetrics.achievementsCount,
        unproven: report.viralMetrics.unprovenClaimsCount,
        filename: a.resumeVersion?.resume?.originalFilename ?? "резюме",
      };
    })
    .filter((x): x is CabItem => x !== null);

  const name =
    session.user.name?.split(/[\s@]/)[0] ||
    session.user.email?.split("@")[0] ||
    "Кандидат";

  return (
    <>
      <TopNav />
      <main id="main" className="flex flex-1 flex-col">
        <CabinetClient name={name} items={items} />
      </main>
    </>
  );
}
