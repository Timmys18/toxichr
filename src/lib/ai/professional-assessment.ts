import { z } from "zod";

import { runAi } from "@/lib/ai/gateway";
import { PROFESSIONAL_CORE_PROMPT } from "@/lib/ai/prompts/professional-core";

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
const stringArray = { type: "array", items: string } as const;

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
        overallImpression: string, strongestProfessionalSignal: string, mainResumeProblem: string,
        seniorityConsistency: string, resumeVsExperienceGap: string,
      },
    },
    findings: {
      type: "array", maxItems: 14,
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "sourceQuote", "interpretation", "whyItMatters", "severity", "confidence", "issueType"],
        properties: {
          id: { type: "string", pattern: "^F[0-9]{2,}$" }, sourceQuote: string, interpretation: string, whyItMatters: string,
          severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
          confidence: { type: "string", enum: ["high", "medium", "low"] }, issueType: string,
        },
      },
    },
    strengths: {
      type: "array", maxItems: 8,
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "sourceQuote", "interpretation"],
        properties: { id: { type: "string", pattern: "^S[0-9]{2,}$" }, sourceQuote: string, interpretation: string },
      },
    },
    questionsCreatedByResume: stringArray,
    uncertainties: stringArray,
    claimsNotAllowed: stringArray,
  },
};

function normalizeQuote(value: string): string {
  return value.toLowerCase().replace(/[«»“”„]/g, '"').replace(/\s+/g, " ").trim();
}

function groundedSourceQuote(quote: string, resumeText: string): string | null {
  const needle = normalizeQuote(quote);
  if (needle.length < 8) return null;
  const lines = resumeText.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length >= 8);
  const exactLine = lines.find((line) => normalizeQuote(line).includes(needle));
  if (exactLine) return exactLine;
  const words = new Set(needle.match(/[a-zа-яё0-9-]{4,}/giu) ?? []);
  let best: { line: string; coverage: number } | null = null;
  for (const line of lines) {
    const lineWords = new Set(normalizeQuote(line).match(/[a-zа-яё0-9-]{4,}/giu) ?? []);
    const common = [...words].filter((word) => lineWords.has(word)).length;
    const coverage = words.size ? common / words.size : 0;
    if (!best || coverage > best.coverage) best = { line, coverage };
  }
  return best && words.size >= 4 && best.coverage >= 0.72 ? best.line : null;
}

export function parseGroundedAssessment(input: unknown, resumeText: string): { assessment: ProfessionalAssessment | null; errors: string[] } {
  const parsed = ProfessionalAssessmentSchema.safeParse(input);
  if (!parsed.success) return { assessment: null, errors: ["неверная структура профессиональной оценки"] };
  const abilityJudgment = /(кандидат|человек|он|она|вы|ты).{0,32}(умеет|не умеет|может|не может|способен|неспособен)|(?:показывает|подтверждает|демонстрирует|признак)\s+(?:\S+\s+){0,2}способност/iu;
  const findings = parsed.data.findings.flatMap((item) => {
    const sourceQuote = groundedSourceQuote(item.sourceQuote, resumeText);
    return sourceQuote && !abilityJudgment.test(`${item.interpretation} ${item.whyItMatters}`) ? [{ ...item, sourceQuote }] : [];
  });
  const strengths = parsed.data.strengths.flatMap((item) => {
    const sourceQuote = groundedSourceQuote(item.sourceQuote, resumeText);
    return sourceQuote && !abilityJudgment.test(item.interpretation) ? [{ ...item, sourceQuote }] : [];
  });
  const ids = [...findings.map((item) => item.id), ...strengths.map((item) => item.id)];
  const errors: string[] = [];
  if (new Set(ids).size !== ids.length) errors.push("повторяющиеся идентификаторы наблюдений");
  const excluded = parsed.data.findings.length + parsed.data.strengths.length - ids.length;
  if (excluded) errors.push(`исключено неподтверждённых наблюдений: ${excluded}`);
  if (ids.length === 0 || new Set(ids).size !== ids.length) return { assessment: null, errors };
  return { assessment: { ...parsed.data, findings, strengths }, errors };
}

export async function runProfessionalAnalyst(resumeText: string) {
  const ai = await runAi({
    stage: "extract",
    system: PROFESSIONAL_CORE_PROMPT,
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
