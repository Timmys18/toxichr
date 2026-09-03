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
import type { MatchAssessment, StructuredVacancyAssessment, VacancyReview } from "@/lib/vacancy";
import { clearPendingVacancy, readPendingVacancy, savePendingVacancy } from "@/lib/pending-vacancy";

const MIN_VACANCY_LENGTH = 80;

function normalizeTitle(title: string) { return title.replace(/\s*\/\s*/g, " · ").trim(); }
function decisionMetrics(match: MatchAssessment) {
  const count = (status: "strong_match" | "partial_match" | "hidden_match" | "unknown" | "gap") => match.matches.filter((item) => item.status === status).length;
  return [
    { value: count("strong_match"), label: "подтверждено" },
    { value: count("partial_match") + count("hidden_match"), label: "можно связать" },
    { value: count("unknown") + count("gap"), label: "не видно в резюме" },
  ];
}

function RequirementList({ assessment, ids, empty }: { assessment: StructuredVacancyAssessment; ids: string[]; empty: string }) {
  const requirements = assessment.requirements.filter((item) => ids.includes(item.id));
  return requirements.length ? <>{requirements.map((item) => <EvidenceItem key={item.id} title={item.text} description={item.interpretation} quote={`«${item.sourceQuote}»`} />)}</> : <EmptyState>{empty}</EmptyState>;
}

export function VacancyClient({ analysisId, vacancyId }: { analysisId?: string; vacancyId?: string }) {
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
    track("vacancy_review_opened", { analysisId: analysisId ?? null, source: analysisId ? "resume_result" : "direct" });
    if (vacancyId) {
      void fetch(`/api/vacancies/${vacancyId}`).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Вакансия не найдена");
        setText(data.text ?? ""); setResult((data.result as VacancyReview | null) ?? null); setEditorOpen(!data.result);
      }).catch((reason) => setError(reason instanceof Error ? reason.message : "Ошибка загрузки")).finally(() => setLoadingSaved(false));
      return;
    }
    const timer = window.setTimeout(() => {
      const pending = readPendingVacancy(); if (pending) { setText(pending); setDraftState("restored"); } setLoadingSaved(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [analysisId, vacancyId]);

  useEffect(() => {
    if (analysisId || vacancyId || text.trim().length < MIN_VACANCY_LENGTH) return;
    const timer = window.setTimeout(() => { savePendingVacancy(text); setDraftState("saved"); }, 350);
    return () => window.clearTimeout(timer);
  }, [analysisId, text, vacancyId]);

  async function submit() {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/vacancies/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, analysisId, vacancyId: savedVacancyId || undefined }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Ошибка разбора");
      setResult(data.result as VacancyReview); setResultStale(false); setEditorOpen(false); setSavedVacancyId(data.vacancyId ?? ""); if (analysisId) clearPendingVacancy();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Ошибка разбора"); } finally { setBusy(false); }
  }

  const review = useMemo(() => result ? { assessment: result.vacancyAssessment, match: result.matchAssessment, persona: result.persona } : null, [result]);
  const textLength = text.trim().length;
  const inputStatus = loadingSaved ? "Загружаем сохранённую вакансию…" : textLength === 0 ? "Минимум 80 символов — вставь описание целиком" : textLength < MIN_VACANCY_LENGTH ? `Добавь ещё ${MIN_VACANCY_LENGTH - textLength} симв. для точного разбора` : draftState === "saved" ? "Черновик сохранён на этом устройстве" : "Текста достаточно для разбора";
  const showEditor = !result || editorOpen;
  const canSubmit = !loadingSaved && !busy && textLength >= MIN_VACANCY_LENGTH && (!result || resultStale);

  return <PageContainer className="ds-comparison">
    <div className="ds-comparison-intro">
      <div className="ds-comparison-intro-top"><p className="over thr-mono">Вакансия без корпоративного тумана</p><Link href="/vacancies">История вакансий →</Link></div>
      <h1>{analysisId ? "Подходишь ли ты на эту роль?" : "Что здесь на самом деле хотят?"}</h1>
      <p>{analysisId ? "Сопоставим требования только с сохранённой профессиональной оценкой и точными цитатами из резюме." : "Разберём реальную роль, приоритеты и то, что стоит проверить до отклика."}</p>
    </div>

    {review ? <SummaryRail title={normalizeTitle(review.assessment.title)} meta={<>Вакансия сохранена · {textLength} знаков</>} action={<button type="button" className="ds-inline-link" onClick={() => setEditorOpen((value) => !value)}>{editorOpen ? "Скрыть" : "Изменить"}</button>} /> : null}
    {showEditor ? <div className="ds-comparison-editor"><textarea value={text} onChange={(event) => { const next = event.target.value; setText(next); if (!analysisId && !vacancyId) setDraftState(next.trim().length >= MIN_VACANCY_LENGTH ? "saving" : "idle"); if (result) setResultStale(true); }} rows={10} placeholder="Вставь сюда текст вакансии целиком…" aria-label="Текст вакансии" maxLength={30_000} disabled={loadingSaved} /><div className="ds-comparison-input-meta"><span aria-live="polite">{inputStatus}</span><b className="thr-mono">{textLength} / 30 000</b></div></div> : null}
    {resultStale ? <p className="ds-comparison-stale-note" role="status">Текст изменился. Результат ниже относится к прошлой версии.</p> : null}
    {error ? <p className="ds-comparison-error" role="alert">{error}</p> : null}
    {canSubmit || (!result && showEditor) ? <PrimaryAction className="ds-comparison-submit" onClick={submit} disabled={busy || !canSubmit}>{loadingSaved ? "Загружаем вакансию…" : busy ? "Разбираем требования…" : result ? "Обновить сравнение" : analysisId ? "Сопоставить с резюме" : "Разобрать вакансию"}</PrimaryAction> : null}

    {review ? <div className="ds-comparison-result">
      {review.match ? <VerdictBlock title={review.match.decision.headline} summary={<>{review.match.decision.reasoning} {review.persona.comment}</>} metrics={decisionMetrics(review.match)} /> : <VerdictBlock title="Вакансия разобрана" summary={review.assessment.roleReality} />}
      {review.match ? <>
        <section className="ds-comparison-flow"><SectionLabel>Совпадения и разрывы</SectionLabel>
          <EditorialSection title="Почему могут позвать"><RequirementList assessment={review.assessment} ids={review.match.whyInviteRequirementIds} empty="Прямых причин звать на интервью пока не видно." /></EditorialSection>
          <EditorialSection title="Почему могут отсеять"><RequirementList assessment={review.assessment} ids={review.match.whyRejectRequirementIds} empty="Критичных разрывов в сохранённых данных не видно." /></EditorialSection>
          <EditorialSection title="Что в резюме спрятано">{review.match.matches.filter((item) => item.status === "hidden_match").length ? review.match.matches.filter((item) => item.status === "hidden_match").map((item) => { const requirement = review.assessment.requirements.find((value) => value.id === item.requirementId); return requirement ? <EvidenceItem key={item.requirementId} title={requirement.text} description={item.explanation} quote={item.resumeQuotes[0] ? `«${item.resumeQuotes[0]}»` : undefined} /> : null; }) : <EmptyState>Спрятанных совпадений не найдено.</EmptyState>}</EditorialSection>
          <EditorialSection title="Что исправить перед откликом">{review.match.preApplyFixes.length ? review.match.preApplyFixes.map((item, index) => <EvidenceItem key={index} title={item.action} description={item.boundary} />) : <EmptyState>Перед откликом ничего не нужно дорисовывать.</EmptyState>}</EditorialSection>
          <EditorialSection title="Чего в имеющихся данных нет"><RequirementList assessment={review.assessment} ids={review.match.unknownRequirementIds} empty="Сохранённые данные не оставили неясных требований." /></EditorialSection>
        </section>
        <section className="ds-comparison-response"><SectionLabel>Перед откликом</SectionLabel>
          {review.match.candidateQuestions.length ? <CollapsibleSection title="Что могут спросить"><ol>{review.match.candidateQuestions.map((item) => <li key={item}>{item}</li>)}</ol></CollapsibleSection> : null}
          {review.match.employerQuestions.length ? <CollapsibleSection title="Что спросить работодателя"><ol>{review.match.employerQuestions.map((item) => <li key={item}>{item}</li>)}</ol></CollapsibleSection> : null}
          {review.match.limits.length ? <CollapsibleSection title="Границы вывода"><ul>{review.match.limits.map((item) => <li key={item}>{item}</li>)}</ul></CollapsibleSection> : null}
        </section>
      </> : <>
        <section className="ds-comparison-flow"><SectionLabel>Разбор вакансии</SectionLabel>
          <EditorialSection title="Что это за роль"><EvidenceItem title={review.assessment.whoTheySeek} description={review.assessment.mainTask} /></EditorialSection>
          <EditorialSection title="Что критично">{review.assessment.requirements.filter((item) => item.priority === "critical").map((item) => <EvidenceItem key={item.id} title={item.text} description={item.interpretation} quote={`«${item.sourceQuote}»`} />)}</EditorialSection>
          <EditorialSection title="Что вторично или похоже на wishlist">{review.assessment.requirements.filter((item) => item.priority !== "critical").length ? review.assessment.requirements.filter((item) => item.priority !== "critical").map((item) => <EvidenceItem key={item.id} title={item.text} description={item.interpretation} quote={`«${item.sourceQuote}»`} />) : <EmptyState>Вакансия не отделяет второстепенное от обязательного.</EmptyState>}</EditorialSection>
        </section>
        <section className="ds-comparison-response"><SectionLabel>Что проверить</SectionLabel>
          {[...review.assessment.contradictions, ...review.assessment.risks, ...review.assessment.clarificationPoints].length ? <CollapsibleSection title="Мутные места и вопросы"><>{[...review.assessment.contradictions, ...review.assessment.risks, ...review.assessment.clarificationPoints].map((item) => <EvidenceItem key={item.id} title={item.interpretation} description={item.kind === "hypothesis" ? "Это гипотеза, а не установленный факт." : "Вывод связан с формулировкой вакансии."} quote={`«${item.sourceQuote}»`} />)}</></CollapsibleSection> : null}
          {review.assessment.employerQuestions.length ? <CollapsibleSection title="Что спросить работодателя"><ol>{review.assessment.employerQuestions.map((item) => <li key={item}>{item}</li>)}</ol></CollapsibleSection> : null}
        </section>
      </>}
      <CommandRail primary={!analysisId ? <Link href="/?from=vacancy" onClick={() => savePendingVacancy(text)}>Добавить резюме и проверить себя →</Link> : <Link href={`/revenge?analysisId=${analysisId}`}>Адаптировать резюме под вакансию →</Link>} hint="Только на основании подтверждённого опыта" secondary={<button type="button" className="ds-inline-link" onClick={() => { setResult(null); setEditorOpen(true); }}>Сравнить с другой вакансией</button>} />
    </div> : null}
  </PageContainer>;
}
