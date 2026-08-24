import { aiLiveEnabled, runAi } from "@/lib/ai/gateway";
import { runHeuristicAnalysis } from "@/lib/ai/heuristics";
import type { AnalysisReport, Problem } from "@/lib/ai/schemas";
import type { PersonaId } from "@/lib/personas";
import { z } from "zod";

export type ImprovementQuestion = {
  problemId: string;
  title: string;
  quote: string;
  question: string;
  prompts: string[];
};

export type ImprovementAnswer = {
  problemId: string;
  answer: string;
};

export type ImprovementReplacement = {
  problemId: string;
  original: string;
  replacement: string;
  grounded: boolean;
};

export function buildImprovementQuestions(
  report: AnalysisReport,
): ImprovementQuestion[] {
  return report.topProblems.slice(0, 7).map((problem) => ({
    problemId: problem.id,
    title: problem.title,
    quote: problem.quote,
    question: `Что в реальности стояло за формулировкой «${problem.quote}»?`,
    prompts: [
      "Что именно сделал лично ты?",
      "Какой был масштаб: команда, бюджет, срок или объём?",
      "Что изменилось в результате? Если цифры неизвестны — так и напиши.",
    ],
  }));
}

function numbers(text: string): string[] {
  return text.match(/\d+(?:[.,]\d+)?/g) ?? [];
}

function groundedNumbers(text: string, source: string): boolean {
  const allowed = new Set(numbers(source).map((value) => value.replace(",", ".")));
  return numbers(text).every((value) => allowed.has(value.replace(",", ".")));
}

const FUNCTION_WORDS = new Set([
  "а",
  "был",
  "была",
  "были",
  "в",
  "во",
  "для",
  "до",
  "его",
  "ее",
  "её",
  "за",
  "и",
  "из",
  "или",
  "их",
  "к",
  "как",
  "ко",
  "который",
  "которая",
  "которые",
  "на",
  "над",
  "но",
  "о",
  "об",
  "от",
  "по",
  "под",
  "при",
  "с",
  "свой",
  "свои",
  "свою",
  "со",
  "та",
  "те",
  "тот",
  "у",
  "через",
  "что",
  "эта",
  "эти",
  "это",
  "этот",
]);

function contentTokens(text: string): string[] {
  return (text.toLowerCase().replace(/ё/g, "е").match(/[\p{L}\p{N}+#.-]+/gu) ?? [])
    .map((token) => token.replace(/^[.+-]+|[.+-]+$/g, ""))
    .filter(
      (token) =>
        token.length > 0 &&
        !/^\d+(?:[.,]\d+)?$/.test(token) &&
        !FUNCTION_WORDS.has(token),
    );
}

function isOrderedSubsequence(candidate: string[], source: string[]): boolean {
  if (candidate.length === 0) return false;
  let sourceIndex = 0;
  for (const token of candidate) {
    while (sourceIndex < source.length && source[sourceIndex] !== token) {
      sourceIndex += 1;
    }
    if (sourceIndex >= source.length) return false;
    sourceIndex += 1;
  }
  return true;
}

/**
 * Консервативная граница доверия для AI-редактуры: модель может убрать повторы
 * и переставить служебные слова, но не может добавить ни одного нового
 * содержательного слова, числа или изменить порядок фактических опор.
 */
export function isGroundedImprovementText(
  candidate: string,
  sources: string[],
): boolean {
  const clean = candidate.replace(/\s+/g, " ").trim();
  if (clean.length < 3) return false;
  return sources.some(
    (source) =>
      groundedNumbers(clean, source) &&
      isOrderedSubsequence(contentTokens(clean), contentTokens(source)),
  );
}

function fallbackReplacement(problem: Problem, answer: string): string {
  const clean = answer.replace(/\s+/g, " ").trim();
  return clean || problem.quote;
}

export function selectSafeReplacement(
  problem: Problem,
  answer: string,
  aiCandidate?: string,
): string {
  const fallback = fallbackReplacement(problem, answer);
  const candidate = aiCandidate?.replace(/\s+/g, " ").trim();
  if (!candidate) return fallback;
  return isGroundedImprovementText(candidate, [answer, problem.quote])
    ? candidate
    : fallback;
}

const AiReplacementsSchema = z.object({
  replacements: z
    .array(
      z.object({
        problemId: z.string().trim().min(1).max(160),
        text: z.string().trim().min(1).max(2_000),
      }),
    )
    .max(12),
});

async function aiReplacements(input: {
  problems: Problem[];
  answers: ImprovementAnswer[];
  resumeText: string;
}): Promise<Record<string, string>> {
  if (!aiLiveEnabled()) return {};

  const response = await runAi({
    stage: "anti_generic",
    system: `Ты редактор резюме. Перепиши только перечисленные слабые строки.
Используй исключительно факты из исходного резюме и ответов кандидата.
Не добавляй новые компании, должности, технологии, сроки, масштабы, цифры или результаты.
Содержательные слова конкретной замены бери только из ответа кандидата или исходной слабой строки; разрешено лишь убрать повторы и изменить служебные слова и пунктуацию.
Если данных мало, сделай честную формулировку без конкретизации.
Верни только JSON: {"replacements":[{"problemId":"...","text":"..."}]}.`,
    user: JSON.stringify(input),
    jsonSchemaName: "resume_improvement",
    temperature: 0.2,
    maxTokens: 1800,
  });

  const start = response.content.indexOf("{");
  const end = response.content.lastIndexOf("}");
  if (start < 0 || end <= start) return {};
  const parsedJson: unknown = JSON.parse(response.content.slice(start, end + 1));
  const parsed = AiReplacementsSchema.safeParse(parsedJson);
  if (!parsed.success) return {};
  const allowedIds = new Set(input.problems.map((problem) => problem.id));

  return Object.fromEntries(
    parsed.data.replacements
      .filter((item) => allowedIds.has(item.problemId))
      .map((item) => [item.problemId, item.text]),
  );
}

export async function buildImprovedResume(input: {
  report: AnalysisReport;
  resumeText: string;
  answers: ImprovementAnswer[];
  personaId: PersonaId;
}) {
  const answerMap = new Map(
    input.answers.map((answer) => [answer.problemId, answer.answer.trim()]),
  );
  const problems = input.report.topProblems.filter((problem) =>
    answerMap.get(problem.id),
  );
  const ai: Record<string, string> = await aiReplacements({
    problems,
    answers: input.answers,
    resumeText: input.resumeText,
  }).catch(() => ({} as Record<string, string>));
  const candidates: ImprovementReplacement[] = problems.map((problem) => {
    const answer = answerMap.get(problem.id) ?? "";
    const safe = selectSafeReplacement(problem, answer, ai[problem.id]);
    return {
      problemId: problem.id,
      original: problem.quote,
      replacement: safe,
      grounded: isGroundedImprovementText(safe, [answer, problem.quote]),
    };
  });

  let improvedText = input.resumeText;
  const replacements: ImprovementReplacement[] = [];
  const baselineHeuristic = runHeuristicAnalysis(
    input.resumeText,
    input.personaId,
  ).score.total;
  let currentHeuristic = baselineHeuristic;

  for (const replacement of candidates) {
    if (replacement.original && improvedText.includes(replacement.original)) {
      const proposedText = improvedText.replace(
        replacement.original,
        replacement.replacement,
      );
      const proposedScore = runHeuristicAnalysis(
        proposedText,
        input.personaId,
      ).score.total;
      if (proposedScore >= currentHeuristic) {
        improvedText = proposedText;
        currentHeuristic = proposedScore;
        replacements.push(replacement);
      }
    }
  }

  const positiveDelta = Math.max(0, currentHeuristic - baselineHeuristic);
  return {
    improvedText,
    replacements,
    afterScore: Math.min(100, input.report.score.total + positiveDelta),
  };
}
