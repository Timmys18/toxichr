"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CollapsibleSection,
  CommandRail,
  EmptyState,
  EvidenceItem,
  PageContainer,
  PageIntro,
  PaymentPrompt,
  QuestionField,
  SectionLabel,
  SummaryRail,
} from "@/components/ui/system";
import { vacancyResultUrl } from "@/lib/navigation";
import { requestErrorMessage } from "@/lib/user-facing-errors";

type Question = {
  requirementId: string;
  requirement: string;
  vacancyQuote: string;
  resumeQuote: string;
  question: string;
};

type Change = {
  requirementId: string;
  requirement: string;
  original: string;
  replacement: string;
  vacancyQuote: string;
};

type PackageState = {
  paywallEnabled: boolean;
  hasPackage: boolean;
  priceRub: number;
  adaptationAvailable: boolean;
  adaptationUsed: boolean;
  rechecksRemaining: number;
  rechecksUsed: number;
};

type Adaptation = {
  id: string;
  status: string;
  answers: unknown;
  changes: Change[] | null;
  adaptedText: string | null;
  recheckAnalysisId: string | null;
};

type ScreenData = { vacancyTitle: string; questions: Question[]; adaptation: Adaptation | null; package: PackageState };

function messageFrom(response: Response, data: { error?: string }) {
  return data.error ?? (response.status === 402 ? "Для адаптации нужен пакет ToxicHR." : "Не удалось продолжить адаптацию.");
}

export function AdaptationClient({ analysisId, vacancyId }: { analysisId: string; vacancyId: string }) {
  const router = useRouter();
  const [data, setData] = useState<ScreenData | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAction, setRetryAction] = useState<"load" | "package" | "adapt" | "recheck">("load");
  const [draftReady, setDraftReady] = useState(false);
  const [questionStep, setQuestionStep] = useState(0);
  const draftKey = `toxichr:adaptation:${analysisId}:${vacancyId}`;

  const load = useCallback(async () => {
    setError(null);
    setRetryAction("load");
    const response = await fetch(`/api/adaptations?analysisId=${encodeURIComponent(analysisId)}&vacancyId=${encodeURIComponent(vacancyId)}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(messageFrom(response, payload));
    const next = payload as ScreenData;
    setData(next);
    const savedAnswers = next.adaptation?.answers;
    if (Array.isArray(savedAnswers)) {
      setAnswers(Object.fromEntries(savedAnswers.filter((item): item is { requirementId: string; answer: string } => Boolean(item && typeof item === "object" && "requirementId" in item && "answer" in item)).map((item) => [item.requirementId, item.answer])));
    } else {
      try {
        const draft = JSON.parse(window.localStorage.getItem(draftKey) ?? "{}") as Record<string, unknown>;
        setAnswers(Object.fromEntries(Object.entries(draft).filter((entry): entry is [string, string] => typeof entry[1] === "string")));
      } catch {
        // Без локального черновика остаются сохранённые серверные данные.
      }
    }
    setDraftReady(true);
  }, [analysisId, draftKey, vacancyId]);

  useEffect(() => {
    if (!draftReady || data?.adaptation?.status === "ready") return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(draftKey, JSON.stringify(answers));
      } catch {
        // Поля остаются заполненными, если локальное хранилище недоступно.
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [answers, data?.adaptation?.status, draftKey, draftReady]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((reason) => setError(requestErrorMessage(reason, "Не удалось открыть адаптацию. Попробуй ещё раз — вакансия сохранена.")));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function openPackage() {
    if (checkoutBusy) return;
    setCheckoutBusy(true);
    setError(null);
    setRetryAction("package");
    try {
      const response = await fetch("/api/payments/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ analysisId, vacancyId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(messageFrom(response, payload));
      if (payload.access) { await load(); return; }
      if (!payload.checkoutUrl) throw new Error("Не получили ссылку на оплату.");
      window.location.assign(payload.checkoutUrl);
    } catch (reason) {
      setError(requestErrorMessage(reason, "Не удалось открыть оплату. Попробуй ещё раз — контекст сохранён."));
    } finally {
      setCheckoutBusy(false);
    }
  }

  async function submit() {
    if (!data || busy) return;
    setBusy(true);
    setError(null);
    setRetryAction("adapt");
    try {
      const response = await fetch("/api/adaptations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId, vacancyId, answers: data.questions.map((question) => ({ requirementId: question.requirementId, answer: answers[question.requirementId] ?? "" })) }),
      });
      const payload = await response.json();
      if (response.status === 402) { await load(); return; }
      if (!response.ok) throw new Error(messageFrom(response, payload));
      try { window.localStorage.removeItem(draftKey); } catch { /* сервер уже сохранил ответы */ }
      await load();
    } catch (reason) {
      setError(requestErrorMessage(reason, "Не удалось собрать адаптированную версию. Ответы сохранены — попробуй ещё раз."));
    } finally {
      setBusy(false);
    }
  }

  async function recheck() {
    const adaptationId = data?.adaptation?.id;
    if (!adaptationId || rechecking) return;
    setRechecking(true);
    setError(null);
    setRetryAction("recheck");
    try {
      const response = await fetch(`/api/adaptations/${encodeURIComponent(adaptationId)}/recheck`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(messageFrom(response, payload));
      if (typeof payload.analysisId !== "string" || typeof payload.vacancyId !== "string") {
        throw new Error("Повторная проверка завершилась без ссылки на результат. Лимит не списан — попробуй ещё раз.");
      }
      router.push(vacancyResultUrl(payload.analysisId, payload.vacancyId));
    } catch (reason) {
      setError(requestErrorMessage(reason, "Не удалось повторно проверить новую версию. Она сохранена — попробуй ещё раз."));
      setRechecking(false);
    }
  }

  if (!data && !error) return <PageContainer className="ds-adaptation"><PageIntro label="Адаптация" title="Готовим контекст вакансии" lead="Собираем только сохранённые требования и цитаты из резюме." /><div className="ds-adaptation-skeleton" aria-hidden /></PageContainer>;

  const adaptation = data?.adaptation;
  const ready = adaptation?.status === "ready" && adaptation.adaptedText;
  const hasAnswers = Object.values(answers).some((answer) => answer.trim().length > 0);
  const noPackage = Boolean(data && data.package.paywallEnabled && !data.package.hasPackage);
  const retry = retryAction === "package" ? openPackage : retryAction === "adapt" ? submit : retryAction === "recheck" ? recheck : load;
  const currentQuestion = data?.questions[questionStep];
  const answeredCount = data?.questions.filter((question) => answers[question.requirementId]?.trim()).length ?? 0;

  return <PageContainer className="ds-adaptation">
    <PageIntro label="Адаптация под вакансию" title={ready ? "Резюме под вакансию готово" : "Уточним только то, что относится к этой вакансии"} lead={ready ? "Документ сохранён, изменения привязаны к требованиям. Ничего нового в опыт не добавлено." : "Ответь своими словами. Если факта нет, оставь поле пустым — сервис не станет его придумывать."} />
    <SummaryRail title={data?.vacancyTitle ?? "Вакансия"} meta="Контекст и новая версия останутся связаны" action={<Link className="ds-inline-link" href={`/vacancy?analysisId=${encodeURIComponent(analysisId)}&vacancyId=${encodeURIComponent(vacancyId)}`}>Вернуться к сравнению</Link>} />
    {error ? <EmptyState action={<button type="button" className="ds-inline-link" onClick={() => void retry()} disabled={busy || rechecking || checkoutBusy}>Попробовать ещё раз</button>}>{error}</EmptyState> : null}
    {noPackage && data ? <PaymentPrompt title="Открыть пакет ToxicHR" description="Адаптация под вакансию входит в один пакет: без подписки и дополнительных оплат внутри." price={`${data.package.priceRub} ₽`} action={<button type="button" className="thr-btn thr-btn-tox" onClick={() => void openPackage()} disabled={checkoutBusy}>{checkoutBusy ? "Переходим к оплате…" : `Открыть пакет за ${data.package.priceRub} ₽`}</button>} secondary="После оплаты не нужно повторно загружать резюме или вакансию." /> : null}
    {data && !ready && !noPackage ? <section className="ds-adaptation-questions"><div className="ds-adaptation-progress"><SectionLabel>{data.questions.length ? `Вопрос ${questionStep + 1} из ${data.questions.length}` : "Уточнения не нужны"}</SectionLabel>{data.questions.length ? <span>{answeredCount} заполнено</span> : null}</div>{currentQuestion ? <div className="ds-adaptation-question" key={currentQuestion.requirementId}><h2>{currentQuestion.question}</h2><QuestionField id={`adaptation-${currentQuestion.requirementId}`} label="Твой ответ" hint="Только личное действие, факт или результат, который можно подтвердить." value={answers[currentQuestion.requirementId] ?? ""} onChange={(value) => setAnswers((previous) => ({ ...previous, [currentQuestion.requirementId]: value }))} placeholder="Напиши факт обычными словами" /><CollapsibleSection title="Показать фрагменты резюме и вакансии"><EvidenceItem title={currentQuestion.requirement} description={`Резюме: «${currentQuestion.resumeQuote}»`} quote={`Вакансия: «${currentQuestion.vacancyQuote}»`} /></CollapsibleSection><div className="ds-adaptation-step-actions"><button type="button" className="thr-btn thr-btn-line" onClick={() => setQuestionStep((step) => Math.max(0, step - 1))} disabled={questionStep === 0}>Назад</button>{questionStep < data.questions.length - 1 ? <button type="button" className="thr-btn thr-btn-tox" onClick={() => setQuestionStep((step) => Math.min(data.questions.length - 1, step + 1))}>{answers[currentQuestion.requirementId]?.trim() ? "Дальше" : "Пропустить"}</button> : <button type="button" className="thr-btn thr-btn-tox" onClick={() => void submit()} disabled={!hasAnswers || busy}>{busy ? "Собираем новую версию…" : "Собрать версию под вакансию"}</button>}</div></div> : <EmptyState>В сохранённом сопоставлении нет строк, которые можно безопасно усилить. Ничего не дорисовываем.</EmptyState>}</section> : null}
    {ready && adaptation ? <section className="ds-adaptation-result"><CommandRail primary={<a className="thr-btn thr-btn-tox ds-docx-action" href={`/api/adaptations/${encodeURIComponent(adaptation.id)}/docx`}>Скачать готовое резюме · DOCX</a>} hint={`Документ готов · повторных проверок осталось ${data?.package.rechecksRemaining ?? 0} из 5.`} secondary={<button type="button" className="ds-inline-link" onClick={() => void recheck()} disabled={rechecking}>{rechecking ? "Повторно сопоставляем…" : adaptation.recheckAnalysisId ? "Открыть повторную проверку" : "Повторно проверить"}</button>} /><SectionLabel>Что изменилось для этой вакансии</SectionLabel>{adaptation.changes?.map((change) => <EvidenceItem key={change.requirementId} title={change.requirement} description={<><span className="ds-adaptation-before">Было: {change.original}</span><span className="ds-adaptation-after">Стало: {change.replacement}</span></>} quote={`Требование вакансии: «${change.vacancyQuote}»`} />)}<CollapsibleSection title="Полный текст новой версии"><pre className="ds-adaptation-text">{adaptation.adaptedText}</pre></CollapsibleSection></section> : null}
  </PageContainer>;
}
