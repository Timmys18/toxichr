/**
 * Конвейер v4: professional core → deterministic score → persona writer → validator.
 * У писателя нет полного исходника: выводы привязаны к findingId и цитате.
 */

import type { PersonaId } from "@/lib/personas";
import { PERSONAS } from "@/lib/personas";
import { AnalysisReportSchema, type AnalysisReport, type Problem, type TheatreFinding } from "@/lib/ai/schemas";
import { runHeuristicAnalysis } from "@/lib/ai/heuristics";
import { AiConfigError, aiMockEnabled, runAi } from "@/lib/ai/gateway";
import { groundReport } from "@/lib/ai/grounding";
import { runExtractStage, scoreFromEvidence, type EvidenceClaim, type EvidenceMap } from "@/lib/ai/evidence";
import { PERSONA_BIBLES, PERSONA_BIBLE_VERSION } from "@/lib/ai/prompts/persona-bibles";
import { WRITER_CORE_PROMPT, WRITER_CORE_VERSION } from "@/lib/ai/prompts/writer-core";
import { PROFESSIONAL_CORE_VERSION } from "@/lib/ai/prompts/professional-core";
import { editorPrompt, EDITOR_CORE_VERSION } from "@/lib/ai/prompts/editor-core";
import { stripSensitiveShareText, validatePersonaDraft, type PersonaDraft } from "@/lib/ai/writer-validator";

export type PipelineStage = "extract" | "score" | "persona";
export type PipelineEvent =
  | { type: "stage"; stage: PipelineStage; status: "start" | "done" }
  | { type: "finding"; stage: PipelineStage; message: string }
  | { type: "roast"; delta: string };

export type PipelineInput = { resumeText: string; personaId: PersonaId; onEvent?: (event: PipelineEvent) => void };
export type PipelineResult = { report: AnalysisReport; provider: string; model: string; costUsd: number };

type AssessmentFinding = {
  id: string;
  sourceQuote: string;
  interpretation: string;
  whyItMatters: string;
  severity: Problem["severity"];
  confidence: number;
  issueType: "finding" | "strength" | "observation";
};

function makeAssessment(map: EvidenceMap): AssessmentFinding[] {
  return map.claims.slice(0, 14).map((claim, index) => {
    const missing = [
      !claim.hasPersonalAction && "личная роль",
      !claim.hasOutcome && "итог",
      !claim.hasScale && "масштаб",
    ].filter(Boolean).join(", ");
    const isStrength = claim.type === "achievement" && (claim.hasMetric || claim.hasOutcome);
    const isWeak = claim.isGeneric || Boolean(missing);
    return {
      id: `F${String(index + 1).padStart(2, "0")}`,
      sourceQuote: claim.quote,
      interpretation: claim.note || (isStrength ? "Фрагмент показывает конкретный результат." : isWeak ? `В формулировке не видны: ${missing || "отличительные детали"}.` : "Фрагмент требует более ясного контекста."),
      whyItMatters: isStrength
        ? "Это даёт читателю проверяемый сигнал о реальном вкладе в рамках текста резюме."
        : `Без этого читателю резюме трудно понять вклад и ценность формулировки: ${missing || "слишком общий текст"}.`,
      severity: isStrength ? "low" : claim.isGeneric || !claim.hasPersonalAction ? "high" : "medium",
      confidence: 0.82,
      issueType: isStrength ? "strength" : isWeak ? "finding" : "observation",
    };
  });
}

function theatreFromAssessment(findings: AssessmentFinding[]): TheatreFinding[] {
  return findings.slice(0, 6).map((finding) => ({
    id: `theatre-${finding.id}`,
    stage: finding.issueType,
    message: finding.issueType === "strength" ? "Нашёл фрагмент с ясным результатом." : "Проверяю формулировку и её опору в тексте.",
  }));
}

function writerSystem(personaId: PersonaId): string {
  return `${WRITER_CORE_PROMPT}\n\nБиблия персоны (${PERSONA_BIBLE_VERSION}):\n${PERSONA_BIBLES[personaId]}`;
}

function jsonObject(content: string): unknown {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(content.slice(start, end + 1)); } catch { return null; }
}

function fallbackDraft(base: AnalysisReport, assessment: AssessmentFinding[]): PersonaDraft {
  const issues = assessment.filter((item) => item.issueType !== "strength").slice(0, 3);
  const usable = issues.length ? issues : assessment.slice(0, 2);
  return {
    verdict: base.verdict,
    contentBlocks: usable.map((item) => ({
      type: item.issueType === "strength" ? "strength" : "finding",
      findingIds: [item.id],
      content: `${item.interpretation} ${item.whyItMatters}`,
    })),
    priorities: usable.map((item) => ({
      findingIds: [item.id],
      action: "Перепишите этот пункт так, чтобы из текста были ясны действие, контекст и реальный итог.",
    })),
    shareLines: ["Резюме читается сильнее, когда действие и итог стоят рядом."],
  };
}

function fallbackEvidenceMap(base: AnalysisReport): EvidenceMap {
  return {
    profile: base.candidateProfile,
    claims: base.topProblems.map((problem) => ({
      quote: problem.quote,
      type: "other",
      hasMetric: /\d/.test(problem.quote),
      hasScale: false,
      hasPersonalAction: false,
      hasOutcome: false,
      isGeneric: true,
    } satisfies EvidenceClaim)),
    contradictions: [],
    missing: [],
  };
}

function reportFromDraft(base: AnalysisReport, map: EvidenceMap, draft: PersonaDraft, personaId: PersonaId, meta: AnalysisReport["generationMeta"]): AnalysisReport {
  const assessment = makeAssessment(map);
  const byId = new Map(assessment.map((item) => [item.id, item]));
  const actionFor = (id: string) => draft.priorities.find((item) => item.findingIds.includes(id))?.action || "Уточните формулировку только реальными фактами из опыта.";
  const blocksFor = (id: string) => draft.contentBlocks.find((item) => item.findingIds.includes(id))?.content;
  const topProblems = assessment
    .filter((item) => item.issueType !== "strength")
    .slice(0, 7)
    .map((item, index): Problem => ({
      id: `p-${index}`,
      severity: item.severity,
      title: item.interpretation.slice(0, 120),
      quote: item.sourceQuote,
      roast: blocksFor(item.id) || item.interpretation,
      diagnosis: item.whyItMatters,
      recommendation: actionFor(item.id),
    }));
  const strengths = assessment
    .filter((item) => item.issueType === "strength")
    .slice(0, 4)
    .map((item, index) => ({ id: `s-${index}`, title: item.interpretation.slice(0, 120), quote: item.sourceQuote, comment: blocksFor(item.id) || item.whyItMatters }));
  const safeShareLines = draft.shareLines.map(stripSensitiveShareText).filter((line): line is string => Boolean(line));
  const text = draft.contentBlocks.map((block) => block.content).join("\n\n");
  const summary = draft.contentBlocks.find((block) => block.type === "summary")?.content || draft.verdict.comment;
  return AnalysisReportSchema.parse({
    ...base,
    candidateProfile: map.profile,
    verdict: draft.verdict,
    hrReview: {
      firstImpression: draft.verdict.comment,
      deepDive: text.length >= 200 ? text : `${text}\n\n${summary}`,
      hiringTake: summary,
      fixPriority: draft.priorities.map((item) => item.action).join(" "),
    },
    topProblems: topProblems.length ? topProblems : base.topProblems,
    strengths: strengths.length ? strengths : base.strengths,
    shareQuotes: (safeShareLines.length ? safeShareLines : base.shareQuotes.map((item) => item.text).slice(0, 1)).map((text, index) => ({ id: `q-${index}`, kind: (["precise", "funny", "safe"] as const)[index] || "safe", text })),
    improvementPlan: draft.priorities.map((item, index) => ({ id: `plan-${index}`, horizon: index === 0 ? "10m" : index === 1 ? "30m" : "recall", action: item.action, problemIds: item.findingIds.map((id) => byId.has(id) ? `p-${assessment.filter((finding) => finding.issueType !== "strength").findIndex((finding) => finding.id === id)}` : id) })),
    contentBlocks: draft.contentBlocks,
    generationMeta: meta,
    recommendedPersonaId: personaId,
  });
}

export async function runAnalysisPipeline(input: PipelineInput): Promise<PipelineResult> {
  const emit = input.onEvent ?? (() => {});
  const heuristicBase = groundReport(runHeuristicAnalysis(input.resumeText, input.personaId), input.resumeText);
  const persona = PERSONAS.find((item) => item.id === input.personaId);

  if (aiMockEnabled()) {
    const fallbackMap = fallbackEvidenceMap(heuristicBase);
    const assessment = makeAssessment(fallbackMap);
    const report = reportFromDraft(heuristicBase, fallbackMap, fallbackDraft(heuristicBase, assessment), input.personaId, { promptVersion: `${PROFESSIONAL_CORE_VERSION}+${WRITER_CORE_VERSION}`, personaVersion: PERSONA_BIBLE_VERSION, stages: [], retryCount: 0, editorUsed: false });
    emit({ type: "stage", stage: "extract", status: "start" }); emit({ type: "stage", stage: "extract", status: "done" }); emit({ type: "stage", stage: "score", status: "start" }); emit({ type: "stage", stage: "score", status: "done" }); emit({ type: "stage", stage: "persona", status: "start" }); emit({ type: "roast", delta: report.hrReview.deepDive }); emit({ type: "stage", stage: "persona", status: "done" });
    return { report, provider: "mock", model: "heuristic-v2", costUsd: 0 };
  }

  emit({ type: "stage", stage: "extract", status: "start" });
  emit({ type: "finding", stage: "extract", message: "Читаю резюме целиком и отделяю текст от предположений." });
  const extractStartedAt = Date.now();
  let extract;
  let analystFallback = false;
  try {
    extract = await runExtractStage(input.resumeText);
  } catch (error) {
    if (error instanceof AiConfigError) throw error;
    analystFallback = true;
    extract = { map: null, costUsd: 0, provider: "fallback", model: "heuristic-v2", tokensIn: 0, tokensOut: 0 };
    console.error("[pipeline] professional core unavailable; using deterministic fallback", error);
  }
  const map = extract.map ?? fallbackEvidenceMap(heuristicBase);
  emit({ type: "stage", stage: "extract", status: "done" });
  const assessment = makeAssessment(map);
  const theatreFindings = theatreFromAssessment(assessment);
  for (const item of theatreFindings) emit({ type: "finding", stage: "extract", message: item.message });

  emit({ type: "stage", stage: "score", status: "start" });
  const score = scoreFromEvidence(map, heuristicBase.score);
  emit({ type: "stage", stage: "score", status: "done" });
  emit({ type: "finding", stage: "score", message: `Собираю профессиональную картину для ${persona?.name ?? "HR"}.` });

  emit({ type: "stage", stage: "persona", status: "start" });
  const writerStartedAt = Date.now();
  const user = JSON.stringify({ assessment: { profile: map.profile, overallAssessment: { strongestSignal: assessment.find((item) => item.issueType === "strength")?.id || null, mainProblem: assessment.find((item) => item.issueType === "finding")?.id || null }, findings: assessment }, uiLanguage: "ru" });
  let retryCount = 0;
  let editorUsed = false;
  let writer: Awaited<ReturnType<typeof runAi>> | null = null;
  let writerCost = 0;
  try {
    writer = await runAi({ stage: "persona", system: writerSystem(input.personaId), user, jsonSchemaName: "persona_review_v1", temperature: 0.72, maxTokens: 2600 });
    writerCost += writer.costUsd;
  } catch (error) {
    if (error instanceof AiConfigError) throw error;
    retryCount = 1;
    try {
      writer = await runAi({ stage: "persona", system: writerSystem(input.personaId), user, jsonSchemaName: "persona_review_retry_v1", temperature: 0.55, maxTokens: 2600 });
      writerCost += writer.costUsd;
    } catch (retryError) {
      if (retryError instanceof AiConfigError) throw retryError;
      console.error("[pipeline] persona writer unavailable; using deterministic fallback", retryError);
    }
  }
  let validation = writer
    ? validatePersonaDraft(jsonObject(writer.content), new Set(assessment.map((item) => item.id)))
    : { ok: false, errors: ["писатель недоступен"] as string[] };
  if (writer && !validation.ok) {
    retryCount = 1;
    editorUsed = true;
    try {
      const repaired = await runAi({ stage: "persona", system: `${writerSystem(input.personaId)}\n\n${editorPrompt(validation.errors)} (${EDITOR_CORE_VERSION})`, user: JSON.stringify({ previous: jsonObject(writer.content), assessment: JSON.parse(user).assessment }), jsonSchemaName: "persona_review_repair_v1", temperature: 0.25, maxTokens: 2600 });
      writerCost += repaired.costUsd;
      writer = repaired;
      validation = validatePersonaDraft(jsonObject(repaired.content), new Set(assessment.map((item) => item.id)));
    } catch (error) {
      if (error instanceof AiConfigError) throw error;
      console.error("[pipeline] persona repair unavailable; using deterministic fallback", error);
    }
  }
  const draft = validation.ok && validation.draft ? validation.draft : fallbackDraft(heuristicBase, assessment);
  const latencyWriter = Date.now() - writerStartedAt;
  const meta = { promptVersion: `${PROFESSIONAL_CORE_VERSION}+${WRITER_CORE_VERSION}`, personaVersion: PERSONA_BIBLE_VERSION, stages: [
    { name: analystFallback ? "professional-core-fallback" : "professional-core", model: extract.model, latencyMs: extractStartedAt ? writerStartedAt - extractStartedAt : 0, tokensIn: extract.tokensIn, tokensOut: extract.tokensOut },
    { name: writer ? "persona-writer" : "persona-writer-fallback", model: writer?.model ?? "heuristic-v2", latencyMs: latencyWriter, tokensIn: writer?.tokensIn ?? 0, tokensOut: writer?.tokensOut ?? 0 },
  ], retryCount, editorUsed };
  const report = groundReport(reportFromDraft({ ...heuristicBase, score, viralMetrics: { ...heuristicBase.viralMetrics, responsibilitiesCount: map.claims.filter((item) => item.type === "duty").length, achievementsCount: map.claims.filter((item) => item.type === "achievement" && (item.hasMetric || item.hasOutcome)).length, unprovenClaimsCount: map.claims.filter((item) => item.isGeneric && !item.hasOutcome).length }, theatreFindings }, map, draft, input.personaId, meta), input.resumeText);
  emit({ type: "roast", delta: report.hrReview.deepDive });
  emit({ type: "stage", stage: "persona", status: "done" });
  return { report, provider: writer?.provider ?? extract.provider, model: writer?.model ?? extract.model, costUsd: extract.costUsd + writerCost };
}
