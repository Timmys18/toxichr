"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { track } from "@/lib/analytics";
import type { MatchCategory, VacancyReview } from "@/lib/vacancy";

const LABELS: Record<MatchCategory, string> = {
  proven: "Доказано",
  hidden: "Есть, но спрятано",
  clarify: "Нужно уточнить",
  missing: "Опыта не видно",
};

export function VacancyClient({ analysisId }: { analysisId?: string }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<VacancyReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    track("vacancy_review_opened", {
      analysisId: analysisId ?? null,
      source: analysisId ? "resume_result" : "direct",
    });
  }, [analysisId]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/vacancies/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, analysisId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Ошибка разбора");
      setResult(data.result as VacancyReview);
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

  return (
    <section className="vacancy">
      <div className="intro">
        <p className="over thr-mono">Вакансия без корпоративного тумана</p>
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
      />
      {error ? <p className="error" role="alert">{error}</p> : null}
      <button className="thr-btn thr-btn-tox submit" onClick={submit} disabled={busy || text.trim().length < 80}>
        {busy ? "Разбираем требования…" : analysisId ? "Сопоставить с резюме" : "Разобрать вакансию"}
      </button>

      {result ? (
        <div className="result">
          <p className="over thr-mono">Результат</p>
          <h2>{result.title}</h2>
          <p className="summary">{result.summary}</p>

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

          {result.tailoredIntro ? (
            <div className="output"><h3>Вступление для версии под вакансию</h3><p>{result.tailoredIntro}</p></div>
          ) : null}
          {result.coverLetter ? (
            <div className="output"><h3>Основа сопроводительного письма</h3><p>{result.coverLetter}</p></div>
          ) : null}
          {result.interviewQuestions.length ? (
            <div className="output"><h3>Что могут спросить</h3><ol>{result.interviewQuestions.map((item) => <li key={item}>{item}</li>)}</ol></div>
          ) : null}
          {!analysisId ? (
            <Link href="/" className="thr-btn thr-btn-line resume-cta">Проверить моё резюме под эту роль</Link>
          ) : null}
        </div>
      ) : null}

      <style jsx>{`
        .vacancy { width: min(980px,calc(100% - 36px)); margin: 0 auto; padding: 54px 0 90px; }
        .intro { max-width: 760px; }
        .over { color: var(--tox); font-size: 10.5px; letter-spacing: .2em; text-transform: uppercase; }
        h1 { margin-top: 14px; font-size: clamp(34px,6vw,64px); line-height: 1.02; letter-spacing: -.045em; }
        .intro > p:last-child { margin-top: 18px; color: var(--dim); font-size: 17px; line-height: 1.6; }
        .vacancy > textarea { width: 100%; margin-top: 34px; padding: 20px; border: 1px solid var(--hair2); border-radius: 18px; background: var(--metal-0); color: var(--fg); font: inherit; line-height: 1.55; resize: vertical; }
        textarea:focus { outline: 1px solid var(--tox); border-color: var(--tox); }
        .submit { min-height: 54px; margin-top: 16px; padding: 0 26px; }
        .error { margin-top: 14px; color: var(--crit); }
        .result { margin-top: 52px; padding-top: 40px; border-top: 1px solid var(--hair); }
        .result > h2 { margin-top: 10px; font-size: clamp(28px,4vw,42px); }
        .summary { margin-top: 14px; color: var(--dim); line-height: 1.6; max-width: 72ch; }
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
        .signals > div,.output { padding: 22px; border: 1px solid var(--hair); border-radius: 18px; background: var(--metal-0); }
        .signals p { margin-top: 10px; color: var(--dim); font-size: 13.5px; line-height: 1.5; }
        .output { margin-top: 14px; }
        .output p,.output ol { margin-top: 12px; color: var(--dim); line-height: 1.6; }
        .output ol { padding-left: 20px; }
        .resume-cta { min-height: 50px; margin-top: 18px; padding: 0 22px; text-decoration: none; }
      `}</style>
    </section>
  );
}
