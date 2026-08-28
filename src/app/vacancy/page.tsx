import type { Metadata } from "next";
import { VacancyClient } from "./vacancy-client";

export const metadata: Metadata = { title: "Разбор вакансии" };

export default async function VacancyPage({
  searchParams,
}: {
  searchParams: Promise<{ analysisId?: string; vacancyId?: string }>;
}) {
  const { analysisId, vacancyId } = await searchParams;
  return (
    <VacancyClient analysisId={analysisId} vacancyId={vacancyId} />
  );
}
