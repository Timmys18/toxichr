import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { Button } from "@/components/ui/button";
import { PERSONAS } from "@/lib/personas";
import { PersonaSeal } from "@/components/personas/persona-seal";
import type { PersonaId } from "@/lib/personas";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Мои прожарки",
};

function isPersonaId(value: string | undefined | null): value is PersonaId {
  return Boolean(value && PERSONAS.some((p) => p.id === value));
}

export default async function HistoryPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth?next=/history");
  }

  const analyses = await prisma.analysis.findMany({
    where: { userId: session.user.id, status: "COMPLETED" },
    include: { persona: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

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
          className="pointer-events-none absolute right-[-8%] top-0 h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle_at_center,rgba(26,95,255,0.1),transparent_68%)]"
        />
        <div className="relative z-10 mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">
                Аккаунт · {session.user.email}
              </p>
              <h1 className="mt-3 font-display text-4xl tracking-tight text-ink sm:text-5xl">
                Мои прожарки
              </h1>
              <p className="mt-3 max-w-md text-muted leading-relaxed">
                История анализов. Полный отчёт открывается отдельно после
                оплаты.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button href="/start">Новая прожарка</Button>
              <Button href="/settings" variant="outline">
                Настройки
              </Button>
            </div>
          </div>

          {analyses.length === 0 ? (
            <div className="mt-12 border border-ink/12 bg-surface p-8 text-center sm:p-10">
              <p className="font-display text-2xl text-ink">Пока пусто</p>
              <p className="mt-2 text-sm text-muted">
                Брось первое резюме — приговор появится здесь.
              </p>
              <Button href="/start" className="mt-6">
                Бросить резюме на стол
              </Button>
            </div>
          ) : (
            <ul className="mt-12 space-y-3">
              {analyses.map((a) => {
                const score = a.scorePayload as { total?: number } | null;
                const report = a.reportPayload as {
                  verdict?: { title?: string };
                } | null;
                const code = a.persona?.code;
                const personaId = isPersonaId(code) ? code : "lera";
                const personaName =
                  PERSONAS.find((p) => p.id === personaId)?.name ?? code;

                return (
                  <li
                    key={a.id}
                    className="border border-ink/12 bg-surface p-4 transition-colors hover:border-ink/25 sm:p-5"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3.5">
                        <PersonaSeal
                          personaId={personaId}
                          size="sm"
                          className="mt-0.5"
                        />
                        <div className="min-w-0">
                          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                            {personaName} ·{" "}
                            {a.createdAt.toLocaleDateString("ru-RU")}
                          </div>
                          <div className="mt-1.5 font-display text-xl leading-snug tracking-tight text-ink sm:text-2xl">
                            «{report?.verdict?.title ?? "Без заголовка"}»
                          </div>
                          <div className="mt-2 inline-flex items-baseline gap-1 border border-toxic/35 bg-toxic/10 px-2 py-1 font-mono text-sm tabular-nums text-ink">
                            <span className="text-[10px] uppercase tracking-[0.12em] text-muted">
                              score
                            </span>
                            {score?.total ?? "—"}
                            <span className="text-muted">/100</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <Link
                          href={`/verdict?analysisId=${a.id}`}
                          className="inline-flex min-h-10 items-center border border-ink/15 px-3.5 py-2 text-sm hover:border-ink/40"
                        >
                          Приговор
                        </Link>
                        <Link
                          href={`/report?analysisId=${a.id}`}
                          className="inline-flex min-h-10 items-center border border-ink/15 px-3.5 py-2 text-sm hover:border-ink/40"
                        >
                          Отчёт
                        </Link>
                        <Link
                          href={`/share?analysisId=${a.id}`}
                          className="inline-flex min-h-10 items-center bg-ink px-3.5 py-2 text-sm text-paper hover:bg-graphite"
                        >
                          Share
                        </Link>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
