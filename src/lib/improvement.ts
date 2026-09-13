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

export const IMPROVEMENT_RULES_VERSION = "improvement@2.2";

function editableProblems(report: AnalysisReport, resumeText?: string): Problem[] {
  const role = report.candidateProfile.primaryRole.toLocaleLowerCase("ru");
  const isHeading = (quote: string) => quote.trim().length <= 80 && quote.toLocaleLowerCase("ru").includes(role);
  const problems = report.topProblems.filter((item) => !isHeading(item.quote));
  // A strong resume may have no defect: offer a factual clarification on an
  // existing strength, without inventing a weakness or replacing its heading.
  const fragments = [...problems.slice(0, 4), ...report.strengths.filter((item) => item.quote && !isHeading(item.quote) && !problems.some((problem) => problem.quote === item.quote)).slice(0, 3).map((item) => ({
    id: `clarify-${item.id}`, title: "Уточнить личный вклад в этом результате", quote: item.quote!, severity: "low" as const,
    roast: item.comment, diagnosis: "Сохраните этот факт. Дополняйте его только если есть конкретное уточнение.", recommendation: "Уточните личное действие и его результат.",
  }))];
  if (fragments.length || !resumeText) return fragments;
  return (resumeText.match(/[^.!?\n]+[.!?]?/gu) ?? []).map((quote) => quote.trim())
    .filter((quote) => quote.length >= 20 && quote.length <= 500 && !isHeading(quote)
      && /(?:^|\s)[а-яё]*(?:ил|ила|или|ал|ала|али|ёл|ела|ели)(?=\s|[,.;:])/iu.test(quote))
    .slice(0, 3).map((quote, index) => ({ id: `clarify-source-${index}`, title: "Уточнить описание работы", quote, severity: "low" as const,
      roast: "В исходном тексте есть описание работы.", diagnosis: "Можно уточнить этот фрагмент, если есть дополнительные факты.", recommendation: "Назовите конкретное личное действие." }));
}

export function buildImprovementQuestions(
  report: AnalysisReport,
  resumeText?: string,
): ImprovementQuestion[] {
  return editableProblems(report, resumeText).slice(0, 7).map((problem) => ({
    problemId: problem.id,
    title: problem.title,
    quote: problem.quote,
    question: `В строке «${problem.quote}» какое конкретное действие было вашим и что оно изменило? Назовите уточнение, которого ещё нет в этой строке. Если уточнения нет, оставим её без изменений.`,
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
  return groundingTokens(text).filter(
    (token) => !/^\d+(?:[.]\d+)?$/.test(token),
  );
}

function groundingTokens(text: string): string[] {
  return (
    text
      .toLowerCase()
      .replace(/ё/g, "е")
      .match(/\d+(?:[.,]\d+)?|[\p{L}+#.-]+/gu) ?? []
  )
    .map((token) => token.replace(/^[.+-]+|[.+-]+$/g, ""))
    .map((token) =>
      /^\d+(?:[.,]\d+)?$/.test(token) ? token.replace(",", ".") : token,
    )
    .filter(
      (token) =>
        token.length > 0 && !FUNCTION_WORDS.has(token),
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
 * содержательного слова, числа или изменить порядок фактических опор. Числа
 * входят в ту же последовательность, поэтому сохраняют связь с локальным фактом.
 */
export function isGroundedImprovementText(
  candidate: string,
  sources: string[],
): boolean {
  const clean = candidate.replace(/\s+/g, " ").trim();
  if (clean.length < 3) return false;
  return [...sources, sources.join(" ")].some(
    (source) =>
      isOrderedSubsequence(groundingTokens(clean), groundingTokens(source)),
  );
}

export function isUsefulImprovementAnswer(answer: string): boolean {
  const clean = answer.replace(/\s+/g, " ").trim();
  return usefulImprovementFact(clean) !== null;
}

const NON_FACTUAL_ANSWER_WORDS = new Set([
  "без",
  "вспомнить",
  "добавить",
  "данных",
  "знаю",
  "информации",
  "могу",
  "меня",
  "не",
  "неизвестно",
  "нет",
  "ничего",
  "пока",
  "позже",
  "помню",
  "потом",
  "получается",
  "сказать",
  "сейчас",
  "сегодня",
  "точная",
  "точно",
  "точного",
  "точной",
  "точную",
  "точные",
  "точных",
  "уверен",
  "уверена",
  "уточнить",
  "цифр",
  "цифра",
  "цифры",
  "цифру",
  "завтра",
]);

function usefulImprovementFact(answer: string): string | null {
  const clean = answer.replace(/\s+/g, " ").trim();
  if (clean.length < 2) return null;
  const normalized = clean
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[.,!?;:—–-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^(?:нет|никак|хз|нечего добавить)$/.test(normalized)) {
    return null;
  }

  if (
    /^(?:не (?:знаю|помню|уверен|уверена)|(?:пока|точно) не знаю|без понятия|нет (?:данных|цифр|информации)|не могу (?:вспомнить|уточнить|сказать)|не ?известно|непонятно|неясно|затрудняюсь|(?:сложно|трудно) сказать)(?:\s|$)/.test(
      normalized,
    )
  ) {
    return null;
  }

  const factualTokens = contentTokens(clean).filter(
    (token) => !NON_FACTUAL_ANSWER_WORDS.has(token),
  );
  const hasNumberFact = numbers(clean).length > 0 && factualTokens.length >= 1;
  const useful = factualTokens.length >= 2 || hasNumberFact;
  return useful ? clean : null;
}

function fallbackReplacement(problem: Problem, answer: string): string {
  const clean = usefulImprovementFact(answer);
  if (!clean) return problem.quote;
  const quote = problem.quote.replace(/\s+/g, " ").trim();
  if (isOrderedSubsequence(groundingTokens(clean), groundingTokens(quote))) return quote;
  if (isOrderedSubsequence(contentTokens(quote), contentTokens(clean))) {
    return clean;
  }
  const sentence = `${clean.charAt(0).toUpperCase()}${clean.slice(1)}`;
  return `${quote.replace(/[.!?;:]+$/, "")}. ${sentence}`;
}

export function selectSafeReplacement(
  problem: Problem,
  answer: string,
  aiCandidate?: string,
): string {
  const fallback = fallbackReplacement(problem, answer);
  const usefulAnswer = usefulImprovementFact(answer) ?? "";
  const candidate = aiCandidate?.replace(/\s+/g, " ").trim();
  if (!candidate) return fallback;
  const scopeWords = /(?:^|\s)(?:не|без|совместно|командой|частично|только)(?=\s|[.,;!?]|$)/giu;
  const preservesScope = [problem.quote, usefulAnswer].every((source) => (source.match(scopeWords) ?? []).every((word) => candidate.toLowerCase().includes(word.trim().toLowerCase())));
  const preservesNumbers = numbers(problem.quote).every((number) => numbers(candidate).includes(number));
  return candidate !== problem.quote && preservesScope && preservesNumbers && isGroundedImprovementText(candidate, [problem.quote, usefulAnswer])
    ? candidate
    : fallback;
}

/**
 * Для адаптации ответ кандидата — подтверждённый источник факта, но исходная
 * строка остаётся обязательной опорой. Так новый масштаб не вытесняет действие,
 * которое уже было в резюме.
 */
export function isGroundedAdaptationText(
  candidate: string,
  original: string,
  answer: string,
): boolean {
  const candidateTokens = groundingTokens(candidate);
  const originalTokens = groundingTokens(original);
  const answerTokens = groundingTokens(answer);
  if (!candidateTokens.length || !originalTokens.length || !answerTokens.length) return false;
  const allowed = [...originalTokens, ...answerTokens];
  return (
    isOrderedSubsequence(candidateTokens, allowed) &&
    isOrderedSubsequence(contentTokens(original), contentTokens(candidate)) &&
    numbers(original).every((number) => numbers(candidate).includes(number))
  );
}

export function selectSafeAdaptationReplacement(
  original: string,
  answer: string,
  aiCandidate?: string,
): string {
  const fact = usefulImprovementFact(answer);
  if (!fact) return original;
  const candidate = aiCandidate?.replace(/\s+/g, " ").trim();
  if (candidate && isGroundedAdaptationText(candidate, original, fact)) return candidate;
  const base = original.replace(/[.!?;:]+$/, "").trim();
  return `${base}. ${fact.charAt(0).toUpperCase()}${fact.slice(1)}`;
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
  if (!aiLiveEnabled() || input.problems.length === 0) return {};

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
  const openingSentence = input.resumeText.match(/^[^.!?]+[.!?]/u)?.[0].trim() ?? "";
  const primaryRole = input.report.candidateProfile.primaryRole.toLocaleLowerCase("ru");
  const problems = editableProblems(input.report, input.resumeText).filter((problem) => {
    const quote = problem.quote.trim();
    const isRoleHeading = quote === openingSentence && quote.length <= 80
      && quote.toLocaleLowerCase("ru").includes(primaryRole);
    return !isRoleHeading && input.resumeText.includes(quote) && isUsefulImprovementAnswer(answerMap.get(problem.id) ?? "");
  });
  const usefulAnswers = input.answers.flatMap((answer) => {
    const fact = usefulImprovementFact(answer.answer);
    return fact ? [{ ...answer, answer: fact }] : [];
  });
  const ai: Record<string, string> = await aiReplacements({
    problems,
    answers: usefulAnswers,
    resumeText: input.resumeText,
  }).catch(() => ({} as Record<string, string>));
  const candidates: ImprovementReplacement[] = problems.map((problem) => {
    const answer = answerMap.get(problem.id) ?? "";
    const usefulAnswer = usefulImprovementFact(answer) ?? "";
    const safe = selectSafeReplacement(problem, answer, ai[problem.id]);
    return {
      problemId: problem.id,
      original: problem.quote,
      replacement: safe,
      grounded: isGroundedImprovementText(safe, [problem.quote, usefulAnswer]),
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
    if (replacement.grounded && replacement.replacement !== replacement.original && replacement.original && improvedText.includes(replacement.original)) {
      const proposedText = improvedText.replace(
        replacement.original,
        replacement.replacement,
      );
      const proposedScore = runHeuristicAnalysis(
        proposedText,
        input.personaId,
      ).score.total;
      // Confirmed editorial changes are not rejected merely because the old
      // keyword heuristic prefers the original wording.
      if (proposedText !== improvedText) {
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
    clarificationQuestions: replacements.length ? [] : buildImprovementQuestions(input.report, input.resumeText),
  };
}
