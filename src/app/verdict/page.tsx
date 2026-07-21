import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { VerdictClient } from "./verdict-client";

export const metadata: Metadata = {
  title: "Вердикт HR",
};

type Props = {
  searchParams: Promise<{ analysisId?: string }>;
};

export default async function VerdictPage({ searchParams }: Props) {
  const params = await searchParams;
  if (!params.analysisId) {
    redirect("/start");
  }

  return (
    <>
      <SiteHeader />
      <main id="main" className="relative flex flex-1 flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 dossier-grid opacity-25"
        />
        <div className="relative z-10 mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 py-12 sm:px-8 lg:py-16">
          <VerdictClient analysisId={params.analysisId} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
