"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CollapsibleSection,
  CommandRail,
  EditorialSection,
  EmptyState,
  EvidenceItem,
  PageContainer,
  PaymentPrompt,
  PrimaryAction,
  SectionLabel,
  SummaryRail,
  VerdictBlock,
} from "@/components/ui/system";
import { track } from "@/lib/analytics";
import type { MatchAssessment, StructuredVacancyAssessment, VacancyReview } from "@/lib/vacancy";
import { clearPendingVacancy, readPendingVacancy, savePendingVacancy } from "@/lib/pending-vacancy";
import { requestErrorMessage } from "@/lib/user-facing-errors";
import { vacancyResultUrl } from "@/lib/navigation";

const MIN_VACANCY_LENGTH = 80;

type PackageState = {
  hasPackage: boolean;
  matchesRemaining: number;
  rechecksRemaining: number;
  improvementAvailable: boolean;
  adaptationAvailable: boolean;
  paymentStatus: "none" | "pending" | "paid" | "failed" | "canceled";
};

function normalizeTitle(title: string) { return title.replace(/\s*\/\s*/g, " · ").trim(); }
function decisionMetrics(match: MatchAssessment) {
  const count = (status: "strong_match" | "partial_match" | "hidden_match" | "unknown" | "gap") => match.matches.filter((item) => item.status === status).length;
  return [
    { value: count("strong_match"), label: "подтверждено" },
    { value: count("partial_match") + count("hidden_match"), label: "можно связать" },
    { value: count("unknown") + count("gap"), label: "не видно в резюме" },
  ];
}

function RequirementList({ assessment, ids }: { assessment: StructuredVacancyAssessment; ids: string[] }) {
  const requirements = assessment.requirements.filter((item) => ids.includes(item.id));
  return <>{requirements.map((item) => <EvidenceItem key={item.id} title={item.text} description={item.interpretation} quote={`«${item.sourceQuote}»`} />)}</>;
}

export function VacancyClient({ analysisId, vacancyId }: { analysisId?: string; vacancyId?: string }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<VacancyReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(Boolean(vacancyId));
  const [savedVacancyId, setSavedVacancyId] = useState(vacancyId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [retryAction, setRetryAction] = useState<"load" | "review" | "checkout">("review");
  const [draftState, setDraftState] = useState<"idle" | "restored" | "saving" | "saved">("idle");
  const [resultStale, setResultStale] = useState(false);
  const [editorOpen, setEditorOpen] = useState(!vacancyId);
  const [matchPaywall, setMatchPaywall] = useState<{ vacancyId: string; priceRub: number } | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [packageState, setPackageState] = useState<PackageState | null>(null);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);

  const loadSavedVacancy = useCallback(async () => {
    if (!vacancyId) return;
    setLoadingSaved(true);
    setError(null);
    try {
      const source = `/api/vacancies/${vacancyId}${analysisId ? `?analysisId=${encodeURIComponent(analysisId)}` : ""}`;
      const response = await fetch(source);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Вакансия не найдена");
      setText(data.text ?? "");
      setResult((data.result as VacancyReview | null) ?? null);
      setEditorOpen(!data.result);
      if (data.resultError) {
        setRetryAction("review");
        setError(data.resultError);
      }
    } catch (reason) {
      setRetryAction("load");
      setError(requestErrorMessage(reason, "Не удалось загрузить вакансию. Попробуй ещё раз — контекст сохранён."));
    } finally {
      setLoadingSaved(false);
    }
  }, [analysisId, vacancyId]);

  useEffect(() => {
    track("vacancy_review_opened", { analysisId: analysisId ?? null, source: analysisId ? "resume_result" : "direct" });
    if (vacancyId) {
      const timer = window.setTimeout(() => void loadSavedVacancy(), 0);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      const pending = readPendingVacancy(); if (pending) { setText(pending); setDraftState("restored"); } setLoadingSaved(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [analysisId, loadSavedVacancy, vacancyId]);

  useEffect(() => {
    if (!analysisId) return;
    const returnedFromPayment = new URLSearchParams(window.location.search).get("payment") === "return";
    let cancelled = false;
    let timer: number | undefined;
    let attempt = 0;
    const refresh = async () => {
      const response = await fetch(`/api/payments/access?analysisId=${encodeURIComponent(analysisId)}${returnedFromPayment ? "&refresh=1" : ""}`, { cache: "no-store" });
      const data = response.ok ? await response.json() as PackageState : null;
      if (cancelled || !data) return;
      setPackageState(data);
      if (!returnedFromPayment) return;
      if (data.hasPackage || data.paymentStatus === "paid") {
        setPaymentNotice("Оплата подтверждена. Продолжаем с этой вакансией.");
        setMatchPaywall(null);
        return;
      }
      if (data.paymentStatus === "failed") {
        setPaymentNotice("Оплата не завершилась. Можно попробовать ещё раз — данные вакансии сохранены.");
        return;
      }
      if (data.paymentStatus === "canceled") {
        setPaymentNotice("Оплата отменена. Доступ не открыт; можно попробовать ещё раз — данные вакансии сохранены.");
        return;
      }
      setPaymentNotice("Проверяем оплату. Эта вакансия и резюме уже сохранены.");
      attempt += 1;
      if (attempt < 6) timer = window.setTimeout(refresh, 1200);
      else setPaymentNotice("Оплата ещё обрабатывается. Обнови страницу чуть позже — контекст сохранён.");
    };
    void refresh();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [analysisId]);

  useEffect(() => {
    if (vacancyId || text.trim().length < MIN_VACANCY_LENGTH) return;
    const timer = window.setTimeout(() => { savePendingVacancy(text); setDraftState("saved"); }, 350);
    return () => window.clearTimeout(timer);
  }, [text, vacancyId]);

  async function submit() {
    setBusy(true); setError(null); setRetryAction("review");
    try {
      const response = await fetch("/api/vacancies/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, analysisId, vacancyId: savedVacancyId || undefined }) });
      const data = await response.json();
      if (response.status === 402 && data.paymentRequired && data.vacancyId) {
        setSavedVacancyId(data.vacancyId);
        setMatchPaywall({ vacancyId: data.vacancyId, priceRub: Number(data.priceRub) || 199 });
        track("paywall_viewed", { analysisId, vacancyId: data.vacancyId, offer: "package" });
        return;
      }
      if (!response.ok) throw new Error(data.error ?? "Ошибка разбора");
      setResult(data.result as VacancyReview); setResultStale(false); setEditorOpen(false); setSavedVacancyId(data.vacancyId ?? ""); if (data.package) setPackageState(data.package as PackageState); clearPendingVacancy();
      if (typeof data.vacancyId === "string" && data.vacancyId) {
        const resultUrl = analysisId
          ? vacancyResultUrl(analysisId, data.vacancyId)
          : `/vacancy?vacancyId=${encodeURIComponent(data.vacancyId)}`;
        window.history.replaceState(window.history.state, "", resultUrl);
      }
    } catch (reason) { setError(requestErrorMessage(reason, "Не удалось разобрать вакансию. Попробуй ещё раз — текст сохранён.")); } finally { setBusy(false); }
  }

  async function checkoutMatch() {
    if (!analysisId || !matchPaywall || checkoutBusy) return;
    setCheckoutBusy(true);
    setError(null); setRetryAction("checkout");
    try {
      const response = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId, vacancyId: matchPaywall.vacancyId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Не удалось начать оплату");
      if (data.access) {
        setMatchPaywall(null);
        await submit();
        return;
      }
      if (!data.checkoutUrl) throw new Error("Не получили ссылку на оплату");
      window.location.assign(data.checkoutUrl);
    } catch (reason) {
      setError(requestErrorMessage(reason, "Не удалось открыть оплату. Попробуй ещё раз — вакансия сохранена."));
    } finally {
      setCheckoutBusy(false);
    }
  }

  const review = useMemo(() => result ? { assessment: result.vacancyAssessment, match: result.matchAssessment, persona: result.persona } : null, [result]);
  const textLength = text.trim().length;
  const inputStatus = loadingSaved ? "Загружаем сохранённую вакансию…" : textLength === 0 ? "Минимум 80 символов — вставь описание целиком" : textLength < MIN_VACANCY_LENGTH ? `Добавь ещё ${MIN_VACANCY_LENGTH - textLength} симв. для точного разбора` : draftState === "saved" ? "Черновик сохранён на этом устройстве" : "Текста достаточно для разбора";
  const showEditor = !result || editorOpen;
  const canSubmit = !loadingSaved && !busy && textLength >= MIN_VACANCY_LENGTH && (!result || resultStale);
  const retry = retryAction === "load" ? loadSavedVacancy : retryAction === "checkout" ? checkoutMatch : submit;
  const primaryGroundIds = review?.match ? [...new Set([...review.match.whyRejectRequirementIds, ...review.match.whyInviteRequirementIds, ...review.match.unknownRequirementIds])].slice(0, 3) : [];
  const criticalConstraintIds = review?.match ? review.match.matches.filter((item) => item.status === "gap").map((item) => item.requirementId).filter((id) => review.assessment.requirements.some((item) => item.id === id && item.priority === "critical")) : [];
  const resultCommand = review ? <CommandRail primary={!analysisId ? <Link href="/?from=vacancy" onClick={() => savePendingVacancy(text)}>Добавить резюме и проверить себя →</Link> : packageState?.adaptationAvailable && savedVacancyId ? <Link href={`/adaptation?analysisId=${encodeURIComponent(analysisId)}&vacancyId=${encodeURIComponent(savedVacancyId)}`}>Адаптировать резюме под вакансию →</Link> : <Link href={`/revenge?analysisId=${analysisId}`}>Исправить резюме →</Link>} hint={analysisId ? packageState?.adaptationAvailable ? `Адаптация входит в пакет · сопоставлений осталось ${packageState.matchesRemaining} из 5.` : `Адаптация уже использована · повторных проверок осталось ${packageState?.rechecksRemaining ?? 0} из 5.` : "Добавь резюме, чтобы проверить себя под эту роль"} secondary={<button type="button" className="ds-inline-link" onClick={() => { setResult(null); setText(""); setSavedVacancyId(""); setMatchPaywall(null); setResultStale(false); setError(null); clearPendingVacancy(); window.history.replaceState(window.history.state, "", analysisId ? `/vacancy?analysisId=${encodeURIComponent(analysisId)}` : "/vacancy"); setEditorOpen(true); }}>Сравнить с другой вакансией</button>} /> : null;

  return <PageContainer className="ds-comparison">
    <div className="ds-comparison-intro">
      <div className="ds-comparison-intro-top"><p className="over thr-mono">Вакансия без корпоративного тумана</p><Link href="/vacancies">История вакансий →</Link></div>
      <h1>{analysisId ? "Подходишь ли ты на эту роль?" : "Что здесь на самом деле хотят?"}</h1>
      <p>{analysisId ? "Сопоставим требования только с сохранённой профессиональной оценкой и точными цитатами из резюме." : "Разберём реальную роль, приоритеты и то, что стоит проверить до отклика."}</p>
      {paymentNotice ? <p role="status" aria-live="polite">{paymentNotice}</p> : null}
    </div>

    {review ? <SummaryRail title={normalizeTitle(review.assessment.title)} meta={<>Вакансия сохранена · {textLength} знаков</>} action={<button type="button" className="ds-inline-link" onClick={() => setEditorOpen((value) => !value)}>{editorOpen ? "Скрыть" : "Изменить"}</button>} /> : null}
    {showEditor ? <div className="ds-comparison-editor"><textarea value={text} onChange={(event) => { const next = event.target.value; setText(next); if (!vacancyId) setDraftState(next.trim().length >= MIN_VACANCY_LENGTH ? "saving" : "idle"); if (result) setResultStale(true); }} rows={10} placeholder="Вставь сюда текст вакансии целиком…" aria-label="Текст вакансии" maxLength={30_000} disabled={loadingSaved} /><div className="ds-comparison-input-meta"><span aria-live="polite">{inputStatus}</span><b className="thr-mono">{textLength} / 30 000</b></div></div> : null}
    {resultStale ? <p className="ds-comparison-stale-note" role="status">Текст изменился. Результат ниже относится к прошлой версии.</p> : null}
    {error ? <EmptyState className="ds-comparison-error" action={<button type="button" className="ds-inline-link" onClick={() => void retry()} disabled={busy || checkoutBusy}>{busy ? "Повторяем…" : "Попробовать ещё раз"}</button>}>{error}</EmptyState> : null}
    {!error && (canSubmit || (!result && showEditor)) ? <PrimaryAction className="ds-comparison-submit" onClick={submit} disabled={busy || !canSubmit}>{loadingSaved ? "Загружаем вакансию…" : busy ? "Разбираем требования…" : result ? "Обновить сравнение" : analysisId ? "Сопоставить с резюме" : "Разобрать вакансию"}</PrimaryAction> : null}
    {matchPaywall ? <PaymentPrompt
      title="Открыть пакет ToxicHR"
      description="Вакансия сохранена. В пакет входят 5 сопоставлений, все HR-взгляды, одно улучшение и одна адаптация под выбранную вакансию."
      price={`${matchPaywall.priceRub} ₽`}
      action={<button type="button" className="thr-btn thr-btn-tox" onClick={() => void checkoutMatch()} disabled={checkoutBusy}>{checkoutBusy ? "Переходим к оплате…" : `Открыть пакет за ${matchPaywall.priceRub} ₽`}</button>}
      secondary="Один платёж без подписки и дополнительных оплат внутри пакета."
    /> : null}

    {review ? <div className="ds-comparison-result">
      {result?.resultMode === "test" ? <div className="ds-result-mode" role="status"><b>Тестовый ответ</b><span>AI отключён. Это пример структуры интерфейса, а не профессиональная оценка вакансии или кандидата.</span></div> : null}
      {review.match ? <VerdictBlock title={review.match.decision.headline} summary={<>{review.match.decision.reasoning} {review.persona.comment}</>} metrics={decisionMetrics(review.match)} /> : <VerdictBlock title="Вакансия разобрана" summary={<>{review.assessment.roleReality} {review.persona.comment}</>} />}
      {resultCommand}
      {review.match ? <>
        {primaryGroundIds.length ? <section className="ds-comparison-key"><SectionLabel>Главные основания</SectionLabel><RequirementList assessment={review.assessment} ids={primaryGroundIds} /></section> : null}
        {criticalConstraintIds.length ? <EditorialSection className="ds-comparison-critical" title="Критичные ограничения"><RequirementList assessment={review.assessment} ids={criticalConstraintIds} /></EditorialSection> : null}
        <CollapsibleSection title="Все требования, пояснения и цитаты"><section className="ds-comparison-flow">
          {review.match.whyInviteRequirementIds.length ? <EditorialSection title="Почему могут позвать"><RequirementList assessment={review.assessment} ids={review.match.whyInviteRequirementIds} /></EditorialSection> : null}
          {review.match.whyRejectRequirementIds.length ? <EditorialSection title="Почему могут отсеять"><RequirementList assessment={review.assessment} ids={review.match.whyRejectRequirementIds} /></EditorialSection> : null}
          {review.match.matches.some((item) => item.status === "hidden_match") ? <EditorialSection title="Что в резюме спрятано">{review.match.matches.filter((item) => item.status === "hidden_match").map((item) => { const requirement = review.assessment.requirements.find((value) => value.id === item.requirementId); return requirement ? <EvidenceItem key={item.requirementId} title={requirement.text} description={item.explanation} quote={item.resumeQuotes[0] ? `«${item.resumeQuotes[0]}»` : undefined} /> : null; })}</EditorialSection> : null}
          {review.match.preApplyFixes.length ? <EditorialSection title="Что исправить перед откликом">{review.match.preApplyFixes.map((item, index) => <EvidenceItem key={index} title={item.action} description={item.boundary} />)}</EditorialSection> : null}
          {review.match.unknownRequirementIds.length ? <EditorialSection title="Чего в имеющихся данных нет"><RequirementList assessment={review.assessment} ids={review.match.unknownRequirementIds} /></EditorialSection> : null}
        </section></CollapsibleSection>
        <section className="ds-comparison-response"><SectionLabel>Перед откликом</SectionLabel>
          {review.match.candidateQuestions.length ? <CollapsibleSection title="Что могут спросить"><ol>{review.match.candidateQuestions.map((item) => <li key={item}>{item}</li>)}</ol></CollapsibleSection> : null}
          {review.match.employerQuestions.length ? <CollapsibleSection title="Что спросить работодателя"><ol>{review.match.employerQuestions.map((item) => <li key={item}>{item}</li>)}</ol></CollapsibleSection> : null}
          {review.match.limits.length ? <CollapsibleSection title="Границы вывода"><ul>{review.match.limits.map((item) => <li key={item}>{item}</li>)}</ul></CollapsibleSection> : null}
        </section>
      </> : <>
        <section className="ds-comparison-flow"><SectionLabel>Разбор вакансии</SectionLabel>
          <EditorialSection title="Что это за роль"><EvidenceItem title={review.assessment.whoTheySeek} description={review.assessment.mainTask} /></EditorialSection>
          <EditorialSection title="Что критично">{review.assessment.requirements.filter((item) => item.priority === "critical").map((item) => <EvidenceItem key={item.id} title={item.text} description={item.interpretation} quote={`«${item.sourceQuote}»`} />)}</EditorialSection>
          {review.assessment.requirements.some((item) => item.priority !== "critical") ? <EditorialSection title="Что желательно, но не обязательно">{review.assessment.requirements.filter((item) => item.priority !== "critical").map((item) => <EvidenceItem key={item.id} title={item.text} description={item.interpretation} quote={`«${item.sourceQuote}»`} />)}</EditorialSection> : null}
        </section>
        <section className="ds-comparison-response"><SectionLabel>Что проверить</SectionLabel>
          {[...review.assessment.contradictions, ...review.assessment.risks, ...review.assessment.clarificationPoints].length ? <CollapsibleSection title="Мутные места и вопросы"><>{[...review.assessment.contradictions, ...review.assessment.risks, ...review.assessment.clarificationPoints].map((item) => <EvidenceItem key={item.id} title={item.interpretation} description={item.kind === "hypothesis" ? "Это гипотеза, а не установленный факт." : "Вывод связан с формулировкой вакансии."} quote={`«${item.sourceQuote}»`} />)}</></CollapsibleSection> : null}
          {review.assessment.employerQuestions.length ? <CollapsibleSection title="Что спросить работодателя"><ol>{review.assessment.employerQuestions.map((item) => <li key={item}>{item}</li>)}</ol></CollapsibleSection> : null}
        </section>
      </>}
    </div> : null}
  </PageContainer>;
}
