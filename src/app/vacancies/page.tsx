import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TopNav } from "@/components/shared/top-nav";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { VacancyReview } from "@/lib/vacancy";

export const metadata: Metadata = { title: "Мои вакансии" };

function date(value: Date) {
  return value.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function VacanciesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth?next=/vacancies");

  const vacancies = await prisma.vacancy.findMany({
    where: { userId: session.user.id },
    include: {
      matches: {
        where: { userId: session.user.id },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { analysisId: true, result: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return (
    <>
      <TopNav />
      <main id="main" className="flex flex-1 flex-col">
        <section className="history">
          <header>
            <p className="over thr-mono">Центр карьеры · вакансии</p>
            <h1>Сохранённые вакансии</h1>
            <p>
              Возвращайся к требованиям, сопроводительному письму и вопросам
              для интервью — повторно вставлять текст не нужно.
            </p>
          </header>

          {vacancies.length ? (
            <div className="list">
              {vacancies.map((vacancy) => {
                const match = vacancy.matches[0] ?? null;
                const review = (match?.result ?? vacancy.review) as VacancyReview | null;
                const matched = Boolean(match);
                const proven = review?.requirements.filter(
                  (item) => item.category === "proven" || item.category === "hidden",
                ).length ?? 0;
                const total = review?.requirements.filter((item) => item.category).length ?? 0;
                const href = `/vacancy?vacancyId=${vacancy.id}${match ? `&analysisId=${match.analysisId}` : ""}`;

                return (
                  <Link key={vacancy.id} href={href} className="item">
                    <span className={`status ${matched ? "matched" : "plain"}`}>
                      {matched ? "Сопоставлено" : "Разобрано"}
                    </span>
                    <span className="content">
                      <b>{review?.title ?? vacancy.title ?? "Вакансия"}</b>
                      <small>{date(vacancy.updatedAt)}</small>
                    </span>
                    {matched && total ? (
                      <span className="score"><b>{proven}</b> / {total}</span>
                    ) : (
                      <span className="go">Открыть →</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="empty">
              <p>Здесь появятся разобранные и сопоставленные вакансии.</p>
              <Link href="/vacancy" className="thr-btn thr-btn-tox">
                Разобрать первую вакансию
              </Link>
            </div>
          )}
        </section>
      </main>

      <style>{`
        .history{width:min(900px,calc(100% - 36px));margin:0 auto;padding:54px 0 90px}
        .history header{max-width:700px}.history .over{color:var(--tox);font-size:10px;letter-spacing:.18em;text-transform:uppercase}
        .history h1{margin-top:12px;font-size:clamp(34px,5vw,58px);letter-spacing:-.045em;line-height:1.04}
        .history header>p:last-child{margin-top:18px;color:var(--dim);font-size:16px;line-height:1.6}
        .history .list{display:grid;gap:12px;margin-top:38px}
        .history .item{display:flex;align-items:center;gap:18px;padding:20px 22px;border:1px solid var(--hair);border-radius:18px;background:var(--metal-0);color:inherit;text-decoration:none;transition:.2s var(--ease)}
        .history .item:hover{border-color:var(--hair2);transform:translateY(-2px);background:var(--metal-1)}
        .history .status{flex:0 0 auto;padding:6px 10px;border-radius:999px;font:9px var(--font-mono);letter-spacing:.12em;text-transform:uppercase}
        .history .status.matched{color:var(--tox);background:var(--tox-dim)}.history .status.plain{color:var(--data);background:rgba(106,155,255,.1)}
        .history .content{min-width:0;flex:1}.history .content b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:16px}.history .content small{display:block;margin-top:5px;color:var(--faint);font-size:12px}
        .history .score{color:var(--faint);font-size:13px}.history .score b{color:var(--tox);font-size:24px}.history .go{color:var(--dim);font-size:13px}
        .history .empty{margin-top:40px;padding:54px 24px;border:1px dashed var(--hair2);border-radius:20px;text-align:center}.history .empty p{color:var(--dim)}.history .empty a{min-height:50px;margin-top:20px;padding:0 24px;text-decoration:none}
        @media(max-width:600px){.history{padding-top:38px}.history .item{align-items:flex-start;flex-wrap:wrap;gap:12px}.history .status{order:0}.history .content{order:2;flex-basis:100%}.history .score,.history .go{margin-left:auto}}
      `}</style>
    </>
  );
}
