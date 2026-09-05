import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ComparisonResultPage } from "@/components/ui/page-templates";
import { AdaptationClient } from "./adaptation-client";

export const metadata: Metadata = { title: "Адаптация под вакансию" };

export default async function AdaptationPage({
  searchParams,
}: {
  searchParams: Promise<{ analysisId?: string; vacancyId?: string }>;
}) {
  const { analysisId, vacancyId } = await searchParams;
  if (!analysisId || !vacancyId) redirect("/vacancy");

  return <ComparisonResultPage><AdaptationClient analysisId={analysisId} vacancyId={vacancyId} /></ComparisonResultPage>;
}
