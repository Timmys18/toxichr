/** Конвейер: Professional Analyst → Persona Writer → validator → optional repair. */
import type { PersonaId } from "@/lib/personas";
import { PERSONAS } from "@/lib/personas";
import { AnalysisReportSchema, type AnalysisReport, type Problem, type TheatreFinding } from "@/lib/ai/schemas";
import { runHeuristicAnalysis } from "@/lib/ai/heuristics";
import { AiConfigError, AiTimeoutError, aiMockEnabled, runAi } from "@/lib/ai/gateway";
import { groundReport } from "@/lib/ai/grounding";
import { parseGroundedAssessment, runProfessionalAnalyst, type ProfessionalAssessment } from "@/lib/ai/professional-assessment";
import { PERSONA_BIBLES, PERSONA_BIBLE_VERSION } from "@/lib/ai/prompts/persona-bibles";
import { WRITER_CORE_PROMPT, WRITER_CORE_VERSION } from "@/lib/ai/prompts/writer-core";
import { PROFESSIONAL_CORE_VERSION } from "@/lib/ai/prompts/professional-core";
import { editorPrompt, EDITOR_CORE_VERSION } from "@/lib/ai/prompts/editor-core";
import { personaFocus } from "@/lib/ai/persona-focus";
import {
  buildSharePrivacyContext,
  PERSONA_DRAFT_JSON_SCHEMA,
  PersonaDraftSchema,
  stripSensitiveShareText,
  validatePersonaDraft,
  type PersonaDraft,
} from "@/lib/ai/writer-validator";

export type PipelineStage = "extract" | "score" | "persona";
export type PipelineEvent =
  | { type: "stage"; stage: PipelineStage; status: "start" | "done" }
  | { type: "finding"; stage: PipelineStage; message: string }
  | { type: "roast"; delta: string };

export type PipelineInput = {
  resumeText: string;
  personaId: PersonaId;
  professionalAssessment?: ProfessionalAssessment;
  onEvent?: (event: PipelineEvent) => void;
};
export type PipelineResult = { report: AnalysisReport; provider: string; model: string; costUsd: number };

function writerSystem(personaId: PersonaId): string {
  return `${WRITER_CORE_PROMPT}\n\nБиблия персоны (${PERSONA_BIBLE_VERSION}):\n${PERSONA_BIBLES[personaId]}`;
}

function jsonObject(content: string): unknown {
  try { return JSON.parse(content); } catch { return null; }
}

function resumeTextVerbCount(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0;
}

function filterShareLines(input: unknown, privacy: ReturnType<typeof buildSharePrivacyContext>, personaId: PersonaId): unknown {
  const parsed = PersonaDraftSchema.safeParse(input);
  if (!parsed.success) return input;
  const safe = parsed.data.shareLines.map((line) => stripSensitiveShareText(line, privacy)).filter((line): line is string => Boolean(line));
  const safeFallback: Record<PersonaId, string> = {
    tamara: "Большая должность работает только вместе с содержанием сопоставимого веса.",
    lera: "Сильный опыт заметен, когда резюме не говорит языком соседних файлов.",
    gleb: "Сильная формулировка должна пережить первый уточняющий вопрос.",
    vadik: "Хорошая строка отвечает, что ты сделал и что после этого изменилось.",
  };
  return {
    ...parsed.data,
    shareLines: safe.length ? safe : [safeFallback[personaId]],
  };
}

function fallbackAssessment(base: AnalysisReport): ProfessionalAssessment {
  const findings = base.topProblems.slice(0, 6).map((problem, index) => ({
    id: `F${String(index + 1).padStart(2, "0")}`,
    sourceQuote: problem.quote,
    interpretation: problem.diagnosis,
    whyItMatters: problem.recommendation,
    severity: problem.severity,
    confidence: "medium" as const,
    issueType: "качество формулировки",
  }));
  const strengths = base.strengths.filter((item) => item.quote).slice(0, 4).map((item, index) => ({
    id: `S${String(index + 1).padStart(2, "0")}`,
    sourceQuote: item.quote!,
    interpretation: item.comment,
  }));
  return {
    candidateContext: {
      primaryProfession: base.candidateProfile.primaryRole,
      secondaryContext: base.candidateProfile.professionalFamily,
      claimedLevel: base.candidateProfile.claimedLevel,
      inferredLevel: base.candidateProfile.inferredLevel,
      industry: base.candidateProfile.industry ?? "не указан",
      careerPattern: "Надёжно определить по автоматическому резервному анализу нельзя.",
      confidence: base.candidateProfile.confidence,
    },
    professionalAssessment: {
      overallImpression: base.hrReview.firstImpression,
      strongestProfessionalSignal: strengths[0]?.interpretation ?? "В тексте есть профессиональный опыт, но сильнейший сигнал требует ручной проверки.",
      mainResumeProblem: findings[0]?.interpretation ?? "Критичная проблема в резервном анализе не установлена.",
      seniorityConsistency: "Соответствие уровня требует проверки живым аналитиком.",
      resumeVsExperienceGap: "Резервный режим не делает вывод о разрыве между опытом и его описанием.",
    },
    findings,
    strengths,
    questionsCreatedByResume: findings.map((item) => `Какой контекст следует добавить к фрагменту «${item.sourceQuote.slice(0, 80)}»?`).slice(0, 5),
    uncertainties: ["Профессиональная оценка построена в резервном режиме."],
    claimsNotAllowed: ["Нельзя делать вывод о способностях человека по резервному анализу."],
  };
}

function theatreFromAssessment(assessment: ProfessionalAssessment, fallback: TheatreFinding[]): TheatreFinding[] {
  const items = [
    ...assessment.findings.map((finding) => ({ id: `theatre-${finding.id}`, stage: "finding", message: "Проверяю профессиональный смысл формулировки и её опору в тексте." })),
    ...assessment.strengths.map((strength) => ({ id: `theatre-${strength.id}`, stage: "strength", message: "Нашёл сильный профессиональный сигнал в исходном тексте." })),
  ];
  return [...items, ...fallback].slice(0, Math.max(3, Math.min(6, items.length || 3)));
}

function fallbackDraft(base: AnalysisReport, assessment: ProfessionalAssessment, personaId: PersonaId): PersonaDraft {
  const focus = personaFocus(assessment, personaId);
  const evidence = focus.evidence;
  const quote = evidence[0]?.sourceQuote ?? base.topProblems[0]?.quote ?? "";
  const secondQuote = evidence[1]?.sourceQuote ?? quote;
  const focusItem = evidence[0];
  const isFinding = focusItem ? assessment.findings.some((item) => item.id === focusItem.id) : false;
  const interpretation = focusItem?.interpretation ?? "В этой строке есть профессиональный факт, который стоит точнее показать.";
  const personaComment: Record<PersonaId, string> = {
    tamara: isFinding
      ? `«${quote}» — здесь важна граница роли: ${interpretation} ${focus.question}`
      : `«${quote}» подтверждает вес этой роли: ${interpretation} Не приписываю полномочия сверх написанного; покажите рядом именно вашу зону решения.`,
    lera: `Для первого экрана резюме выбрала бы «${quote}»: ${interpretation} Рекрутер должен сразу увидеть эту специализацию, а не искать её среди обязанностей.`,
    gleb: isFinding
      ? `В строке «${quote}» есть вопрос к причинной связи: ${interpretation} Уточните механизм именно этого результата, если он вам известен; новую цифру не придумывайте.`
      : `«${quote}» уже даёт связку действия и результата: ${interpretation} Для проверки причинности можно уточнить способ измерения, но сам подтверждённый результат не нужно обесценивать.`,
    vadik: isFinding
      ? `«${quote}» — тут хочу понять личное действие: ${interpretation} ${focus.question}`
      : `«${quote}» — это уже дело, а не список качеств: ${interpretation} Вынеси собственное действие вперёд, чтобы практическая польза читалась сразу.`,
  };
  const title: Record<PersonaId, string> = {
    tamara: "Должность и полномочия: сверим границы",
    lera: "Что рекрутер увидит первым?",
    gleb: "Как решение связано с результатом?",
    vadik: "Что здесь сделано лично?",
  };
  return {
    verdict: { title: title[personaId], comment: personaComment[personaId].slice(0, 900) },
    contentBlocks: [
      { type: "observation", findingIds: evidence.map((item) => item.id), content: personaComment[personaId] },
      { type: "question", findingIds: evidence.slice(1).map((item) => item.id).length ? [evidence[1].id] : evidence.map((item) => item.id), content: `К фрагменту «${secondQuote}»: ${focus.question}` },
      { type: "summary", findingIds: [], content: personaComment[personaId] },
    ],
    priorities: (assessment.findings.length ? assessment.findings : evidence).slice(0, 3).map((item) => ({
      findingIds: [item.id],
      action: `${focus.question} Уточните только подтверждённое в этой строке.`,
    })),
    shareLines: ["Резюме становится сильнее, когда громкость формулировки совпадает с её содержанием."],
  };
}

function reportFromDraft(
  base: AnalysisReport,
  assessment: ProfessionalAssessment,
  draft: PersonaDraft,
  personaId: PersonaId,
  meta: AnalysisReport["generationMeta"],
  resumeText: string,
): AnalysisReport {
  const blocksFor = (id: string) => draft.contentBlocks.find((item) => item.findingIds.includes(id))?.content;
  const actionFor = (id: string) => draft.priorities.find((item) => item.findingIds.includes(id))?.action ?? "Уточните формулировку только реальными фактами из опыта.";
  const topProblems: Problem[] = assessment.findings.slice(0, 8).map((item, index) => ({
    id: `p-${index}`,
    severity: item.severity,
    title: item.interpretation.slice(0, 120),
    quote: item.sourceQuote,
    roast: blocksFor(item.id) ?? item.interpretation,
    diagnosis: item.whyItMatters,
    recommendation: actionFor(item.id),
  }));
  const strengths = assessment.strengths.slice(0, 6).map((item, index) => ({
    id: `s-${index}`, title: item.interpretation.slice(0, 120), quote: item.sourceQuote,
    comment: blocksFor(item.id) ?? item.interpretation,
  }));
  const privacy = buildSharePrivacyContext(resumeText, [assessment.candidateContext.primaryProfession, assessment.candidateContext.industry]);
  const safeShareLines = draft.shareLines.map((line) => stripSensitiveShareText(line, privacy)).filter((line): line is string => Boolean(line));
  const body = draft.contentBlocks.map((block) => block.content).join("\n\n");
  const summary = draft.contentBlocks.find((block) => block.type === "summary")?.content ?? draft.verdict.comment;
  const firstImpression = `${draft.verdict.comment} ${assessment.professionalAssessment.overallImpression}`;
  const fixPriority = draft.priorities.map((item) => item.action).join(" ") || "Сохраните сильные стороны и уточните только те формулировки, которые создают вопросы.";
  return AnalysisReportSchema.parse({
    ...base,
    candidateProfile: {
      primaryRole: assessment.candidateContext.primaryProfession,
      professionalFamily: assessment.candidateContext.secondaryContext || assessment.candidateContext.primaryProfession,
      claimedLevel: assessment.candidateContext.claimedLevel,
      inferredLevel: assessment.candidateContext.inferredLevel,
      industry: assessment.candidateContext.industry || undefined,
      confidence: assessment.candidateContext.confidence,
    },
    verdict: draft.verdict,
    hrReview: {
      firstImpression: firstImpression.length >= 80 ? firstImpression : `${firstImpression} Оценка относится только к содержанию резюме.`,
      deepDive: body.length >= 200 ? body : `${body}\n\n${assessment.professionalAssessment.mainResumeProblem}\n\n${summary}`,
      hiringTake: summary.length >= 60 ? summary : `${summary} Итог относится к тому, что показывает текст резюме.`,
      fixPriority: fixPriority.length >= 60 ? fixPriority : `${fixPriority} Используйте только подтверждённый опыт.`,
    },
    topProblems,
    strengths,
    theatreFindings: theatreFromAssessment(assessment, base.theatreFindings),
    shareQuotes: (safeShareLines.length ? safeShareLines : ["Резюме сильнее, когда формулировка выдерживает уточняющий вопрос."]).map((value, index) => ({ id: `q-${index}`, kind: (["precise", "funny", "safe"] as const)[index] ?? "safe", text: value })),
    improvementPlan: draft.priorities.map((item, index) => ({ id: `plan-${index}`, horizon: index === 0 ? "10m" : index === 1 ? "30m" : "recall", action: item.action, problemIds: item.findingIds })),
    contentBlocks: draft.contentBlocks,
    professionalAssessment: assessment,
    generationMeta: meta,
    recommendedPersonaId: personaId,
  });
}

export async function runAnalysisPipeline(input: PipelineInput): Promise<PipelineResult> {
  const emit = input.onEvent ?? (() => {});
  const suppliedAssessment = input.professionalAssessment
    ? parseGroundedAssessment(input.professionalAssessment, input.resumeText).assessment ?? undefined
    : undefined;
  const base = groundReport(runHeuristicAnalysis(input.resumeText, input.personaId), input.resumeText);
  const persona = PERSONAS.find((item) => item.id === input.personaId);
  emit({ type: "stage", stage: "extract", status: "start" });
  emit({ type: "finding", stage: "extract", message: "Читаю резюме целиком и определяю профессиональный контекст." });

  if (aiMockEnabled()) {
    const assessment = suppliedAssessment ?? fallbackAssessment(base);
    const draft = fallbackDraft(base, assessment, input.personaId);
    const report = reportFromDraft(base, assessment, draft, input.personaId, {
      promptVersion: `${PROFESSIONAL_CORE_VERSION}+${WRITER_CORE_VERSION}`,
      personaVersion: PERSONA_BIBLE_VERSION, stages: [], retryCount: 0, editorUsed: false,
    }, input.resumeText);
    emit({ type: "stage", stage: "extract", status: "done" });
    emit({ type: "stage", stage: "score", status: "start" }); emit({ type: "stage", stage: "score", status: "done" });
    emit({ type: "stage", stage: "persona", status: "start" }); emit({ type: "roast", delta: report.hrReview.deepDive }); emit({ type: "stage", stage: "persona", status: "done" });
    return { report, provider: "mock", model: "heuristic-fallback", costUsd: 0 };
  }

  const analystStartedAt = Date.now();
  let analyst: Awaited<ReturnType<typeof runProfessionalAnalyst>> | null = null;
  let analystFallback = false;
  let analystRetries = 0;
  if (!suppliedAssessment) {
    try {
      analyst = await runProfessionalAnalyst(input.resumeText);
      if (!analyst.assessment) throw new Error(analyst.errors.join("; "));
    } catch (error) {
      if (error instanceof AiConfigError) throw error;
      if (error instanceof AiTimeoutError) {
        analystFallback = true;
        console.error("[pipeline] professional analyst timed out; using bounded fallback", error);
      } else {
        analystRetries = 1;
        console.error("[pipeline] professional analyst first attempt failed; retrying once", error);
        try {
          analyst = await runProfessionalAnalyst(input.resumeText);
          if (!analyst.assessment) throw new Error(analyst.errors.join("; "));
        } catch (retryError) {
          if (retryError instanceof AiConfigError) throw retryError;
          analystFallback = true;
          console.error("[pipeline] professional analyst unavailable; using bounded fallback", retryError);
        }
      }
    }
  }
  const assessment = suppliedAssessment ?? analyst?.assessment ?? fallbackAssessment(base);
  emit({ type: "stage", stage: "extract", status: "done" });
  for (const item of theatreFromAssessment(assessment, base.theatreFindings)) emit({ type: "finding", stage: "extract", message: item.message });
  emit({ type: "stage", stage: "score", status: "start" }); emit({ type: "stage", stage: "score", status: "done" });
  emit({ type: "finding", stage: "score", message: `Передаю профессиональную оценку ${persona?.name ?? "выбранному HR"}.` });

  emit({ type: "stage", stage: "persona", status: "start" });
  const writerStartedAt = Date.now();
  const evidenceIds = new Set([...assessment.findings.map((item) => item.id), ...assessment.strengths.map((item) => item.id)]);
  const metricIssueGrounded = assessment.findings.some((item) => /цифр|числ|метрик|количеств|объ[её]м|масштаб/iu.test(`${item.interpretation} ${item.whyItMatters}`));
  const feminineVerbs = resumeTextVerbCount(input.resumeText, /[а-яё]+(?:ила|ала|яла|ела)(?=[\s,.!?;:]|$)/giu);
  const masculineVerbs = resumeTextVerbCount(input.resumeText, /[а-яё]+(?:ил|ал|ял|ёл)(?=[\s,.!?;:]|$)/giu);
  const avoidMasculineSecondPerson = feminineVerbs >= 2 && masculineVerbs === 0;
  const editorialFocus = personaFocus(assessment, input.personaId);
  const writerInput = JSON.stringify({ assessment, editorialFocus, allowedFindingIds: [...evidenceIds], uiLanguage: "ru", noUnsupportedCriticism: !metricIssueGrounded ? "В замечаниях нет доказанной проблемы с числовыми результатами. Не требуй добавить цифру или масштаб; можно предложить переставить уже названный факт либо задать узкий вопрос без оценки недостатка." : undefined });
  const privacy = buildSharePrivacyContext(input.resumeText, [assessment.candidateContext.primaryProfession, assessment.candidateContext.industry]);
  let retryCount = 0;
  let editorUsed = false;
  let writer: Awaited<ReturnType<typeof runAi>> | null = null;
  let editor: Awaited<ReturnType<typeof runAi>> | null = null;
  let writerCost = 0;
  try {
    writer = await runAi({ stage: "persona", system: writerSystem(input.personaId), user: writerInput, jsonSchemaName: "persona_review_v2", jsonSchema: PERSONA_DRAFT_JSON_SCHEMA, temperature: 0.72, maxTokens: 3000, timeoutMs: 40_000, reasoningEffort: "low", model: process.env.OPENAI_WRITER_MODEL ?? "gpt-5-mini" });
    writerCost += writer.costUsd;
  } catch (error) {
    if (error instanceof AiConfigError) throw error;
    if (error instanceof AiTimeoutError) {
      console.error("[pipeline] persona writer timed out; using bounded fallback", error);
    } else {
      retryCount = 1;
      try {
        writer = await runAi({ stage: "persona", system: writerSystem(input.personaId), user: writerInput, jsonSchemaName: "persona_review_retry_v2", jsonSchema: PERSONA_DRAFT_JSON_SCHEMA, temperature: 0.5, maxTokens: 3000, timeoutMs: 40_000, reasoningEffort: "low", model: process.env.OPENAI_WRITER_MODEL ?? "gpt-5-mini" });
        writerCost += writer.costUsd;
      } catch (retryError) {
        if (retryError instanceof AiConfigError) throw retryError;
        console.error("[pipeline] persona writer unavailable; using bounded fallback", retryError);
      }
    }
  }
  let validation = writer
    ? validatePersonaDraft(filterShareLines(jsonObject(writer.content), privacy, input.personaId), evidenceIds, { personaId: input.personaId, privacy, enforceVoice: true, hasFindings: assessment.findings.length > 0, metricIssueGrounded, avoidMasculineSecondPerson })
    : { ok: false, errors: ["писатель недоступен"] };
  if (writer && !validation.ok) {
    console.warn("[pipeline] persona draft rejected by quality gate", validation.errors);
    editorUsed = true;
    retryCount = Math.max(1, retryCount);
    try {
      editor = await runAi({
        stage: "persona", system: `${writerSystem(input.personaId)}\n\n${editorPrompt(validation.errors)} (${EDITOR_CORE_VERSION})`,
        user: JSON.stringify({ previous: jsonObject(writer.content), assessment, editorialFocus, allowedFindingIds: [...evidenceIds] }), jsonSchemaName: "persona_review_repair_v2",
        jsonSchema: PERSONA_DRAFT_JSON_SCHEMA, temperature: 0.2, maxTokens: 3000, timeoutMs: 35_000, reasoningEffort: "minimal",
        model: process.env.OPENAI_EDITOR_MODEL ?? "gpt-5-nano",
      });
      writerCost += editor.costUsd;
      validation = validatePersonaDraft(filterShareLines(jsonObject(editor.content), privacy, input.personaId), evidenceIds, { personaId: input.personaId, privacy, enforceVoice: true, hasFindings: assessment.findings.length > 0, metricIssueGrounded, avoidMasculineSecondPerson });
      if (!validation.ok) console.warn("[pipeline] edited persona draft still rejected", validation.errors);
    } catch (error) {
      if (error instanceof AiConfigError) throw error;
      console.error("[pipeline] conditional persona repair unavailable", error);
    }
  }
  const draft = validation.ok && validation.draft ? validation.draft : fallbackDraft(base, assessment, input.personaId);
  const writerLatency = Date.now() - writerStartedAt;
  const meta = {
    promptVersion: `${PROFESSIONAL_CORE_VERSION}+${WRITER_CORE_VERSION}`,
    personaVersion: PERSONA_BIBLE_VERSION,
    stages: [
      {
        name: suppliedAssessment ? "professional-analyst-reused" : analystFallback ? "professional-analyst-fallback" : "professional-analyst",
        model: suppliedAssessment ? "stored-assessment" : analyst?.model ?? "heuristic-fallback",
        latencyMs: suppliedAssessment ? 0 : writerStartedAt - analystStartedAt,
        tokensIn: analyst?.tokensIn ?? 0,
        tokensOut: analyst?.tokensOut ?? 0,
      },
      { name: writer ? "persona-writer" : "persona-writer-fallback", model: writer?.model ?? "heuristic-fallback", latencyMs: writerLatency, tokensIn: writer?.tokensIn ?? 0, tokensOut: writer?.tokensOut ?? 0 },
      ...(editor ? [{ name: "persona-editor", model: editor.model, latencyMs: 0, tokensIn: editor.tokensIn, tokensOut: editor.tokensOut }] : []),
      ...(!validation.ok ? [{ name: "persona-output-fallback", model: "grounded-persona-focus", latencyMs: 0, tokensIn: 0, tokensOut: 0 }] : []),
    ],
    retryCount: retryCount + analystRetries,
    editorUsed,
  };
  const report = groundReport(reportFromDraft(base, assessment, draft, input.personaId, meta, input.resumeText), input.resumeText);
  emit({ type: "roast", delta: report.hrReview.deepDive }); emit({ type: "stage", stage: "persona", status: "done" });
  return { report, provider: editor?.provider ?? writer?.provider ?? analyst?.provider ?? "fallback", model: editor?.model ?? writer?.model ?? analyst?.model ?? "heuristic-fallback", costUsd: (analyst?.costUsd ?? 0) + writerCost };
}
