import { z } from "zod";

import { runAi } from "@/lib/ai/gateway";
import { PROFESSIONAL_CORE_PROMPT } from "@/lib/ai/prompts/professional-core";
import type { PersonaId } from "@/lib/personas";
import { CHARACTER_DIRECTION } from "@/lib/ai/voice/direction";
import { PROFESSIONAL_CONTEXT_GUIDE } from "@/lib/ai/prompts/professional-context";
import { personaPreference } from "@/lib/ai/persona-focus";

export function analystSystem(personaId?: PersonaId): string {
  if (!personaId) return PROFESSIONAL_CORE_PROMPT;
  return `${PROFESSIONAL_CORE_PROMPT}\n\nПРОФЕССИОНАЛЬНАЯ ОПТИКА ПЕРСОНАЖА\n${CHARACTER_DIRECTION[personaId]}\n${personaPreference(personaId)}\nЧитай всё резюме самостоятельно. Выбирай значимые наблюдения с этой точки зрения, сохраняя критически важные проблемы и сильные стороны. В оценке пиши аналитически, без шуток и без имитации голоса. Не выдумывай различия с другими HR.\n\nПРОФЕССИОНАЛЬНЫЙ КОНТЕКСТ\nРазличай профессию, отрасль, уровень и конкретную роль; если они неясны, обозначь неопределённость. Для каждого наблюдения установи, какая задача, действие, ограничение, решение или результат действительно видны и почему именно они важны для этой работы. Профессиональные знания — гипотезы для чтения, не факты о кандидате и не обязательный чек-лист. Для редких и регулируемых специальностей не утверждай требования или стандарты, которые не подтверждены текстом. Если информации мало, не сочиняй контекст.\n\n${PROFESSIONAL_CONTEXT_GUIDE}`;
}

const ConfidenceSchema = z.enum(["high", "medium", "low"]);

export const ProfessionalAssessmentSchema = z.object({
  candidateContext: z.object({
    primaryProfession: z.string().min(2),
    secondaryContext: z.string(),
    claimedLevel: z.string(),
    inferredLevel: z.string(),
    industry: z.string(),
    careerPattern: z.string(),
    confidence: z.number().min(0).max(1),
  }),
  professionalAssessment: z.object({
    overallImpression: z.string().min(20),
    strongestProfessionalSignal: z.string().min(10),
    mainResumeProblem: z.string().min(10),
    seniorityConsistency: z.string().min(10),
    resumeVsExperienceGap: z.string().min(10),
  }),
  findings: z.array(z.object({
    id: z.string().regex(/^F\d{2,}$/),
    sourceQuote: z.string().min(8).max(500),
    interpretation: z.string().min(10).max(900),
    whyItMatters: z.string().min(10).max(900),
    severity: z.enum(["critical", "high", "medium", "low"]),
    confidence: ConfidenceSchema,
    issueType: z.string().min(2).max(120),
  })).max(14),
  strengths: z.array(z.object({
    id: z.string().regex(/^S\d{2,}$/),
    sourceQuote: z.string().min(8).max(500),
    interpretation: z.string().min(10).max(900),
  })).max(8),
  questionsCreatedByResume: z.array(z.string().min(8).max(500)).max(12),
  uncertainties: z.array(z.string().min(4).max(500)).max(12),
  claimsNotAllowed: z.array(z.string().min(4).max(500)).max(12),
});

export type ProfessionalAssessment = z.infer<typeof ProfessionalAssessmentSchema>;

const string = { type: "string" } as const;
const bounded = (minLength: number, maxLength: number) => ({ type: "string", minLength, maxLength });
const minBounded = (minLength: number) => ({ type: "string", minLength });
const stringArray = { type: "array", maxItems: 12, items: bounded(4, 500) } as const;

export const PROFESSIONAL_ASSESSMENT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["candidateContext", "professionalAssessment", "findings", "strengths", "questionsCreatedByResume", "uncertainties", "claimsNotAllowed"],
  properties: {
    candidateContext: {
      type: "object", additionalProperties: false,
      required: ["primaryProfession", "secondaryContext", "claimedLevel", "inferredLevel", "industry", "careerPattern", "confidence"],
      properties: {
        primaryProfession: string, secondaryContext: string, claimedLevel: string, inferredLevel: string,
        industry: string, careerPattern: string, confidence: { type: "number", minimum: 0, maximum: 1 },
      },
    },
    professionalAssessment: {
      type: "object", additionalProperties: false,
      required: ["overallImpression", "strongestProfessionalSignal", "mainResumeProblem", "seniorityConsistency", "resumeVsExperienceGap"],
      properties: {
        overallImpression: minBounded(20), strongestProfessionalSignal: minBounded(10), mainResumeProblem: minBounded(10),
        seniorityConsistency: minBounded(10), resumeVsExperienceGap: minBounded(10),
      },
    },
    findings: {
      type: "array", maxItems: 14,
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "sourceQuote", "interpretation", "whyItMatters", "severity", "confidence", "issueType"],
        properties: {
          id: { type: "string", pattern: "^F[0-9]{2,}$" }, sourceQuote: bounded(8, 500), interpretation: bounded(10, 900), whyItMatters: bounded(10, 900),
          severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
          confidence: { type: "string", enum: ["high", "medium", "low"] }, issueType: bounded(2, 120),
        },
      },
    },
    strengths: {
      type: "array", maxItems: 8,
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "sourceQuote", "interpretation"],
        properties: { id: { type: "string", pattern: "^S[0-9]{2,}$" }, sourceQuote: bounded(8, 500), interpretation: bounded(10, 900) },
      },
    },
    questionsCreatedByResume: { type: "array", maxItems: 12, items: bounded(8, 500) },
    uncertainties: stringArray,
    claimsNotAllowed: stringArray,
  },
};

function normalizeQuote(value: string): string {
  return value.toLowerCase().replace(/[«»“”„]/g, '"').replace(/\s+/g, " ").trim();
}

function groundedSourceQuote(quote: string, resumeText: string): string | null {
  const needle = normalizeQuote(quote.trim().replace(/^[«“„"]([\s\S]*)[»”"]$/u, "$1"));
  if (needle.length < 8) return null;
  // Keep the actual span, never the containing line (which may be the entire CV).
  const pattern = needle.split(/\s+/u).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/"/g, '[«»“”„"]').replace(/[её]/g, "[её]")).join("\\s+");
  const matched = resumeText.match(new RegExp(pattern, "iu"))?.[0];
  // The model's quote is bounded, but the original span may contain much more
  // whitespace (for example from a PDF). Keep an exact, bounded source span.
  return matched ? matched.slice(0, 500).trimEnd() : null;
}

export function parseGroundedAssessment(input: unknown, resumeText: string): { assessment: ProfessionalAssessment | null; errors: string[] } {
  const parsed = ProfessionalAssessmentSchema.safeParse(input);
  if (!parsed.success) return { assessment: null, errors: ["неверная структура профессиональной оценки"] };
  const abilityJudgment = /(кандидат|человек|он|она|вы|ты).{0,32}(умеет|не умеет|может|не может|способен|неспособен)|(?:показывает|подтверждает|демонстрирует|признак)\s+(?:\S+\s+){0,2}способност/iu;
  // A quote can be exact while a generic claim about absent skills, metrics or
  // scale is still not entailed by it. Keep that uncertainty, not a defect card.
  const genericAbsence = /(?:недостаточно|нет)\s+информации\s+о|не\s+указан[а-яё]*\s+(?:сведени|данны|информац)/iu;
  const unrelatedChecklist = /теоретич|инструмент|масштаб|сложност|количествен|метрик|цифр/iu;
  const downgraded = parsed.data.findings.filter(item => groundedSourceQuote(item.sourceQuote, resumeText) && genericAbsence.test(item.interpretation) && unrelatedChecklist.test(item.interpretation));
  const findings = parsed.data.findings.flatMap((item) => {
    const sourceQuote = groundedSourceQuote(item.sourceQuote, resumeText);
    return sourceQuote && !downgraded.includes(item) && !abilityJudgment.test(`${item.interpretation} ${item.whyItMatters}`) ? [{ ...item, sourceQuote }] : [];
  });
  const strengths = parsed.data.strengths.flatMap((item) => {
    const sourceQuote = groundedSourceQuote(item.sourceQuote, resumeText);
    return sourceQuote && !abilityJudgment.test(item.interpretation) ? [{ ...item, sourceQuote }] : [];
  });
  const ids = [...findings.map((item) => item.id), ...strengths.map((item) => item.id)];
  const errors: string[] = [];
  if (new Set(ids).size !== ids.length) errors.push("повторяющиеся идентификаторы наблюдений");
  const excluded = parsed.data.findings.length + parsed.data.strengths.length - ids.length - downgraded.length;
  if (excluded) errors.push(`исключено неподтверждённых наблюдений: ${excluded}`);
  if (ids.length === 0 || new Set(ids).size !== ids.length) return { assessment: null, errors };
  const uncertainties = [...parsed.data.uncertainties, ...downgraded.map(item => item.interpretation)].slice(0, 12);
  const professionalAssessment = findings.length ? parsed.data.professionalAssessment : {
    ...parsed.data.professionalAssessment,
    mainResumeProblem: "По подтверждённым наблюдениям существенный недостаток описания не установлен.",
  };
  const grounded = ProfessionalAssessmentSchema.safeParse({ ...parsed.data, professionalAssessment, findings, strengths, uncertainties });
  return grounded.success
    ? { assessment: grounded.data, errors }
    : { assessment: null, errors: [...errors, "подтверждённая оценка не прошла проверку структуры"] };
}

export async function runProfessionalAnalyst(resumeText: string, personaId?: PersonaId) {
  const ai = await runAi({
    stage: "extract",
    system: analystSystem(personaId),
    user: resumeText.trim(),
    jsonSchemaName: "professional_assessment_v2",
    jsonSchema: PROFESSIONAL_ASSESSMENT_JSON_SCHEMA,
    temperature: 0.15,
    maxTokens: 5200,
    timeoutMs: 65_000,
    reasoningEffort: "low",
    model: process.env.OPENAI_ANALYST_MODEL ?? "gpt-5.4-mini",
  });
  let raw: unknown = null;
  try { raw = JSON.parse(ai.content); } catch { /* Zod-ошибка ниже */ }
  return { ...ai, ...parseGroundedAssessment(raw, resumeText) };
}
