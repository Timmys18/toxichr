"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CollapsibleSection,
  CommandRail,
  EmptyState,
  EvidenceItem,
  MetricStrip,
  PageContainer,
  PageIntro,
  PaymentPrompt,
  QuestionField,
  SectionLabel,
  SummaryRail,
} from "@/components/ui/system";

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

type ScreenData = { questions: Question[]; adaptation: Adaptation | null; package: PackageState };

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

  const load = useCallback(async () => {
    setError(null);
    const response = await fetch(`/api/adaptations?analysisId=${encodeURIComponent(analysisId)}&vacancyId=${encodeURIComponent(vacancyId)}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(messageFrom(response, payload));
    const next = payload as ScreenData;
    setData(next);
    const savedAnswers = next.adaptation?.answers;
    if (Array.isArray(savedAnswers)) {
      setAnswers(Object.fromEntries(savedAnswers.filter((item): item is { requirementId: string; answer: string } => Boolean(item && typeof item === "object" && "requirementId" in item && "answer" in item)).map((item) => [item.requirementId, item.answer])));
    }
  }, [analysisId, vacancyId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Не удалось открыть адаптацию."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function openPackage() {
    if (checkoutBusy) return;
    setCheckoutBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/payments/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ analysisId, vacancyId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(messageFrom(response, payload));
      if (payload.access) { await load(); return; }
      if (!payload.checkoutUrl) throw new Error("Не получили ссылку на оплату.");
      window.location.assign(payload.checkoutUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось открыть оплату.");
    } finally {
      setCheckoutBusy(false);
    }
  }

  async function submit() {
    if (!data || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/adaptations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId, vacancyId, answers: data.questions.map((question) => ({ requirementId: question.requirementId, answer: answers[question.requirementId] ?? "" })) }),
      });
      const payload = await response.json();
      if (response.status === 402) { await load(); return; }
      if (!response.ok) throw new Error(messageFrom(response, payload));
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось собрать адаптированную версию.");
    } finally {
      setBusy(false);
    }
  }

  async function recheck() {
    const adaptationId = data?.adaptation?.id;
    if (!adaptationId || rechecking) return;
    setRechecking(true);
    setError(null);
    try {
      const response = await fetch(`/api/adaptations/${encodeURIComponent(adaptationId)}/recheck`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(messageFrom(response, payload));
      router.push(`/vacancy?analysisId=${encodeURIComponent(payload.analysisId)}&vacancyId=${encodeURIComponent(payload.vacancyId)}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось повторно проверить новую версию.");
      setRechecking(false);
    }
  }

  if (!data && !error) return <PageContainer className="ds-adaptation"><PageIntro label="Адаптация" title="Готовим контекст вакансии" lead="Собираем только сохранённые требования и цитаты из резюме." /><div className="ds-adaptation-skeleton" aria-hidden /></PageContainer>;

  const adaptation = data?.adaptation;
  const ready = adaptation?.status === "ready" && adaptation.adaptedText;
  const hasAnswers = Object.values(answers).some((answer) => answer.trim().length > 0);
  const noPackage = Boolean(data && data.package.paywallEnabled && !data.package.hasPackage);

  return <PageContainer className="ds-adaptation">
    <PageIntro label="Адаптация под вакансию" title={ready ? "Новая версия собрана по фактам" : "Уточним только то, что относится к этой вакансии"} lead={ready ? "Изменения привязаны к требованиям ниже. Ничего нового в опыт не добавлено." : "Ответь своими словами. Если факта нет, оставь поле пустым — сервис не станет его придумывать."} />
    <SummaryRail title="Текущая вакансия" meta="Контекст и новая версия останутся связаны" action={<Link className="ds-inline-link" href={`/vacancy?analysisId=${encodeURIComponent(analysisId)}&vacancyId=${encodeURIComponent(vacancyId)}`}>Вернуться к сравнению</Link>} />
    {data?.package.hasPackage ? <MetricStrip items={[
      { value: data.package.adaptationUsed ? "использована" : "доступна", label: "адаптация" },
      { value: `${data.package.rechecksRemaining}/5`, label: "повторных проверок осталось" },
    ]} /> : null}
    {error ? <EmptyState action={<button type="button" className="ds-inline-link" onClick={() => void load()}>Попробовать ещё раз</button>}>{error}</EmptyState> : null}
    {noPackage && data ? <PaymentPrompt title="Открыть пакет ToxicHR" description="Адаптация под вакансию входит в один пакет: без подписки и дополнительных оплат внутри." price={`${data.package.priceRub} ₽`} action={<button type="button" className="thr-btn thr-btn-tox" onClick={() => void openPackage()} disabled={checkoutBusy}>{checkoutBusy ? "Переходим к оплате…" : `Открыть пакет за ${data.package.priceRub} ₽`}</button>} secondary="После оплаты не нужно повторно загружать резюме или вакансию." /> : null}
    {data && !ready && !noPackage ? <section className="ds-adaptation-questions"><SectionLabel>Подтверждённые уточнения</SectionLabel>{data.questions.length ? data.questions.map((question, index) => <div className="ds-adaptation-question" key={question.requirementId}><p className="ds-adaptation-index">{String(index + 1).padStart(2, "0")}</p><EvidenceItem title={question.requirement} description={question.question} quote={`Резюме: «${question.resumeQuote}» · Вакансия: «${question.vacancyQuote}»`} /><QuestionField id={`adaptation-${question.requirementId}`} label="Что можно честно уточнить в этой строке?" hint="Нужны только личное действие, факт или результат, который ты можешь подтвердить." value={answers[question.requirementId] ?? ""} onChange={(value) => setAnswers((previous) => ({ ...previous, [question.requirementId]: value }))} placeholder="Напиши факты обычными словами" /></div>) : <EmptyState>В сохранённом сопоставлении нет строк, которые можно безопасно усилить. Ничего не дорисовываем.</EmptyState>}</section> : null}
    {data && !ready && !noPackage && data.questions.length ? <CommandRail primary={<button type="button" className="ds-command-button" onClick={() => void submit()} disabled={!hasAnswers || busy}>{busy ? "Собираем новую версию…" : "Собрать версию под вакансию →"}</button>} hint="Доступ расходуется только после готовой новой версии." secondary={<Link className="ds-inline-link" href={`/vacancy?analysisId=${encodeURIComponent(analysisId)}&vacancyId=${encodeURIComponent(vacancyId)}`}>Оставить без изменений</Link>} /> : null}
    {ready && adaptation ? <section className="ds-adaptation-result"><SectionLabel>Что изменилось для этой вакансии</SectionLabel>{adaptation.changes?.map((change) => <EvidenceItem key={change.requirementId} title={change.requirement} description={<><span className="ds-adaptation-before">Было: {change.original}</span><span className="ds-adaptation-after">Стало: {change.replacement}</span></>} quote={`Требование вакансии: «${change.vacancyQuote}»`} />)}<CollapsibleSection title="Полный текст новой версии"><pre className="ds-adaptation-text">{adaptation.adaptedText}</pre></CollapsibleSection><CommandRail primary={<button type="button" className="ds-command-button" onClick={() => void recheck()} disabled={rechecking}>{rechecking ? "Повторно сопоставляем…" : adaptation.recheckAnalysisId ? "Открыть повторную проверку →" : "Повторно проверить под эту вакансию →"}</button>} hint="Это отдельная повторная проверка из пакета. Уже готовый результат не расходует лимит снова." secondary={<a className="ds-inline-link" href={`/api/adaptations/${encodeURIComponent(adaptation.id)}/docx`}>Скачать DOCX</a>} /></section> : null}
  </PageContainer>;
}
