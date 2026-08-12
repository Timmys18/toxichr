"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { track } from "@/lib/analytics";

type Question = {
  problemId: string;
  title: string;
  quote: string;
  question: string;
  prompts: string[];
};

type Replacement = {
  problemId: string;
  original: string;
  replacement: string;
  grounded: boolean;
};

type Result = {
  ready: boolean;
  beforeScore: number;
  afterScore: number | null;
  replacements: Replacement[];
  improvedText: string;
};

export function RevengeClient({ analysisId }: { analysisId: string }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [beforeScore, setBeforeScore] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    track("resume_fix_opened", { analysisId });
    let localAnswers: Record<string, string> = {};
    try {
      localAnswers = JSON.parse(
        window.localStorage.getItem(`toxichr:revenge:${analysisId}`) ?? "{}",
      ) as Record<string, string>;
    } catch {
      localAnswers = {};
    }
    void fetch(`/api/improvements/${analysisId}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Разбор не найден");
        setQuestions(data.questions);
        setBeforeScore(data.beforeScore);
        let savedAnswers: Record<string, string> = {};
        if (Array.isArray(data.improvement?.answers)) {
          savedAnswers = Object.fromEntries(
            data.improvement.answers.map(
              (item: { problemId: string; answer: string }) => [
                item.problemId,
                item.answer,
              ],
            ),
          );
        }
        setAnswers({ ...localAnswers, ...savedAnswers });
        if (data.improvement?.ready) {
          setResult({
            ready: true,
            beforeScore: data.beforeScore,
            afterScore: data.improvement.afterScore,
            replacements: data.improvement.replacements ?? [],
            improvedText: data.improvement.improvedText ?? "",
          });
        }
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "Ошибка загрузки"),
      )
      .finally(() => setLoading(false));
  }, [analysisId]);

  useEffect(() => {
    if (loading) return;
    window.localStorage.setItem(
      `toxichr:revenge:${analysisId}`,
      JSON.stringify(answers),
    );
  }, [analysisId, answers, loading]);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/improvements/${analysisId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: questions.map((question) => ({
            problemId: question.problemId,
            answer: answers[question.problemId] ?? "",
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Не удалось собрать версию");
      setResult(data as Result);
      window.setTimeout(
        () => document.getElementById("revenge-result")?.scrollIntoView({ behavior: "smooth" }),
        80,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="revenge-state">Готовим вопросы…</div>;

  const current = questions[currentStep];
  const answeredCount = questions.filter(
    (question) => (answers[question.problemId] ?? "").trim().length > 0,
  ).length;

  return (
    <section className="revenge">
      <div className="intro">
        <p className="over thr-mono">Реванш</p>
        <h1>Теперь исправим то, что HR разнёс.</h1>
        <p>
          Ответь только фактами. Если точной цифры не помнишь — не придумывай:
          сервис соберёт честную формулировку без неё.
        </p>
      </div>

      {current ? (
        <div className="questions">
          <div className="progress-head">
            <span className="thr-mono">Вопрос {currentStep + 1} из {questions.length}</span>
            <span>{answeredCount} заполнено · черновик сохраняется</span>
          </div>
          <div className="progress" aria-hidden>
            <i style={{ width: `${((currentStep + 1) / questions.length) * 100}%` }} />
          </div>
          <article key={current.problemId}>
            <div className="qnum thr-mono">{String(currentStep + 1).padStart(2, "0")}</div>
            <h2>{current.title}</h2>
            <blockquote>«{current.quote}»</blockquote>
            <p className="ask">{current.question}</p>
            <ul>
              {current.prompts.map((prompt) => (
                <li key={prompt}>{prompt}</li>
              ))}
            </ul>
            <textarea
              value={answers[current.problemId] ?? ""}
              onChange={(event) =>
                setAnswers((stored) => ({
                  ...stored,
                  [current.problemId]: event.target.value,
                }))
              }
              placeholder="Напиши факты обычными словами — литературный стиль не нужен."
              rows={6}
              aria-label={`Ответ: ${current.title}`}
              autoFocus
            />
          </article>
          <div className="step-actions">
            <button
              type="button"
              className="thr-btn thr-btn-line"
              onClick={() => setCurrentStep((step) => Math.max(0, step - 1))}
              disabled={currentStep === 0}
            >
              Назад
            </button>
            {currentStep < questions.length - 1 ? (
              <button
                type="button"
                className="thr-btn thr-btn-tox"
                onClick={() => setCurrentStep((step) => Math.min(questions.length - 1, step + 1))}
              >
                {answers[current.problemId]?.trim() ? "Дальше" : "Пропустить"}
              </button>
            ) : (
              <button
                type="button"
                className="thr-btn thr-btn-tox"
                onClick={() => void submit()}
                disabled={saving || answeredCount === 0}
              >
                {saving ? "Собираем новую версию…" : result ? "Пересобрать версию" : "Собрать резюме"}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {error ? <p className="error" role="alert">{error}</p> : null}

      {result ? (
        <div className="result" id="revenge-result">
          <div className="scores">
            <span><b>{beforeScore}</b> было</span>
            <i>→</i>
            <span className="after"><b>{result.afterScore ?? "—"}</b> стало</span>
          </div>
          <h2>Что изменилось</h2>
          <div className="replacements">
            {result.replacements.map((replacement) => (
              <article key={replacement.problemId}>
                <p className="old">Было: {replacement.original}</p>
                <p className="new">Стало: {replacement.replacement}</p>
              </article>
            ))}
          </div>
          <div className="exports">
            <a className="thr-btn thr-btn-tox" href={`/api/improvements/${analysisId}/docx`}>
              Скачать DOCX
            </a>
            <Link className="thr-btn thr-btn-line" href={`/revenge/${analysisId}/print`} target="_blank">
              Открыть PDF / печать
            </Link>
            <Link className="thr-btn vacancy-next" href={`/vacancy?analysisId=${analysisId}`}>
              Проверить под вакансию →
            </Link>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .revenge { width: min(860px,calc(100% - 36px)); margin: 0 auto; padding: 54px 0 90px; }
        .intro { max-width: 700px; }
        .over { color: var(--tox); font-size: 11px; letter-spacing: .2em; text-transform: uppercase; }
        h1 { margin-top: 14px; font-size: clamp(34px,6vw,64px); line-height: 1.02; letter-spacing: -.045em; }
        .intro > p:last-child { margin-top: 20px; color: var(--dim); font-size: 17px; line-height: 1.6; }
        .questions { display: grid; gap: 16px; margin-top: 42px; }
        .progress-head { display: flex; justify-content: space-between; gap: 18px; color: var(--faint); font-size: 11.5px; }
        .progress-head .thr-mono { color: var(--tox); font-size: 10px; letter-spacing: .12em; text-transform: uppercase; }
        .progress { height: 3px; overflow: hidden; border-radius: 999px; background: var(--hair); }
        .progress i { display: block; height: 100%; border-radius: inherit; background: var(--tox); transition: width .35s var(--ease); }
        .questions article { padding: 26px; border: 1px solid var(--hair); border-radius: 20px; background: var(--metal-0); }
        .qnum { color: var(--tox); font-size: 11px; }
        article h2 { margin-top: 8px; font-size: 22px; }
        blockquote { margin-top: 14px; padding-left: 14px; border-left: 2px solid var(--crit); color: var(--dim); line-height: 1.5; }
        .ask { margin-top: 20px; font-weight: 650; }
        ul { margin: 12px 0 0 18px; color: var(--faint); font-size: 13px; line-height: 1.7; }
        textarea { width: 100%; margin-top: 18px; padding: 16px; border: 1px solid var(--hair2); border-radius: 14px; background: var(--metal-1); color: var(--fg); font: inherit; line-height: 1.5; resize: vertical; }
        textarea:focus { outline: 1px solid var(--tox); border-color: var(--tox); }
        .step-actions { display: flex; justify-content: space-between; gap: 12px; }
        .step-actions :global(.thr-btn) { min-width: 126px; min-height: 50px; padding: 0 22px; }
        .error { margin-top: 18px; color: var(--crit); }
        .result { margin-top: 50px; padding-top: 40px; border-top: 1px solid var(--hair); }
        .scores { display: flex; align-items: center; gap: 18px; }
        .scores span { display: flex; flex-direction: column; color: var(--faint); }
        .scores b { font-size: 46px; color: var(--crit); }
        .scores .after b { color: var(--tox); }
        .scores i { color: var(--dim); font-size: 28px; }
        .result > h2 { margin-top: 34px; font-size: 28px; }
        .replacements { display: grid; gap: 12px; margin-top: 18px; }
        .replacements article { padding: 20px; border: 1px solid var(--hair); border-radius: 16px; background: var(--metal-0); }
        .old { color: var(--faint); text-decoration: line-through; line-height: 1.5; }
        .new { margin-top: 12px; color: var(--fg); line-height: 1.55; }
        .exports { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 24px; }
        .exports :global(.thr-btn) { min-height: 50px; padding: 0 22px; text-decoration: none; }
        .exports :global(.vacancy-next) { color: var(--data); border: 1px solid rgba(106,155,255,.3); background: rgba(106,155,255,.07); }
        .revenge-state { margin: 80px auto; color: var(--dim); }
        @media (max-width: 560px) {
          .progress-head { align-items: flex-end; }
          .progress-head span:last-child { max-width: 18ch; text-align: right; }
          .questions article { padding: 22px 18px; }
          .step-actions :global(.thr-btn) { min-width: 0; flex: 1; }
        }
      `}</style>
    </section>
  );
}
