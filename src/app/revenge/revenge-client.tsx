"use client";

import { useCallback, useEffect, useState } from "react";
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

type ResultView = "changes" | "compare" | "editor";
type AccessState = {
  loading: boolean;
  paywallEnabled: boolean;
  hasPackage: boolean;
  priceRub: number;
  improvementAvailable: boolean;
  improvementUsed: boolean;
};

export function RevengeClient({ analysisId }: { analysisId: string }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [, setBeforeScore] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [originalText, setOriginalText] = useState("");
  const [editorText, setEditorText] = useState("");
  const [savedEditorText, setSavedEditorText] = useState("");
  const [resultView, setResultView] = useState<ResultView>("changes");
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorMessage, setEditorMessage] = useState<string | null>(null);
  const [restoredAnswersCount, setRestoredAnswersCount] = useState(0);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [access, setAccess] = useState<AccessState>({
    loading: true,
    paywallEnabled: false,
    hasPackage: true,
    priceRub: 199,
    improvementAvailable: true,
    improvementUsed: false,
  });

  const refreshAccess = useCallback(async () => {
    const response = await fetch(`/api/payments/access?analysisId=${encodeURIComponent(analysisId)}`, {
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Не удалось проверить доступ");
    const next = {
      loading: false,
      paywallEnabled: Boolean(data.paywallEnabled),
      hasPackage: Boolean(data.hasPackage),
      priceRub: Number(data.priceRub) || 199,
      improvementAvailable: Boolean(data.improvementAvailable),
      improvementUsed: Boolean(data.improvementUsed),
    };
    setAccess(next);
    return next;
  }, [analysisId]);

  useEffect(() => {
    track("fix_started", { analysisId });
    let cancelled = false;

    try {
      const stored = JSON.parse(
        window.localStorage.getItem(`toxichr:revenge:${analysisId}`) ?? "{}",
      ) as Record<string, string>;
      setAnswers(stored);
    } catch {
      // Новый чистый черновик.
    }

    void Promise.all([
      fetch(`/api/improvements/${analysisId}`).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Разбор не найден");
        if (cancelled) return;

        setQuestions(data.questions);
        setBeforeScore(data.beforeScore);
        setOriginalText(data.originalText ?? "");

        let localAnswers: Record<string, string> = {};
        try {
          localAnswers = JSON.parse(
            window.localStorage.getItem(`toxichr:revenge:${analysisId}`) ?? "{}",
          ) as Record<string, string>;
        } catch {
          localAnswers = {};
        }

        const savedAnswers = Array.isArray(data.improvement?.answers)
          ? Object.fromEntries(
              data.improvement.answers.map((item: { problemId: string; answer: string }) => [
                item.problemId,
                item.answer,
              ]),
            )
          : {};
        const merged = { ...localAnswers, ...savedAnswers };
        setAnswers(merged);

        const restored = data.questions.filter(
          (question: Question) => (merged[question.problemId] ?? "").trim(),
        ).length;
        setRestoredAnswersCount(restored);
        if (restored > 0 && restored < data.questions.length) {
          const firstEmpty = data.questions.findIndex(
            (question: Question) => !(merged[question.problemId] ?? "").trim(),
          );
          setCurrentStep(Math.max(0, firstEmpty));
        }

        if (data.improvement?.ready) {
          const serverText = data.improvement.improvedText ?? "";
          let draftText = serverText;
          try {
            draftText = window.localStorage.getItem(`toxichr:editor:${analysisId}`) || serverText;
          } catch {
            draftText = serverText;
          }
          setResult({
            ready: true,
            beforeScore: data.beforeScore,
            afterScore: data.improvement.afterScore,
            replacements: data.improvement.replacements ?? [],
            improvedText: serverText,
          });
          setEditorText(draftText);
          setSavedEditorText(serverText);
        }
      }),
      refreshAccess(),
    ])
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Ошибка загрузки");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [analysisId, refreshAccess]);

  useEffect(() => {
    if (loading) return;
    try {
      window.localStorage.setItem(`toxichr:revenge:${analysisId}`, JSON.stringify(answers));
    } catch {
      // Ответы остаются в текущей вкладке.
    }
  }, [analysisId, answers, loading]);

  useEffect(() => {
    if (!result || !editorText) return;
    try {
      window.localStorage.setItem(`toxichr:editor:${analysisId}`, editorText);
    } catch {
      // Серверное сохранение остаётся доступно.
    }
  }, [analysisId, editorText, result]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("payment") !== "return") return;

    let cancelled = false;
    let attempt = 0;
    async function poll() {
      while (!cancelled && attempt < 6) {
        attempt += 1;
        const current = await refreshAccess().catch(() => null);
        if (current?.hasPackage) {
          setPaywallOpen(false);
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
      }
    }
    void poll();
    return () => {
      cancelled = true;
    };
  }, [refreshAccess]);

  const hasUnsavedEditorChanges = Boolean(
    result && editorText.trim() !== savedEditorText.trim(),
  );

  useEffect(() => {
    if (!hasUnsavedEditorChanges) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedEditorChanges]);

  const answeredCount = questions.filter(
    (question) => (answers[question.problemId] ?? "").trim().length > 0,
  ).length;
  const current = questions[currentStep];

  function openPaywall() {
    setPaywallOpen(true);
    track("paywall_viewed", {
      analysisId,
      priceRub: access.priceRub,
      answeredCount,
    });
  }

  async function submit() {
    if (access.loading) return;
    if (access.paywallEnabled && !access.hasPackage) {
      openPaywall();
      return;
    }

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
      if (response.status === 402 || data.paymentRequired) {
        openPaywall();
        return;
      }
      if (!response.ok) throw new Error(data.error ?? "Не удалось собрать версию");

      setResult(data as Result);
      setEditorText(data.improvedText ?? "");
      setSavedEditorText(data.improvedText ?? "");
      setResultView("changes");
      await refreshAccess().catch(() => undefined);
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

  async function checkout() {
    if (checkoutBusy) return;
    setCheckoutBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Не удалось начать оплату");
      if (data.access) {
        await refreshAccess();
        setPaywallOpen(false);
        return;
      }
      if (!data.checkoutUrl) throw new Error("Не получили ссылку на оплату");
      window.location.assign(data.checkoutUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ошибка оплаты");
      setCheckoutBusy(false);
    }
  }

  async function saveEditor() {
    if (!result || editorText.trim().length < 80) return;
    setEditorSaving(true);
    setEditorMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/improvements/${analysisId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ improvedText: editorText }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Не удалось сохранить текст");
      setSavedEditorText(data.improvedText);
      setEditorText(data.improvedText);
      setResult((previous) => previous ? { ...previous, improvedText: data.improvedText, afterScore: data.afterScore } : previous);
      setEditorMessage("Сохранено. DOCX, PDF и проверка вакансией используют эту версию.");
      try {
        window.localStorage.setItem(`toxichr:editor:${analysisId}`, data.improvedText);
      } catch {
        // Сервер уже сохранил версию.
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ошибка сохранения");
    } finally {
      setEditorSaving(false);
    }
  }

  if (loading) return <div className="revenge-state">Готовим вопросы…</div>;

  return (
    <section className="revenge">
      <div className="intro">
        <p className="over thr-mono">Реванш</p>
        <h1>Теперь исправим то, что HR разнёс.</h1>
        <p>Ответь только фактами. Если точной цифры не помнишь — не придумывай: сервис соберёт честную формулировку без неё.</p>
        <div className="deal">
          <span className="thr-mono">Бета</span>
          <b>Новая версия входит в пакет ToxicHR за {access.priceRub} ₽.</b>
          <small>{access.improvementUsed ? "Улучшение уже использовано для этого резюме." : "Одно улучшение, без подписки и доплат."}</small>
        </div>
      </div>

      {restoredAnswersCount > 0 && !result ? (
        <div className="restored" role="status"><b>Черновик на месте.</b> Вернули ответов: {restoredAnswersCount}. Продолжаем с первого незаполненного вопроса.</div>
      ) : null}

      {current && !result ? (
        <div className="questions">
          <div className="progress-head">
            <span className="thr-mono">Вопрос {currentStep + 1} из {questions.length}</span>
            <span>{answeredCount} заполнено · черновик сохраняется</span>
          </div>
          <div className="progress" aria-hidden><i style={{ width: `${((currentStep + 1) / questions.length) * 100}%` }} /></div>
          <article key={current.problemId}>
            <div className="qnum thr-mono">{String(currentStep + 1).padStart(2, "0")}</div>
            <h2>{current.title}</h2>
            <blockquote>«{current.quote}»</blockquote>
            <p className="ask">{current.question}</p>
            <ul>{current.prompts.map((prompt) => <li key={prompt}>{prompt}</li>)}</ul>
            <textarea
              value={answers[current.problemId] ?? ""}
              onChange={(event) => setAnswers((stored) => ({ ...stored, [current.problemId]: event.target.value }))}
              placeholder="Напиши факты обычными словами — литературный стиль не нужен."
              rows={6}
              aria-label={`Ответ: ${current.title}`}
              autoFocus
            />
          </article>
          <div className="step-actions">
            <button type="button" className="thr-btn thr-btn-line" onClick={() => setCurrentStep((step) => Math.max(0, step - 1))} disabled={currentStep === 0}>Назад</button>
            {currentStep < questions.length - 1 ? (
              <button type="button" className="thr-btn thr-btn-tox" onClick={() => setCurrentStep((step) => Math.min(questions.length - 1, step + 1))}>{answers[current.problemId]?.trim() ? "Дальше" : "Пропустить"}</button>
            ) : (
              <button type="button" className="thr-btn thr-btn-tox" onClick={() => void submit()} disabled={saving || answeredCount === 0 || access.loading || (access.hasPackage && !access.improvementAvailable)}>
                {saving ? "Собираем новую версию…" : access.paywallEnabled && !access.hasPackage ? `Открыть пакет · ${access.priceRub} ₽` : access.improvementAvailable ? "Собрать резюме" : "Улучшение уже использовано"}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {paywallOpen && !access.hasPackage ? (
        <div className="paywall" role="dialog" aria-label="Оплата новой версии">
          <div className="pw-top"><span className="thr-mono">Пакет ToxicHR</span><strong>{access.priceRub} ₽</strong></div>
          <h2>Факты собраны. Открой пакет и переходи к новой версии.</h2>
          <p>В пакет входят все HR-взгляды, 5 сопоставлений, одно улучшение, будущая адаптация под вакансию и 5 повторных проверок.</p>
          <div className="pw-proof"><b>Что покупаешь</b><span>Один пакет для этого резюме</span><span>Только на твоих фактах — без выдуманных достижений</span><span>Один платёж, без подписки и доплат внутри</span></div>
          <button type="button" className="thr-btn thr-btn-tox pay" onClick={() => void checkout()} disabled={checkoutBusy}>{checkoutBusy ? "Переходим к оплате…" : `Оплатить пакет ${access.priceRub} ₽`}</button>
          <button type="button" className="later" onClick={() => setPaywallOpen(false)}>Вернуться к ответам</button>
        </div>
      ) : null}

      {error ? <p className="error" role="alert">{error}</p> : null}

      {result ? (
        <div className="result" id="revenge-result">
          <div className="result-head">
            <div><h2>Новая версия готова</h2><p>Проверь изменения, сравни тексты или отредактируй всё вручную.</p></div>
            <span className={`save-state ${hasUnsavedEditorChanges ? "dirty" : "clean"}`}>{hasUnsavedEditorChanges ? "Есть несохранённые правки" : "Версия сохранена"}</span>
          </div>

          <div className="result-tabs" role="tablist" aria-label="Режим просмотра версии">
            {([ ["changes", "Что изменилось"], ["compare", "Сравнить до / после"], ["editor", "Редактор"] ] as Array<[ResultView, string]>).map(([view, label]) => (
              <button key={view} type="button" role="tab" aria-selected={resultView === view} className={resultView === view ? "active" : ""} onClick={() => { setResultView(view); setEditorMessage(null); }}>{label}</button>
            ))}
          </div>

          {resultView === "changes" ? <div className="replacements" role="tabpanel">{result.replacements.map((replacement) => <article key={replacement.problemId}><p className="old">Было: {replacement.original}</p><p className="new">Стало: {replacement.replacement}</p></article>)}</div> : null}
          {resultView === "compare" ? <div className="compare" role="tabpanel"><article><div className="compare-label thr-mono">Исходное резюме</div><pre>{originalText}</pre></article><article className="after-copy"><div className="compare-label thr-mono">Новая версия</div><pre>{editorText}</pre></article></div> : null}
          {resultView === "editor" ? (
            <div className="editor" role="tabpanel">
              <div className="editor-meta"><div><b>Полный текст новой версии</b><span>Можно менять любые строки. Сервис пересчитает оценку после сохранения.</span></div><span className="thr-mono">{editorText.trim().length} знаков</span></div>
              <textarea value={editorText} onChange={(event) => { setEditorText(event.target.value); setEditorMessage(null); }} rows={24} maxLength={60_000} aria-label="Редактор новой версии резюме" />
              <div className="editor-actions"><button type="button" className="thr-btn thr-btn-tox" onClick={() => void saveEditor()} disabled={editorSaving || !hasUnsavedEditorChanges || editorText.trim().length < 80}>{editorSaving ? "Сохраняем…" : "Сохранить версию"}</button>{hasUnsavedEditorChanges ? <button type="button" className="reset" onClick={() => setEditorText(savedEditorText)}>Отменить несохранённые правки</button> : null}</div>
              {editorMessage ? <p className="editor-message" role="status">{editorMessage}</p> : null}
            </div>
          ) : null}

          {hasUnsavedEditorChanges ? <div className="export-lock" role="status">Сохрани изменения в редакторе — после этого экспорт и проверка вакансией обновятся.</div> : (
            <div className="exports">
              <a className="thr-btn thr-btn-tox" href={`/api/improvements/${analysisId}/docx`}>Скачать DOCX</a>
              <Link className="thr-btn thr-btn-line" href={`/revenge/${analysisId}/print`} target="_blank">Открыть PDF / печать</Link>
              <Link className="thr-btn vacancy-next" href={`/vacancy?analysisId=${analysisId}`}>Проверить под вакансию →</Link>
            </div>
          )}
        </div>
      ) : null}

      <style jsx>{`
        .revenge{width:min(860px,calc(100% - 36px));margin:0 auto;padding:54px 0 90px}.intro{max-width:700px}.over{color:var(--tox);font-size:11px;letter-spacing:.2em;text-transform:uppercase}.intro h1{margin-top:14px;font-size:clamp(34px,6vw,64px);line-height:1.02;letter-spacing:-.045em}.intro>p:nth-of-type(2){margin-top:20px;color:var(--dim);font-size:17px;line-height:1.6}.deal{display:grid;grid-template-columns:auto 1fr;gap:5px 12px;margin-top:22px;padding:15px 17px;border:1px solid rgba(44,224,139,.22);border-radius:14px;background:rgba(44,224,139,.055)}.deal>span{grid-row:1/3;color:var(--tox);font-size:9px;letter-spacing:.15em;text-transform:uppercase;padding-top:3px}.deal b{font-size:13.5px}.deal small{color:var(--dim);font-size:11.5px}.restored{margin-top:22px;padding:13px 16px;border:1px solid rgba(44,224,139,.24);border-radius:14px;background:rgba(44,224,139,.06);color:var(--dim);font-size:13px}.restored b{color:var(--tox)}
        .questions{display:grid;gap:16px;margin-top:42px}.progress-head{display:flex;justify-content:space-between;gap:18px;color:var(--faint);font-size:11.5px}.progress-head .thr-mono{color:var(--tox);font-size:10px;letter-spacing:.12em;text-transform:uppercase}.progress{height:3px;overflow:hidden;border-radius:999px;background:var(--hair)}.progress i{display:block;height:100%;border-radius:inherit;background:var(--tox);transition:width .35s var(--ease)}.questions article{padding:26px;border:1px solid var(--hair);border-radius:20px;background:var(--metal-0)}.qnum{color:var(--tox);font-size:11px}.questions h2{margin-top:8px;font-size:22px}.questions blockquote{margin-top:14px;padding-left:14px;border-left:2px solid var(--crit);color:var(--dim);line-height:1.5}.ask{margin-top:20px;font-weight:650}.questions ul{margin:12px 0 0 18px;color:var(--faint);font-size:13px;line-height:1.7}.questions textarea,.editor textarea{width:100%;margin-top:18px;padding:16px;border:1px solid var(--hair2);border-radius:14px;background:var(--metal-1);color:var(--fg);font:inherit;line-height:1.5;resize:vertical}.questions textarea:focus,.editor textarea:focus{outline:1px solid var(--tox);border-color:var(--tox)}.step-actions{display:flex;justify-content:space-between;gap:12px}.step-actions :global(.thr-btn){min-width:126px;min-height:50px;padding:0 22px}
        .paywall{margin-top:34px;padding:30px;border:1px solid rgba(44,224,139,.38);border-radius:22px;background:linear-gradient(145deg,rgba(44,224,139,.1),var(--metal-0));box-shadow:0 28px 80px rgba(0,0,0,.28)}.pw-top{display:flex;justify-content:space-between;align-items:center}.pw-top span{color:var(--tox);font-size:10px;letter-spacing:.16em;text-transform:uppercase}.pw-top strong{font-size:26px}.paywall h2{margin-top:18px;font-size:28px;letter-spacing:-.03em}.paywall>p{margin-top:12px;max-width:62ch;color:var(--dim);font-size:14px;line-height:1.6}.pw-proof{display:flex;flex-direction:column;gap:8px;margin-top:22px;padding:16px 18px;border:1px solid var(--hair);border-radius:14px;background:rgba(0,0,0,.12)}.pw-proof b{font-size:12px}.pw-proof span{position:relative;padding-left:18px;color:var(--dim);font-size:12.5px}.pw-proof span:before{content:'✓';position:absolute;left:0;color:var(--tox)}.pay{width:100%;min-height:54px;margin-top:20px}.later{display:block;margin:14px auto 0;border:0;background:none;color:var(--faint);font:inherit;font-size:12px;cursor:pointer}.later:hover{color:var(--fg)}.error{margin-top:18px;color:var(--crit)}
        .result{margin-top:50px;padding-top:40px;border-top:1px solid var(--hair)}.scores{display:flex;align-items:center;gap:18px}.scores span{display:flex;flex-direction:column;color:var(--faint)}.scores b{font-size:46px;color:var(--crit)}.scores .after b{color:var(--tox)}.scores i{color:var(--dim);font-size:28px}.result-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-top:30px}.result-head h2{font-size:28px}.result-head p{margin-top:6px;color:var(--dim);font-size:13.5px}.save-state{flex-shrink:0;padding:7px 10px;border-radius:999px;font:9px var(--font-mono);letter-spacing:.1em;text-transform:uppercase}.save-state.clean{color:var(--tox);background:var(--tox-dim)}.save-state.dirty{color:#ffd166;background:rgba(255,209,102,.1)}.result-tabs{display:flex;gap:6px;margin-top:24px;padding:5px;border:1px solid var(--hair);border-radius:14px;background:var(--metal-0)}.result-tabs button{flex:1;min-height:42px;padding:8px 12px;border:0;border-radius:10px;background:transparent;color:var(--dim);font:inherit;font-size:12.5px;cursor:pointer}.result-tabs button.active{background:var(--metal-2);color:var(--fg);box-shadow:inset 0 0 0 1px var(--hair)}
        .replacements{display:grid;gap:12px;margin-top:18px}.replacements article{padding:20px;border:1px solid var(--hair);border-radius:16px;background:var(--metal-0)}.old{color:var(--faint);text-decoration:line-through;line-height:1.5}.new{margin-top:12px;line-height:1.55}.compare{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px}.compare article{min-width:0;border:1px solid var(--hair);border-radius:16px;background:var(--metal-0);overflow:hidden}.compare .after-copy{border-color:rgba(44,224,139,.24)}.compare-label{padding:12px 15px;border-bottom:1px solid var(--hair);color:var(--faint);font-size:9px;letter-spacing:.12em;text-transform:uppercase}.after-copy .compare-label{color:var(--tox)}.compare pre{max-height:560px;overflow:auto;padding:18px;color:var(--dim);font:12px/1.65 var(--font-sans);white-space:pre-wrap;overflow-wrap:anywhere}.editor{margin-top:18px;padding:20px;border:1px solid var(--hair);border-radius:16px;background:var(--metal-0)}.editor-meta{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.editor-meta b{display:block;font-size:16px}.editor-meta div span{display:block;margin-top:5px;color:var(--dim);font-size:12.5px}.editor-meta>span{color:var(--faint);font-size:9px}.editor textarea{min-height:520px;font-family:var(--font-mono);font-size:12.5px;line-height:1.65}.editor-actions{display:flex;align-items:center;flex-wrap:wrap;gap:16px;margin-top:14px}.editor-actions :global(.thr-btn){min-height:48px;padding:0 22px}.reset{border:0;background:transparent;color:var(--faint);font:inherit;font-size:12px;cursor:pointer;text-decoration:underline}.editor-message{margin-top:14px;color:var(--tox);font-size:12.5px}.export-lock{margin-top:20px;padding:15px 17px;border:1px solid rgba(255,209,102,.2);border-radius:14px;background:rgba(255,209,102,.06);color:rgba(255,226,153,.78);font-size:12.5px}.exports{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px}.exports :global(.thr-btn){min-height:50px;padding:0 22px;text-decoration:none}.exports :global(.vacancy-next){color:var(--data);border:1px solid rgba(106,155,255,.3);background:rgba(106,155,255,.07)}.revenge-state{margin:80px auto;color:var(--dim)}
        @media(max-width:560px){.progress-head{align-items:flex-end}.progress-head span:last-child{max-width:18ch;text-align:right}.questions article{padding:22px 18px}.step-actions :global(.thr-btn){min-width:0;flex:1}.paywall{padding:24px 20px}.paywall h2{font-size:24px}.result-head{align-items:flex-start;flex-direction:column}.result-tabs{overflow-x:auto}.result-tabs button{flex:0 0 auto;min-width:142px}.compare{grid-template-columns:1fr}.editor{padding:18px 14px}.editor-meta{flex-direction:column;gap:8px}}
      `}</style>
    </section>
  );
}
