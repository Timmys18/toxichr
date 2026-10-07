"use client";

import { useEffect, useState } from "react";
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

export type CabDocument = { id: string; kind: "improvement" | "adaptation"; analysisId: string; resumeId: string; title: string; detail: string; updatedAt: string; href: string };
export type CabDraftTarget = { analysisId: string; vacancyId: string; vacancyTitle: string };
type ActiveDraft = { title: string; detail: string; href: string };

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
  documents,
  draftTargets,
}: {
  name: string;
  items: CabItem[];
  vacancyCount: number;
  packageStatus: CabinetPackage;
  documents: CabDocument[];
  draftTargets: CabDraftTarget[];
}) {
  const last = items[0];
  const improved = items.filter((item) => item.hasImprovement);
  const latestDocument = documents[0];
  const [activeDraft, setActiveDraft] = useState<ActiveDraft | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      for (const item of items) {
        if (documents.some((document) => document.kind === "improvement" && document.analysisId === item.id)) continue;
        try {
          const answers = JSON.parse(window.localStorage.getItem(`toxichr:revenge:${item.id}`) ?? "{}") as Record<string, unknown>;
          if (Object.values(answers).some((answer) => typeof answer === "string" && answer.trim())) {
            setActiveDraft({ title: "Незавершённые ответы по улучшению", detail: `Исходный разбор: «${item.verdictTitle}». Ответы сохранены на этом устройстве.`, href: `/revenge?analysisId=${item.id}` });
            return;
          }
        } catch { /* повреждённый локальный черновик пропускаем */ }
      }
      for (const target of draftTargets) {
        try {
          const answers = JSON.parse(window.localStorage.getItem(`toxichr:adaptation:${target.analysisId}:${target.vacancyId}`) ?? "{}") as Record<string, unknown>;
          if (Object.values(answers).some((answer) => typeof answer === "string" && answer.trim())) {
            setActiveDraft({ title: `Незавершённая адаптация под «${target.vacancyTitle}»`, detail: "Ответы сохранены на этом устройстве и относятся к указанной вакансии.", href: `/adaptation?analysisId=${target.analysisId}&vacancyId=${target.vacancyId}` });
            return;
          }
        } catch { /* повреждённый локальный черновик пропускаем */ }
      }
      setActiveDraft(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [documents, draftTargets, items]);

  const pageState = activeDraft ? "работа не закончена" : latestDocument ? "последняя версия готова" : last ? "исходный разбор готов" : "ждёт резюме";

  return (
    <PageContainer className="ds-cabinet">
      <PageIntro className="ds-cabinet-intro" label="Центр карьеры" title={<>{name}: <span>{pageState}</span></>} />

      {activeDraft ? <SurfacePanel className="cab-priority" label="Продолжить работу" action={<Link href={activeDraft.href}>открыть →</Link>}><h2>{activeDraft.title}</h2><p>{activeDraft.detail}</p><PrimaryAction href={activeDraft.href}>Продолжить с ответами</PrimaryAction></SurfacePanel> : latestDocument ? <SurfacePanel className="cab-priority" label="Последний релевантный документ" action={<Link href={latestDocument.href}>открыть →</Link>}><h2>{latestDocument.title}</h2><p>{latestDocument.detail} · сохранено {timeAgo(latestDocument.updatedAt)}.</p><PrimaryAction href={latestDocument.href}>Открыть готовый документ</PrimaryAction></SurfacePanel> : last ? <SurfacePanel className="cab-priority" label="Следующий шаг"><h2>Исходный разбор готов</h2><p>Оценка исходной версии: {last.score}/100. Ответы и новый документ будут привязаны к этому разбору.</p><PrimaryAction href={`/revenge?analysisId=${last.id}`}>Продолжить работу</PrimaryAction></SurfacePanel> : null}

      {last ? (
        <div className="cab-grid">
          <SurfacePanel label="Исходная версия · последний разбор" action={<Link href={`/session?view=${last.id}`}>открыть →</Link>}>
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
                <div className="k">оценка исходной версии</div>
              </div>
            </div>
            <SecondaryAction href={`/revenge?analysisId=${last.id}`} className="rebtn">
              {last.hasImprovement ? "Открыть новую версию и сравнение" : "Исправить резюме · пакет ToxicHR"}
            </SecondaryAction>
          </SurfacePanel>

          <div>
            <SurfacePanel className="package-status" label="Пакет ToxicHR · для показанной версии" action={<span>{packageStatus.active ? "активен" : latestDocument ? "документ доступен" : "не открыт"}</span>}>
              {packageStatus.active ? <>
                <p>Сопоставления: осталось {packageStatus.matchesRemaining} из 5</p>
                <p>Повторные проверки: осталось {packageStatus.rechecksRemaining} из 5</p>
                <p>Улучшение: {packageStatus.improvementUsed ? "использовано" : "доступно"}</p>
                <p>Адаптация под вакансию: {packageStatus.adaptationUsed ? "использована" : "доступна"}</p>
              </> : latestDocument ? <><p>Готовый документ остаётся доступен. Запись пакета для этой версии не найдена — это не ограничивает просмотр и скачивание уже созданного результата.</p><Link href={latestDocument.href}>Открыть готовый документ →</Link></> : <><p>Один пакет за 199 ₽ открывает персональную работу с этим резюме.</p><Link href={`/revenge?analysisId=${last.id}`}>Открыть пакет →</Link></>}
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
