import type { Metadata } from "next";
import { VacancyClient } from "./vacancy-client";
import { ComparisonResultPage } from "@/components/ui/page-templates";

export const metadata: Metadata = { title: "Разбор вакансии" };

export default async function VacancyPage({
  searchParams,
}: {
  searchParams: Promise<{ analysisId?: string; vacancyId?: string }>;
}) {
  const { analysisId, vacancyId } = await searchParams;
  return (
    <ComparisonResultPage><VacancyClient analysisId={analysisId} vacancyId={vacancyId} /></ComparisonResultPage>
  );
}
