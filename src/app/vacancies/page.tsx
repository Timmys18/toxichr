import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { VacancyReview } from "@/lib/vacancy";
import { ServicePage } from "@/components/ui/page-templates";
import { EmptyState, HistoryRow, PageContainer, PageIntro, PrimaryAction } from "@/components/ui/system";

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
      <main id="main" className="ds-history-page">
        <PageContainer>
          <PageIntro label="Центр карьеры · вакансии" title="Сохранённые вакансии" lead="Возвращайся к требованиям, решению по отклику и вопросам для интервью — повторно вставлять текст не нужно." />

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
            <EmptyState action={<PrimaryAction href="/vacancy">Разобрать первую вакансию</PrimaryAction>}>Здесь появятся разобранные и сопоставленные вакансии.</EmptyState>
          )}
        </PageContainer>
      </main>
    </ServicePage>
  );
}
