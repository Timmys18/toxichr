import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { StartClient } from "@/app/start/start-client";

export const metadata: Metadata = {
  title: "Загрузка резюме",
};

export default function StartPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="relative flex flex-1 flex-col overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 dossier-grid opacity-45"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute right-[-5%] top-10 h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle_at_center,rgba(200,241,53,0.18),transparent_68%)]"
        />
        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col gap-12 px-5 py-14 sm:px-8 lg:flex-row lg:items-start lg:justify-between lg:gap-16 lg:px-12 lg:py-20">
          <div className="max-w-md lg:sticky lg:top-10">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">
              Шаг 1 · материалы дела
            </p>
            <h1 className="mt-4 font-display text-4xl leading-[1.02] tracking-tight text-ink sm:text-5xl">
              Брось резюме на стол
            </h1>
            <p className="mt-5 text-muted leading-relaxed">
              Сначала файл. Потом выберешь HR. Регистрация — только после
              приговора, если захочешь сохранить результат.
            </p>
            <ul className="mt-8 space-y-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
              <li>— PDF / DOCX / текст</li>
              <li>— без анкеты и вакансии</li>
              <li>— приватный результат по умолчанию</li>
            </ul>
          </div>
          <Suspense
            fallback={
              <p className="font-mono text-sm text-muted">Готовим стол…</p>
            }
          >
            <StartClient />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
