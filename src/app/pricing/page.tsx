import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { PricingClient } from "./pricing-client";
import { fullReportPriceCents, paywallEnabled } from "@/lib/products";

export const metadata: Metadata = {
  title: "Тарифы",
};

type Props = {
  searchParams: Promise<{ analysisId?: string }>;
};

export default async function PricingPage({ searchParams }: Props) {
  const params = await searchParams;
  const price = (fullReportPriceCents() / 100).toFixed(2);
  const paywallOn = paywallEnabled();

  return (
    <>
      <SiteHeader />
      <main id="main" className="relative flex flex-1 flex-col overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 dossier-grid opacity-35"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute right-[-10%] top-0 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(200,241,53,0.2),transparent_68%)]"
        />
        <div className="relative z-10 mx-auto w-full max-w-5xl px-5 py-14 sm:px-8 lg:py-20">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">
            Money · без воды
          </p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl leading-[1.02] tracking-tight text-ink sm:text-5xl lg:text-[3.25rem]">
            Сначала удар бесплатно.
            <span className="mt-2 block text-muted">
              Потом — полный разбор и план правок.
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-muted leading-relaxed">
            Платишь не за сарказм. Платишь за полный разбор, разметку цитат, каркасы
            формулировок без выдуманных фактов и план на 10 / 30 минут.
          </p>

          <div className="mt-14 grid gap-5 lg:grid-cols-2">
            <article className="flex flex-col border border-ink/12 bg-surface p-7 sm:p-9">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                Free
              </p>
              <h2 className="mt-4 font-display text-3xl tracking-tight text-ink">
                Прожарка
              </h2>
              <p className="mt-3 font-mono text-4xl tabular-nums text-ink">$0</p>
              <ul className="mt-8 flex-1 space-y-3 text-sm leading-relaxed text-muted">
                <li className="border-l-2 border-ink/15 pl-3">
                  Вердикт и оценка убедительности
                </li>
                <li className="border-l-2 border-ink/15 pl-3">
                  4 метрики и 3 ключевых удара
                </li>
                <li className="border-l-2 border-ink/15 pl-3">
                  Share Studio, challenge, публичная карточка
                </li>
              </ul>
              <Link
                href="/start"
                className="mt-8 inline-flex h-11 items-center justify-center border border-ink/20 bg-paper px-5 text-sm font-medium text-ink transition-colors hover:border-ink/40"
              >
                Бросить резюме
              </Link>
            </article>

            <article className="relative flex flex-col border border-ink bg-ink p-7 text-paper surface-lift sm:p-9">
              <div
                aria-hidden
                className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-toxic/20 blur-3xl"
              />
              <p className="relative font-mono text-[11px] uppercase tracking-[0.16em] text-toxic">
                Full report
              </p>
              <h2 className="relative mt-4 font-display text-3xl tracking-tight">
                Полный разбор
              </h2>
              <p className="relative mt-3 font-mono text-4xl tabular-nums text-toxic">
                {paywallOn ? `$${price}` : "открыто"}
              </p>
              <ul className="relative mt-8 flex-1 space-y-3 text-sm leading-relaxed text-paper/75">
                <li className="border-l-2 border-toxic/50 pl-3">
                  Все проблемы по приоритету
                </li>
                <li className="border-l-2 border-toxic/50 pl-3">
                  Разметка цитат из резюме
                </li>
                <li className="border-l-2 border-toxic/50 pl-3">
                  Каркасы формулировок без выдуманных цифр
                </li>
                <li className="border-l-2 border-toxic/50 pl-3">
                  Персональный план на 10 / 30 минут
                </li>
              </ul>
              <div className="relative">
                <PricingClient
                  analysisId={params.analysisId ?? null}
                  paywallOn={paywallOn}
                />
              </div>
            </article>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
