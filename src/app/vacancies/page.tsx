import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { VacancyReview } from "@/lib/vacancy";
import { ServicePage } from "@/components/ui/page-templates";
import { CabinetNav } from "@/components/shared/cabinet-nav";
import { EmptyState, HistoryRow, PageContainer, PrimaryAction } from "@/components/ui/system";

export const metadata: Metadata = { title: "Мои вакансии" };

function date(value: Date) {
  return value.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function VacanciesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth?next=/vacancies");

  const vacancies = await prisma.vacancy.findMany({
    where: { userId: session.user.id },
    include: {
      matches: {
        where: { userId: session.user.id },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { analysisId: true, result: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return (
    <ServicePage>
      <main id="main">
        <PageContainer className="cabinet-view">
          <CabinetNav active="vacancies" />
          <div className="cabinet-content cabinet-vacancies">
          <header className="cabinet-header"><h1>Вакансии<span>.</span></h1><PrimaryAction href="/vacancy">Разобрать вакансию</PrimaryAction></header>

          {vacancies.length ? (
            <div className="ds-history-list">
              {vacancies.map((vacancy) => {
                const match = vacancy.matches[0] ?? null;
                const review = (match?.result ?? vacancy.review) as VacancyReview | null;
                const matched = Boolean(match);
                const decision = review?.matchAssessment?.decision;
                const href = `/vacancy?vacancyId=${vacancy.id}${match ? `&analysisId=${match.analysisId}` : ""}`;

                return (
                  <HistoryRow key={vacancy.id} href={href} status={matched ? "Сопоставлено" : "Разобрано"} tone={matched ? "success" : "data"} title={review?.vacancyAssessment?.title ?? vacancy.title ?? "Вакансия"} meta={date(vacancy.updatedAt)} aside={matched && decision ? <b>{decision.headline}</b> : "Открыть →"} />
                );
              })}
            </div>
          ) : (
            <EmptyState>Разборов вакансий пока нет.</EmptyState>
          )}
          </div>
        </PageContainer>
      </main>
    </ServicePage>
  );
}
