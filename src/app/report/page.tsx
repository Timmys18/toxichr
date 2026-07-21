import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { ReportClient } from "./report-client";

export const metadata: Metadata = {
  title: "Разбор HR",
};

type Props = {
  searchParams: Promise<{
    analysisId?: string;
    full?: string;
    paid?: string;
  }>;
};

export default async function ReportPage({ searchParams }: Props) {
  const params = await searchParams;
  if (!params.analysisId) redirect("/start");

  return (
    <>
      <SiteHeader />
      <main id="main" className="relative flex flex-1 flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 dossier-grid opacity-15"
        />
        <div className="relative z-10 mx-auto w-full max-w-2xl px-5 py-12 sm:px-8 lg:py-16">
          <ReportClient
            analysisId={params.analysisId}
            wantFull={params.full === "1"}
            paidReturn={params.paid === "1"}
          />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
