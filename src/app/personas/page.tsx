import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { PersonasClient } from "./personas-client";

export const metadata: Metadata = {
  title: "Выбор HR",
};

type Props = {
  searchParams: Promise<{ resumeId?: string }>;
};

export default async function PersonasPage({ searchParams }: Props) {
  const params = await searchParams;
  if (!params.resumeId) {
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
          className="pointer-events-none absolute -right-10 top-0 h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle_at_center,rgba(31,107,255,0.12),transparent_68%)]"
        />
        <div className="relative z-10 mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 lg:px-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
            Шаг 2 · следователь
          </p>
          <h1 className="mt-3 max-w-2xl font-display text-4xl tracking-tight text-ink sm:text-5xl">
            Кому отдаём дело?
          </h1>
          <p className="mt-4 max-w-2xl text-muted leading-relaxed">
            Факты общие. Меняется оптика, метафоры и тип сарказма.
          </p>
          <PersonasClient resumeId={params.resumeId} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
