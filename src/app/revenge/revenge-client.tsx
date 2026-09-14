"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { track } from "@/lib/analytics";
import { EvidenceQuote, InfoNote, PageContainer, PageIntro, PrimaryAction, QuestionField, SecondaryAction, SectionLabel, SurfacePanel } from "@/components/ui/system";
import { requestErrorMessage } from "@/lib/user-facing-errors";

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
  paymentStatus: "none" | "pending" | "paid" | "failed" | "canceled";
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
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
  const [access, setAccess] = useState<AccessState>({
    loading: true,
    paywallEnabled: false,
    hasPackage: true,
    priceRub: 199,
    improvementAvailable: true,
    improvementUsed: false,
    paymentStatus: "none",
  });

  const refreshAccess = useCallback(async (refreshPayment = false) => {
    const response = await fetch(`/api/payments/access?analysisId=${encodeURIComponent(analysisId)}${refreshPayment ? "&refresh=1" : ""}`, {
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
      paymentStatus: data.paymentStatus === "pending" || data.paymentStatus === "paid" || data.paymentStatus === "failed" || data.paymentStatus === "canceled" ? data.paymentStatus : "none",
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
        if (!cancelled) setError(requestErrorMessage(reason, "Не удалось загрузить вопросы. Попробуй ещё раз — разбор сохранён."));
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
        const current = await refreshAccess(true).catch(() => null);
        if (current?.hasPackage) {
          setPaywallOpen(false);
          setPaymentNotice("Оплата подтверждена. Можно продолжать с сохранёнными ответами.");
          return;
        }
        if (current?.paymentStatus === "failed") {
          setPaymentNotice("Оплата не завершилась. Можно попробовать ещё раз — ответы сохранены.");
          return;
        }
        if (current?.paymentStatus === "canceled") {
          setPaymentNotice("Оплата отменена. Доступ не открыт; можно попробовать ещё раз — ответы сохранены.");
          return;
        }
        setPaymentNotice("Проверяем оплату. Ответы и выбранный разбор сохранены.");
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
      }
      if (!cancelled) setPaymentNotice("Оплата ещё обрабатывается. Обнови страницу чуть позже — ответы сохранены.");
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
      setError(requestErrorMessage(reason, "Не удалось сохранить версию. Черновик остался на этом устройстве."));
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
      setError(requestErrorMessage(reason, "Не удалось открыть оплату. Попробуй ещё раз — ответы сохранены."));
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
      setError(requestErrorMessage(reason, "Не удалось сохранить правки. Черновик остался на этом устройстве."));
    } finally {
      setEditorSaving(false);
    }
  }

  if (loading) return <PageContainer><div className="revenge-state">Готовим вопросы…</div></PageContainer>;

  return (
    <PageContainer className="revenge">
      <PageIntro label="Реванш" title="Теперь исправим то, что HR разнёс." lead="Ответь только фактами. Если точной цифры не помнишь — не придумывай: сервис соберёт честную формулировку без неё." />
      <InfoNote className="deal" title={`Новая версия входит в пакет ToxicHR за ${access.priceRub} ₽.`}>{access.improvementUsed ? "Улучшение уже использовано для этого резюме." : "Одно улучшение, без подписки и доплат."}</InfoNote>
      {paymentNotice ? <p role="status" aria-live="polite">{paymentNotice}</p> : null}

      {restoredAnswersCount > 0 && !result ? (
        <div className="restored" role="status"><b>Черновик на месте.</b> Вернули ответов: {restoredAnswersCount}. Продолжаем с первого незаполненного вопроса.</div>
      ) : null}

      {current && !result ? (
        <div className="questions">
          <div className="progress-head">
            <SectionLabel>Вопрос {currentStep + 1} из {questions.length}</SectionLabel>
            <span>{answeredCount} заполнено · черновик сохраняется</span>
          </div>
          <div className="progress" aria-hidden><i style={{ width: `${((currentStep + 1) / questions.length) * 100}%` }} /></div>
          <article key={current.problemId}>
            <div className="qnum thr-mono">{String(currentStep + 1).padStart(2, "0")}</div>
            <h2>{current.title}</h2>
            <EvidenceQuote>«{current.quote}»</EvidenceQuote>
            <p className="ask">{current.question}</p>
            <ul>{current.prompts.map((prompt) => <li key={prompt}>{prompt}</li>)}</ul>
            <QuestionField id={`answer-${current.problemId}`} label={`Ответ: ${current.title}`} value={answers[current.problemId] ?? ""} onChange={(value) => setAnswers((stored) => ({ ...stored, [current.problemId]: value }))} placeholder="Напиши факты обычными словами — литературный стиль не нужен." />
          </article>
          <div className="step-actions">
            <SecondaryAction type="button" onClick={() => setCurrentStep((step) => Math.max(0, step - 1))} disabled={currentStep === 0}>Назад</SecondaryAction>
            {currentStep < questions.length - 1 ? (
              <PrimaryAction type="button" onClick={() => setCurrentStep((step) => Math.min(questions.length - 1, step + 1))}>{answers[current.problemId]?.trim() ? "Дальше" : "Пропустить"}</PrimaryAction>
            ) : (
              <PrimaryAction type="button" onClick={() => void submit()} disabled={saving || answeredCount === 0 || access.loading || (access.hasPackage && !access.improvementAvailable)}>
                {saving ? "Собираем новую версию…" : access.paywallEnabled && !access.hasPackage ? `Открыть пакет · ${access.priceRub} ₽` : access.improvementAvailable ? "Собрать резюме" : "Улучшение уже использовано"}
              </PrimaryAction>
            )}
          </div>
        </div>
      ) : null}

      {paywallOpen && !access.hasPackage ? (
        <SurfacePanel className="paywall" role="dialog" aria-label="Оплата новой версии">
          <div className="pw-top"><span className="thr-mono">Пакет ToxicHR</span><strong>{access.priceRub} ₽</strong></div>
          <h2>Факты собраны. Открой пакет и переходи к новой версии.</h2>
          <p>В пакет входят все HR-взгляды, 5 сопоставлений, одно улучшение, адаптация под вакансию и 5 повторных проверок.</p>
          <div className="pw-proof"><b>Что покупаешь</b><span>Один пакет для этого резюме</span><span>Только на твоих фактах — без выдуманных достижений</span><span>Один платёж, без подписки и доплат внутри</span></div>
          <PrimaryAction type="button" className="pay" onClick={() => void checkout()} disabled={checkoutBusy}>{checkoutBusy ? "Переходим к оплате…" : `Оплатить пакет ${access.priceRub} ₽`}</PrimaryAction>
          <button type="button" className="later" onClick={() => setPaywallOpen(false)}>Вернуться к ответам</button>
        </SurfacePanel>
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
    </PageContainer>
  );
}
