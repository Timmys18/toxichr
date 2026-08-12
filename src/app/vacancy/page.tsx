import type { Metadata } from "next";
import { TopNav } from "@/components/shared/top-nav";
import { VacancyClient } from "./vacancy-client";

export const metadata: Metadata = { title: "Разбор вакансии" };

export default async function VacancyPage({
  searchParams,
}: {
  searchParams: Promise<{ analysisId?: string }>;
}) {
  const { analysisId } = await searchParams;
  return (
    <>
      <TopNav />
      <main id="main" className="flex flex-1 flex-col">
        <VacancyClient analysisId={analysisId} />
      </main>
    </>
  );
}
