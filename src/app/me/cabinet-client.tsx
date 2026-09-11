"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { EmptyState, PageContainer, PageIntro, PrimaryAction, SecondaryAction, SurfacePanel } from "@/components/ui/system";

export type CabItem = {
  id: string;
  personaName: string;
  img: string;
  verdictTitle: string;
  score: number;
  createdAt: string;
  responsibilities: number;
  achievements: number;
  unproven: number;
  filename: string;
  resumeId: string;
  afterScore: number | null;
  hasImprovement: boolean;
};

export type CabinetPackage = {
  active: boolean;
  matchesRemaining: number;
  rechecksRemaining: number;
  improvementUsed: boolean;
  adaptationUsed: boolean;
};

function timeAgo(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CabinetClient({
  name,
  items,
  vacancyCount,
  packageStatus,
}: {
  name: string;
  items: CabItem[];
  vacancyCount: number;
  packageStatus: CabinetPackage;
}) {
  const last = items[0];
  const improved = items.filter((item) => item.hasImprovement);
  const status =
    !last
      ? "ждёт разбора"
      : last.score >= 75
        ? "почти готово"
        : last.score >= 55
          ? "сыровато"
          : "тонет в воде";

  return (
    <PageContainer className="ds-cabinet">
      <PageIntro className="ds-cabinet-intro" label="Центр карьеры" title={<>{name}, резюме <span>{status}</span></>} action={last ? <PrimaryAction href="/">Новый разбор</PrimaryAction> : null} />

      {last ? (
        <div className="cab-grid">
          <SurfacePanel label="Последний разбор" action={<Link href={`/session?view=${last.id}`}>открыть →</Link>}>
            <div className="last">
              <span
                className="ava thr-photo"
                style={{ backgroundImage: `url('${last.img}')` }}
              />
              <div>
                <h3>«{last.verdictTitle}»</h3>
                <div className="meta">
                  {last.personaName} · {timeAgo(last.createdAt)} ·{" "}
                  {last.filename}
                </div>
              </div>
            </div>
            <div className="delta">
              <div className="c">
                <div className="v crit">
                  {last.achievements}/{last.responsibilities}
                </div>
                <div className="k">результаты / процесс</div>
              </div>
              <div className="c">
                <div className="v crit">{last.unproven}</div>
                <div className="k">заявлений без фактов</div>
              </div>
              <div className="c">
                <div className="v tox">{last.score}</div>
                <div className="k">оценка убедительности</div>
              </div>
            </div>
            <SecondaryAction href={`/revenge?analysisId=${last.id}`} className="rebtn">
              {last.hasImprovement ? "Открыть новую версию и сравнение" : "Исправить резюме · пакет ToxicHR"}
            </SecondaryAction>
          </SurfacePanel>

          <div>
            <SurfacePanel className="package-status" label="Пакет ToxicHR" action={<span>{packageStatus.active ? "активен" : "не открыт"}</span>}>
              {packageStatus.active ? <>
                <p>Сопоставления: осталось {packageStatus.matchesRemaining} из 5</p>
                <p>Повторные проверки: осталось {packageStatus.rechecksRemaining} из 5</p>
                <p>Улучшение: {packageStatus.improvementUsed ? "использовано" : "доступно"}</p>
                <p>Адаптация под вакансию: {packageStatus.adaptationUsed ? "использована" : "доступна"}</p>
              </> : <><p>Один пакет за 199 ₽ открывает персональную работу с этим резюме.</p><Link href={`/revenge?analysisId=${last.id}`}>Открыть пакет →</Link></>}
            </SurfacePanel>
            <SurfacePanel label="Мои разборы" action={<span aria-label={`Мои разборы: ${items.length}`}>{items.length}</span>}>
              <div className="rlist">
                {items.map((it) => (
                  <Link key={it.id} href={`/session?view=${it.id}`} className="r">
                    <span
                      className="a thr-photo"
                      style={{ backgroundImage: `url('${it.img}')` }}
                    />
                    <span className="rt">
                      <span className="t1">«{it.verdictTitle}»</span>
                      <span className="t2">
                        {it.personaName} · {timeAgo(it.createdAt)}
                      </span>
                    </span>
                    <span className="go">→</span>
                  </Link>
                ))}
              </div>
            </SurfacePanel>

            <SurfacePanel className="versions-panel" label="Версии до / после" action={<span>{improved.length}</span>}>
              {improved.length ? (
                <div className="versions">
                  {improved.slice(0, 5).map((item) => (
                    <Link key={item.id} href={`/revenge?analysisId=${item.id}`} className="version">
                      <span><b>{item.score}</b> было</span>
                      <i>→</i>
                      <span className="up"><b>{item.afterScore ?? item.score}</b> стало</span>
                      <em>Открыть</em>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="empty">
                  После первого улучшения здесь появится честное сравнение двух версий.
                  <br />
                  <Link href={`/revenge?analysisId=${last.id}`}>Собрать новую версию через пакет ToxicHR →</Link>
                </div>
              )}
            </SurfacePanel>

            <Link href="/vacancies" className="vacancy-panel">
              <span>
                <b>Мои вакансии</b>
                <small>Разборы, сопоставления и тексты для отклика</small>
              </span>
              <strong>{vacancyCount}</strong>
              <i>→</i>
            </Link>
          </div>
        </div>
      ) : (
        <EmptyState className="empty-big" action={<div className="empty-actions"><PrimaryAction href="/">Проверить резюме</PrimaryAction><SecondaryAction href="/vacancy">Разобрать вакансию{vacancyCount > 0 ? ` · ${vacancyCount}` : ""}</SecondaryAction></div>}><b>С чего начнём?</b><br />Можно проверить резюме или сначала разобрать вакансию. Если начать с вакансии, её текст сохранится до сопоставления.</EmptyState>
      )}

      <div className="footer">
        <button onClick={() => signOut({ callbackUrl: "/" })}>Выйти</button>
        <Link href="/settings">Приватность и удаление данных</Link>
      </div>

    </PageContainer>
  );
}
