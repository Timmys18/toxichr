"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CollapsibleSection,
  CommandRail,
  EditorialSection,
  EmptyState,
  EvidenceItem,
  PageContainer,
  PageShell,
  SectionLabel,
  SummaryRail,
  VerdictBlock,
} from "@/components/ui/system";
import { track } from "@/lib/analytics";
import type { VacancyReview } from "@/lib/vacancy";
import {
  clearPendingVacancy,
  readPendingVacancy,
  savePendingVacancy,
} from "@/lib/pending-vacancy";

const MIN_VACANCY_LENGTH = 80;

function normalizeTitle(title: string) {
  return title.replace(/\s*\/\s*/g, " · ").trim();
}

function groupMissing(items: VacancyReview["requirements"]) {
  const groups = [
    {
      title: "Производство, поставщики и себестоимость",
      test: /(производ|поставщик|себестоим|маржин|фабрик|закуп|поставк)/i,
      items: [] as VacancyReview["requirements"],
    },
    {
      title: "Продукт, ассортимент и жизненный цикл",
      test: /(продукт|ассортимент|коллекц|модел|техник|спецификац|паспорт)/i,
      items: [] as VacancyReview["requirements"],
    },
    {
      title: "Международные рынки и Китай",
      test: /(китай|международ|импорт|странах|страны|зарубеж)/i,
      items: [] as VacancyReview["requirements"],
    },
    {
      title: "Операционное управление",
      test: /(контрол|календар|срок|организац|координац|процесс)/i,
      items: [] as VacancyReview["requirements"],
    },
    {
      title: "Остальные неподтверждённые требования",
      test: /./,
      items: [] as VacancyReview["requirements"],
    },
  ];

  for (const item of items) {
    const group = groups.find((entry) => entry.test.test(item.text)) ?? groups.at(-1);
    group?.items.push(item);
  }

  return groups.filter((group) => group.items.length);
}

function CopyBlock({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopyFailed(true);
      window.setTimeout(() => setCopyFailed(false), 2000);
    }
  }

  return (
    <div className="output">
      <div className="output-head">
        <h3>{title}</h3>
        <button type="button" onClick={() => void copy()}>
          {copyFailed ? "Выдели текст" : copied ? "Скопировано" : "Копировать"}
        </button>
      </div>
      <p>{text}</p>
      <style jsx>{`
        .output { margin-top: 14px; padding: 22px; border: 1px solid var(--hair); border-radius: 18px; background: var(--metal-0); }
        .output-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        h3 { font-size: 17px; }
        button { border: 1px solid var(--hair2); border-radius: 999px; background: transparent; color: var(--dim); padding: 7px 12px; font: inherit; font-size: 11.5px; cursor: pointer; }
        button:hover { color: var(--fg); border-color: var(--dim); }
        p { margin-top: 12px; color: var(--dim); line-height: 1.65; }
      `}</style>
    </div>
  );
}

export function VacancyClient({
  analysisId,
  vacancyId,
}: {
  analysisId?: string;
  vacancyId?: string;
}) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<VacancyReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(Boolean(vacancyId));
  const [savedVacancyId, setSavedVacancyId] = useState(vacancyId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [draftState, setDraftState] = useState<"idle" | "restored" | "saving" | "saved">("idle");
  const [resultStale, setResultStale] = useState(false);
  const [editorOpen, setEditorOpen] = useState(!vacancyId);

  useEffect(() => {
    track("vacancy_review_opened", {
      analysisId: analysisId ?? null,
      source: analysisId ? "resume_result" : "direct",
    });
    if (vacancyId) {
      void fetch(`/api/vacancies/${vacancyId}`)
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "Вакансия не найдена");
          setText(data.text ?? "");
          setResult((data.result as VacancyReview | null) ?? null);
          setEditorOpen(!data.result);
        })
        .catch((reason) =>
          setError(reason instanceof Error ? reason.message : "Ошибка загрузки"),
        )
        .finally(() => setLoadingSaved(false));
      return;
    }
    if (analysisId) {
      const timer = window.setTimeout(() => {
        const pending = readPendingVacancy();
        if (pending) {
          setText(pending);
          setDraftState("restored");
        }
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      const pending = readPendingVacancy();
      if (pending) {
        setText(pending);
        setDraftState("restored");
      }
      setLoadingSaved(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [analysisId, vacancyId]);

  useEffect(() => {
    if (analysisId || vacancyId || text.trim().length < MIN_VACANCY_LENGTH) return;
    const timer = window.setTimeout(() => {
      savePendingVacancy(text);
      setDraftState("saved");
    }, 350);
    return () => window.clearTimeout(timer);
  }, [analysisId, text, vacancyId]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/vacancies/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          analysisId,
          vacancyId: savedVacancyId || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Ошибка разбора");
      setResult(data.result as VacancyReview);
      setResultStale(false);
      setEditorOpen(false);
      setSavedVacancyId(data.vacancyId ?? "");
      if (analysisId) clearPendingVacancy();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ошибка разбора");
    } finally {
      setBusy(false);
    }
  }

  const review = useMemo(() => {
    if (!result) return null;
    const requirements = result.requirements.filter((item) => item.category);
    const proven = requirements.filter((item) => item.category === "proven");
    const hidden = requirements.filter((item) => item.category === "hidden");
    const clarify = requirements.filter((item) => item.category === "clarify");
    const missing = requirements.filter((item) => item.category === "missing");
    const canProve = [...hidden, ...clarify];
    const positive = proven.length + hidden.length;
    const verdict = !analysisId
      ? "Вакансия разобрана"
      : proven.length === 0
        ? "Мэтч слабый"
        : positive < Math.ceil(requirements.length / 3)
          ? "Мэтч спорный"
          : "Есть за что цепляться";

    return {
      title: normalizeTitle(result.title),
      verdict,
      proven,
      hidden,
      clarify,
      missing,
      canProve,
      missingGroups: groupMissing(missing),
      total: requirements.length,
    };
  }, [analysisId, result]);
  const textLength = text.trim().length;
  const missingChars = Math.max(0, MIN_VACANCY_LENGTH - textLength);
  const inputStatus = loadingSaved
    ? "Загружаем сохранённую вакансию…"
    : analysisId && text
      ? "Вакансия связана с этим резюме"
      : textLength === 0
        ? "Минимум 80 символов — вставь описание целиком"
        : missingChars > 0
          ? `Добавь ещё ${missingChars} симв. для точного разбора`
          : draftState === "saving"
            ? "Сохраняем черновик на этом устройстве…"
            : draftState === "saved"
              ? "Черновик сохранён на этом устройстве"
              : draftState === "restored"
                ? "Вернули сохранённый черновик"
                : "Текста достаточно для разбора";

  const showEditor = !result || editorOpen;
  const canSubmit = !loadingSaved && !busy && textLength >= MIN_VACANCY_LENGTH && (!result || resultStale);

  return (
    <PageShell>
      <PageContainer className="vacancy">
      <div className="intro">
        <div className="intro-top">
          <p className="over thr-mono">Вакансия без корпоративного тумана</p>
          <Link href="/vacancies">История вакансий →</Link>
        </div>
        <h1>{analysisId ? "Подходишь ли ты на эту роль?" : "Что здесь на самом деле хотят?"}</h1>
        <p>
          {analysisId
            ? "Сопоставим требования только с доказанным опытом из твоего резюме."
            : "Вытащим реальные требования, словесный шум и возможные красные флаги."}
        </p>
      </div>

      {result && review ? (
        <SummaryRail
          title={review.title}
          meta={<>Вакансия сохранена · {textLength} знаков</>}
          action={<button type="button" className="ds-inline-link" onClick={() => setEditorOpen((value) => !value)}>{editorOpen ? "Скрыть" : "Изменить"}</button>}
        />
      ) : null}

      {showEditor ? (
        <div className="editor">
          <textarea
            value={text}
            onChange={(event) => {
              const nextText = event.target.value;
              setText(nextText);
              if (!analysisId && !vacancyId) {
                setDraftState(
                  nextText.trim().length >= MIN_VACANCY_LENGTH ? "saving" : "idle",
                );
              }
              if (result) setResultStale(true);
            }}
            rows={10}
            placeholder="Вставь сюда текст вакансии целиком…"
            aria-label="Текст вакансии"
            maxLength={30_000}
            disabled={loadingSaved}
          />
          <div className="input-meta">
            <span aria-live="polite">{inputStatus}</span>
            <b className="thr-mono">{text.trim().length} / 30 000</b>
          </div>
        </div>
      ) : null}
      {resultStale ? (
        <p className="stale-note" role="status">
          Текст изменился. Результат ниже относится к прошлой версии.
        </p>
      ) : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      {canSubmit || (!result && showEditor) ? (
        <button className="thr-btn thr-btn-tox submit" onClick={submit} disabled={busy || !canSubmit}>
          {loadingSaved
            ? "Загружаем вакансию…"
            : busy
              ? "Разбираем требования…"
              : result
                ? "Обновить сравнение"
                : analysisId
                  ? "Сопоставить с резюме"
                  : "Разобрать вакансию"}
        </button>
      ) : null}

      {result && review ? (
        <div className="result">
          <VerdictBlock
            title={review.verdict}
            summary={result.summary}
            metrics={analysisId ? [
              { value: review.proven.length, label: "подтверждено" },
              { value: review.canProve.length, label: "можно доказать" },
              { value: review.missing.length, label: "не найдено" },
            ] : undefined}
          />

          {analysisId ? (
            <section className="flow">
              <SectionLabel>Совпадения и разрывы</SectionLabel>
              <EditorialSection title="Что работает на тебя">
                {review.proven.length || review.hidden.length ? (
                  [...review.proven, ...review.hidden].slice(0, 4).map((item) => (
                    <EvidenceItem key={item.id} title={item.text} description={item.explanation} quote={item.evidence ? `«${item.evidence}»` : undefined} />
                  ))
                ) : (
                  <EmptyState>Прямых совпадений пока нет.</EmptyState>
                )}
              </EditorialSection>
              <EditorialSection title="Что можно дотянуть">
                {review.canProve.length ? (
                  review.canProve.slice(0, 3).map((item) => (
                    <EvidenceItem key={item.id} title={item.text} description={item.explanation} />
                  ))
                ) : (
                  <EmptyState>Быстрых уточнений по этой вакансии не видно.</EmptyState>
                )}
              </EditorialSection>
              <EditorialSection title="Главный разрыв" className="break">
                <div className="break-list">
                  {review.missingGroups.length ? (
                    review.missingGroups.map((group) => (
                      <CollapsibleSection key={group.title} title={<>{group.title} <span>{group.items.length}</span></>}>
                        {group.items.map((item) => (
                          <p key={item.id}>{item.text}</p>
                        ))}
                      </CollapsibleSection>
                    ))
                  ) : (
                    <EmptyState>Критичных неподтверждённых требований нет.</EmptyState>
                  )}
                </div>
              </EditorialSection>
            </section>
          ) : (
            <section className="flow">
              <SectionLabel>Разбор вакансии</SectionLabel>
              <EditorialSection title="Что реально требуется">
                  {result.requirements.map((item) => (
                    <EvidenceItem key={item.id} title={item.text} description={item.explanation} />
                  ))}
              </EditorialSection>
            </section>
          )}

          <section className="response">
            <SectionLabel>Что делать с откликом</SectionLabel>
            {(result.redFlags.length || result.corporateWater.length) ? (
              <CollapsibleSection title="Риски и словесный шум">
                {result.redFlags.map((item) => <p key={item}>{item}</p>)}
                {result.corporateWater.map((item) => <p key={item}>{item}</p>)}
              </CollapsibleSection>
            ) : null}
            {result.tailoredIntro ? (
              <CollapsibleSection title="Вступление для версии под вакансию">
                <CopyBlock title="Вступление" text={result.tailoredIntro} />
              </CollapsibleSection>
            ) : null}
            {result.coverLetter ? (
              <CollapsibleSection title="Основа сопроводительного письма">
                <CopyBlock title="Письмо" text={result.coverLetter} />
              </CollapsibleSection>
            ) : null}
            {result.interviewQuestions.length ? (
              <CollapsibleSection title="Что могут спросить">
                <ol>{result.interviewQuestions.map((item) => <li key={item}>{item}</li>)}</ol>
              </CollapsibleSection>
            ) : null}
          </section>

          <CommandRail
            primary={!analysisId ? (
              <Link href="/?from=vacancy" onClick={() => savePendingVacancy(text)}>
                Добавить резюме и сопоставить →
              </Link>
            ) : (
              <Link href={`/revenge?analysisId=${analysisId}`}>
                Адаптировать резюме под вакансию →
              </Link>
            )}
            hint="Только на основании подтверждённого опыта"
            secondary={<button type="button" className="ds-inline-link" onClick={() => { setResult(null); setEditorOpen(true); }}>
              Сравнить с другой вакансией
            </button>}
          />
        </div>
      ) : null}

      <style jsx>{`
        .vacancy { padding: 64px 0 110px; }
        .intro { max-width: 980px; }
        .intro-top { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
        .intro-top :global(a) { color: var(--faint); font-size: 13px; text-decoration: none; }
        .intro-top :global(a):hover { color: var(--fg); }
        .over { color: var(--tox); font-size: 10.5px; letter-spacing: .16em; text-transform: uppercase; }
        h1 { margin-top: 16px; font-size: clamp(42px,5.2vw,72px); line-height: .98; letter-spacing: -.05em; }
        .intro > p:last-child { max-width: 56ch; margin-top: 18px; color: var(--dim); font-size: 18px; line-height: 1.55; }
        .vacancy-strip { display: flex; align-items: center; gap: 22px; min-height: 70px; margin-top: 42px; padding: 0 4px; border-top: 1px solid var(--hair); border-bottom: 1px solid var(--hair); }
        .vacancy-strip b { font-size: 24px; letter-spacing: -.02em; }
        .vacancy-strip span { color: var(--dim); font-size: 15px; }
        .vacancy-strip button,.bottom-rail button { border: 0; background: transparent; color: var(--tox); font: 650 13px var(--font-sans); cursor: pointer; }
        .editor { margin-top: 28px; }
        textarea { width: 100%; min-height: 260px; padding: 20px; border: 1px solid var(--hair2); border-radius: 8px; background: var(--metal-0); color: var(--fg); font: inherit; line-height: 1.55; resize: vertical; }
        textarea:focus { outline: 1px solid var(--tox); border-color: var(--tox); }
        .input-meta { display: flex; justify-content: space-between; gap: 16px; margin-top: 9px; color: var(--faint); font-size: 12px; }
        .input-meta b { font-weight: 400; font-size: 10px; }
        .submit { min-height: 54px; margin-top: 18px; padding: 0 26px; }
        .error { margin-top: 14px; color: var(--crit); }
        .stale-note { width: fit-content; margin-top: 12px; color: #f0bd70; font-size: 13px; line-height: 1.45; }
        .result { margin-top: 34px; }
        .verdict { display: grid; grid-template-columns: minmax(0,1fr) minmax(500px, .9fr); gap: 80px; align-items: end; padding: 58px 0 52px; border-bottom: 1px solid var(--hair); }
        .verdict h2 { margin-top: 14px; font-size: clamp(50px,5.5vw,86px); line-height: .96; letter-spacing: -.055em; }
        .summary { max-width: 72ch; margin-top: 20px; color: var(--dim); font-size: 21px; line-height: 1.5; }
        .stats { display: grid; grid-template-columns: repeat(3,1fr); border-top: 1px solid var(--hair); border-bottom: 1px solid var(--hair); }
        .stats span { display: flex; flex-direction: column; gap: 10px; padding: 20px 18px 22px 0; color: var(--dim); font-size: 15px; line-height: 1.3; }
        .stats span + span { padding-left: 18px; border-left: 1px solid var(--hair); }
        .stats b { color: var(--fg); font-size: 52px; line-height: 1; }
        .flow,.response { padding: 42px 0 0; }
        .lane { display: block; min-height: 80px; padding: 34px 0; border-bottom: 1px solid var(--hair); }
        .lane h3,.response summary { font-size: 26px; line-height: 1.2; letter-spacing: -.025em; }
        .lane h3 { float: left; width: 300px; margin-right: 64px; }
        .lane > article,.lane > .empty,.lane > .break-list { margin-left: 364px; }
        article { padding-bottom: 18px; margin-bottom: 18px; border-bottom: 1px solid rgba(242,244,245,.1); }
        article:last-child { padding-bottom: 0; margin-bottom: 0; border-bottom: 0; }
        article b { font-size: 19px; line-height: 1.45; }
        article p,.break details p,.response p,.response li { margin-top: 9px; color: var(--dim); font-size: 16px; line-height: 1.6; }
        blockquote { margin-top: 12px; padding-left: 14px; border-left: 2px solid var(--tox); color: var(--faint); font-size: 15px; line-height: 1.55; }
        .empty { color: var(--faint); font-size: 15px; line-height: 1.5; }
        details { padding: 18px 0; border-bottom: 1px solid var(--hair); }
        details:first-of-type { padding-top: 0; }
        summary { cursor: pointer; list-style: none; }
        summary::-webkit-details-marker { display: none; }
        .break details { padding: 14px 0; }
        .break summary { display: flex; justify-content: space-between; gap: 20px; color: var(--fg); font-size: 16px; }
        .break summary span { color: var(--tox); }
        .response > .over { display: block; margin-bottom: 18px; }
        .response ol { margin-top: 12px; padding-left: 20px; }
        .response :global(.output) { margin-top: 14px; border: 0; border-radius: 0; background: transparent; padding: 0; }
        .bottom-rail { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px 24px; align-items: center; margin-top: 46px; padding: 24px 0; border-top: 1px solid var(--hair); border-bottom: 1px solid var(--hair); }
        .bottom-rail :global(a) { color: var(--tox); font-size: 22px; font-weight: 750; letter-spacing: -.02em; text-decoration: none; }
        .bottom-rail span { grid-column: 1; color: var(--faint); font-size: 13px; }
        .bottom-rail button { grid-column: 2; grid-row: 1 / span 2; color: var(--faint); }
        .bottom-rail button:hover { color: var(--fg); }
        @media (max-width: 820px) {
          .vacancy { padding-top: 34px; }
          .intro-top { align-items: flex-start; flex-direction: column; gap: 10px; }
          h1 { font-size: clamp(34px,10.5vw,48px); line-height: 1.02; }
          .intro > p:last-child,.summary { font-size: 16px; }
          .vacancy-strip { align-items: flex-start; flex-direction: column; }
          textarea { min-height: 230px; padding: 17px; }
          .input-meta { align-items: flex-start; font-size: 11px; line-height: 1.35; }
          .submit { width: 100%; margin-top: 14px; }
          .verdict { grid-template-columns: 1fr; gap: 28px; padding-top: 32px; }
          .stats { border-top: 0; }
          .stats b { font-size: 40px; }
          .lane { min-height: 0; }
          .lane h3 { float: none; width: auto; margin: 0 0 16px; }
          .lane > article,.lane > .empty,.lane > .break-list { margin-left: 0; }
          .bottom-rail { grid-template-columns: 1fr; }
          .bottom-rail button { grid-column: 1; grid-row: auto; justify-self: start; padding: 0; }
        }
      `}</style>
      </PageContainer>
    </PageShell>
  );
}
