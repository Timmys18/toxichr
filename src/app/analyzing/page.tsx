import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import type { PersonaId } from "@/lib/personas";
import { AnalyzingClient } from "./analyzing-client";

export const metadata: Metadata = {
  title: "Анализ",
};

const VALID: PersonaId[] = ["tamara", "lera", "gleb", "vadik"];

type Props = {
  searchParams: Promise<{ resumeId?: string; persona?: string }>;
};

export default async function AnalyzingPage({ searchParams }: Props) {
  const params = await searchParams;
  if (!params.resumeId || !params.persona) {
    redirect("/start");
  }
  if (!VALID.includes(params.persona as PersonaId)) {
    redirect("/start");
  }

  return (
    <>
      <SiteHeader />
      <main id="main" className="relative flex flex-1 flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 dossier-grid opacity-40"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-24 h-[280px] w-[280px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(200,241,53,0.14),transparent_68%)]"
        />
        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 py-12 sm:px-8 lg:px-12">
          <AnalyzingClient
            resumeId={params.resumeId}
            personaId={params.persona as PersonaId}
          />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
