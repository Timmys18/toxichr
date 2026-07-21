import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { ShareStudio } from "@/components/share/share-studio";

export const metadata: Metadata = {
  title: "Share Studio",
};

type Props = {
  searchParams: Promise<{ analysisId?: string }>;
};

export default async function SharePage({ searchParams }: Props) {
  const params = await searchParams;
  if (!params.analysisId) {
    redirect("/start");
  }

  return (
    <>
      <SiteHeader />
      <main id="main" className="relative flex flex-1 flex-col overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 dossier-grid opacity-30"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-16 top-20 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle_at_center,rgba(201,24,48,0.1),transparent_70%)]"
        />
        <div className="relative z-10 mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
          <ShareStudio analysisId={params.analysisId} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
