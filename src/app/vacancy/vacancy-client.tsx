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
  PrimaryAction,
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
    <div className="ds-copy-output">
      <div className="ds-copy-output-head">
        <h3>{title}</h3>
        <button type="button" onClick={() => void copy()}>
          {copyFailed ? "Выдели текст" : copied ? "Скопировано" : "Копировать"}
        </button>
      </div>
      <p>{text}</p>
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
    <PageContainer className="ds-comparison">
      <div className="ds-comparison-intro">
        <div className="ds-comparison-intro-top">
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
        <div className="ds-comparison-editor">
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
          <div className="ds-comparison-input-meta">
            <span aria-live="polite">{inputStatus}</span>
            <b className="thr-mono">{text.trim().length} / 30 000</b>
          </div>
        </div>
      ) : null}
      {resultStale ? (
        <p className="ds-comparison-stale-note" role="status">
          Текст изменился. Результат ниже относится к прошлой версии.
        </p>
      ) : null}
      {error ? <p className="ds-comparison-error" role="alert">{error}</p> : null}
      {canSubmit || (!result && showEditor) ? (
        <PrimaryAction className="ds-comparison-submit" onClick={submit} disabled={busy || !canSubmit}>
          {loadingSaved
            ? "Загружаем вакансию…"
            : busy
              ? "Разбираем требования…"
              : result
                ? "Обновить сравнение"
                : analysisId
                  ? "Сопоставить с резюме"
                  : "Разобрать вакансию"}
        </PrimaryAction>
      ) : null}

      {result && review ? (
        <div className="ds-comparison-result">
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
            <section className="ds-comparison-flow">
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
            <section className="ds-comparison-flow">
              <SectionLabel>Разбор вакансии</SectionLabel>
              <EditorialSection title="Что реально требуется">
                  {result.requirements.map((item) => (
                    <EvidenceItem key={item.id} title={item.text} description={item.explanation} />
                  ))}
              </EditorialSection>
            </section>
          )}

          <section className="ds-comparison-response">
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

    </PageContainer>
  );
}
