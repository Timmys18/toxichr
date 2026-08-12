"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { track } from "@/lib/analytics";
import type { MatchCategory, VacancyReview } from "@/lib/vacancy";
import {
  clearPendingVacancy,
  readPendingVacancy,
  savePendingVacancy,
} from "@/lib/pending-vacancy";

const LABELS: Record<MatchCategory, string> = {
  proven: "Доказано",
  hidden: "Есть, но спрятано",
  clarify: "Нужно уточнить",
  missing: "Опыта не видно",
};

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
        if (pending) setText(pending);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      const pending = readPendingVacancy();
      if (pending) setText(pending);
      setLoadingSaved(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [analysisId, vacancyId]);

  useEffect(() => {
    if (analysisId || vacancyId || text.trim().length < 80) return;
    const timer = window.setTimeout(() => savePendingVacancy(text), 350);
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
      setSavedVacancyId(data.vacancyId ?? "");
      if (analysisId) clearPendingVacancy();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ошибка разбора");
    } finally {
      setBusy(false);
    }
  }

  const groups = result
    ? (["proven", "hidden", "clarify", "missing"] as const).map(
        (category) => ({
          category,
          items: result.requirements.filter((item) => item.category === category),
        }),
      )
    : [];
  const strongMatches = result?.requirements.filter(
    (item) => item.category === "proven" || item.category === "hidden",
  ).length ?? 0;
  const matchTotal = result?.requirements.filter((item) => item.category).length ?? 0;

  return (
    <section className="vacancy">
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

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={14}
        placeholder="Вставь сюда текст вакансии целиком…"
        aria-label="Текст вакансии"
        maxLength={30_000}
        disabled={loadingSaved}
      />
      <div className="input-meta">
        <span>{analysisId && text ? "Сохранённая вакансия уже здесь" : "Можно вставить весь текст без очистки"}</span>
        <b className="thr-mono">{text.trim().length} / 30 000</b>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <button className="thr-btn thr-btn-tox submit" onClick={submit} disabled={loadingSaved || busy || text.trim().length < 80}>
        {loadingSaved
          ? "Загружаем вакансию…"
          : busy
            ? "Разбираем требования…"
            : result
              ? "Пересчитать результат"
              : analysisId
                ? "Сопоставить с резюме"
                : "Разобрать вакансию"}
      </button>

      {result ? (
        <div className="result">
          <p className="over thr-mono">Результат</p>
          <h2>{result.title}</h2>
          <p className="summary">{result.summary}</p>
          {savedVacancyId ? (
            <p className="saved-note" role="status">Сохранено в истории вакансий</p>
          ) : null}

          {analysisId && matchTotal ? (
            <div className="match-score">
              <b>{strongMatches}</b>
              <span>из {matchTotal} требований уже подтверждены или спрятаны в тексте</span>
            </div>
          ) : null}

          {analysisId ? (
            <div className="groups">
              {groups.map((group) => (
                <section key={group.category} className={`group ${group.category}`}>
                  <h3>{LABELS[group.category]} <span>{group.items.length}</span></h3>
                  {group.items.length ? group.items.map((item) => (
                    <article key={item.id}>
                      <b>{item.text}</b>
                      <p>{item.explanation}</p>
                      {item.evidence ? <blockquote>«{item.evidence}»</blockquote> : null}
                    </article>
                  )) : <p className="empty">Пока пусто.</p>}
                </section>
              ))}
            </div>
          ) : (
            <div className="requirements">
              {result.requirements.map((item) => (
                <article key={item.id}><b>{item.text}</b><p>{item.explanation}</p></article>
              ))}
            </div>
          )}

          {(result.redFlags.length || result.corporateWater.length) ? (
            <div className="signals">
              <div><h3>Красные флаги</h3>{result.redFlags.map((item) => <p key={item}>{item}</p>)}</div>
              <div><h3>Словесный шум</h3>{result.corporateWater.map((item) => <p key={item}>{item}</p>)}</div>
            </div>
          ) : null}

          {result.tailoredIntro ? <CopyBlock title="Вступление для версии под вакансию" text={result.tailoredIntro} /> : null}
          {result.coverLetter ? <CopyBlock title="Основа сопроводительного письма" text={result.coverLetter} /> : null}
          {result.interviewQuestions.length ? (
            <div className="output"><h3>Что могут спросить</h3><ol>{result.interviewQuestions.map((item) => <li key={item}>{item}</li>)}</ol></div>
          ) : null}
          {!analysisId ? (
            <Link
              href="/?from=vacancy"
              className="thr-btn thr-btn-tox resume-cta"
              onClick={() => savePendingVacancy(text)}
            >
              Добавить резюме и сопоставить
            </Link>
          ) : (
            <Link href={`/revenge?analysisId=${analysisId}`} className="thr-btn thr-btn-line resume-cta">
              Усилить резюме по найденным пробелам
            </Link>
          )}
        </div>
      ) : null}

      <style jsx>{`
        .vacancy { width: min(980px,calc(100% - 36px)); margin: 0 auto; padding: 54px 0 90px; }
        .intro { max-width: 760px; }
        .intro-top { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
        .intro-top :global(a) { color: var(--faint); font-size: 12px; text-decoration: none; }
        .intro-top :global(a):hover { color: var(--fg); }
        .over { color: var(--tox); font-size: 10.5px; letter-spacing: .2em; text-transform: uppercase; }
        h1 { margin-top: 14px; font-size: clamp(34px,6vw,64px); line-height: 1.02; letter-spacing: -.045em; }
        .intro > p:last-child { margin-top: 18px; color: var(--dim); font-size: 17px; line-height: 1.6; }
        .vacancy > textarea { width: 100%; margin-top: 34px; padding: 20px; border: 1px solid var(--hair2); border-radius: 18px; background: var(--metal-0); color: var(--fg); font: inherit; line-height: 1.55; resize: vertical; }
        textarea:focus { outline: 1px solid var(--tox); border-color: var(--tox); }
        .input-meta { display: flex; justify-content: space-between; gap: 16px; margin-top: 9px; color: var(--faint); font-size: 11.5px; }
        .input-meta b { font-weight: 400; font-size: 10px; }
        .submit { min-height: 54px; margin-top: 18px; padding: 0 26px; }
        .error { margin-top: 14px; color: var(--crit); }
        .result { margin-top: 52px; padding-top: 40px; border-top: 1px solid var(--hair); }
        .result > h2 { margin-top: 10px; font-size: clamp(28px,4vw,42px); }
        .summary { margin-top: 14px; color: var(--dim); line-height: 1.6; max-width: 72ch; }
        .saved-note { width: fit-content; margin-top: 14px; padding: 7px 11px; border-radius: 999px; color: var(--tox); background: var(--tox-dim); font: 10px var(--font-mono); letter-spacing: .08em; text-transform: uppercase; }
        .match-score { display: flex; align-items: center; gap: 15px; margin-top: 22px; padding: 18px 20px; border: 1px solid rgba(44,224,139,.28); border-radius: 16px; background: rgba(44,224,139,.06); }
        .match-score b { color: var(--tox); font-size: 32px; line-height: 1; }
        .match-score span { max-width: 42ch; color: var(--dim); font-size: 13px; line-height: 1.45; }
        .groups { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 30px; }
        @media (max-width: 760px) { .groups { grid-template-columns: 1fr; } }
        .group { padding: 20px; border: 1px solid var(--hair); border-radius: 18px; background: var(--metal-0); }
        .group.proven { border-color: color-mix(in srgb,var(--tox) 45%,var(--hair)); }
        .group.missing { border-color: color-mix(in srgb,var(--crit) 45%,var(--hair)); }
        .group h3,.signals h3,.output h3 { font-size: 17px; }
        .group h3 span { margin-left: 6px; color: var(--faint); }
        .group article,.requirements article { padding: 16px 0; border-bottom: 1px solid var(--hair); }
        .group article:last-child,.requirements article:last-child { border-bottom: 0; }
        .group b,.requirements b { font-size: 14px; line-height: 1.45; }
        .group article p,.requirements article p { margin-top: 7px; color: var(--dim); font-size: 13px; line-height: 1.5; }
        blockquote { margin-top: 9px; padding-left: 10px; border-left: 2px solid var(--tox); color: var(--faint); font-size: 12.5px; line-height: 1.45; }
        .empty { margin-top: 18px; color: var(--faint); font-size: 13px; }
        .requirements { margin-top: 26px; padding: 8px 22px; border: 1px solid var(--hair); border-radius: 18px; background: var(--metal-0); }
        .signals { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 18px; }
        @media (max-width: 700px) { .signals { grid-template-columns: 1fr; } }
        .signals > div { padding: 22px; border: 1px solid var(--hair); border-radius: 18px; background: var(--metal-0); }
        .signals p { margin-top: 10px; color: var(--dim); font-size: 13.5px; line-height: 1.5; }
        .result > .output { margin-top: 14px; padding: 22px; border: 1px solid var(--hair); border-radius: 18px; background: var(--metal-0); }
        .output ol { margin-top: 12px; padding-left: 20px; color: var(--dim); line-height: 1.6; }
        .resume-cta { min-height: 50px; margin-top: 18px; padding: 0 22px; text-decoration: none; }
        @media (max-width: 520px) { .intro-top { align-items: flex-start; flex-direction: column; gap: 10px; } }
      `}</style>
    </section>
  );
}
