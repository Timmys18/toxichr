import { aiLiveEnabled, runAi } from "@/lib/ai/gateway";
import { runHeuristicAnalysis } from "@/lib/ai/heuristics";
import type { AnalysisReport, Problem } from "@/lib/ai/schemas";
import type { PersonaId } from "@/lib/personas";

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

function fallbackReplacement(problem: Problem, answer: string): string {
  const clean = answer.replace(/\s+/g, " ").trim();
  if (clean.length >= 24) return clean;
  const frame = problem.suggestedRewrite?.trim();
  return [frame, clean].filter(Boolean).join(" — ");
}

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
  const parsed = JSON.parse(response.content.slice(start, end + 1)) as {
    replacements?: Array<{ problemId?: string; text?: string }>;
  };

  return Object.fromEntries(
    (parsed.replacements ?? [])
      .filter((item) => item.problemId && item.text)
      .map((item) => [item.problemId!, item.text!.trim()]),
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
  const source = `${input.resumeText}\n${input.answers
    .map((answer) => answer.answer)
    .join("\n")}`;

  const candidates: ImprovementReplacement[] = problems.map((problem) => {
    const answer = answerMap.get(problem.id) ?? "";
    const candidate = ai[problem.id] || fallbackReplacement(problem, answer);
    const safe = groundedNumbers(candidate, source)
      ? candidate
      : fallbackReplacement(problem, answer);
    return {
      problemId: problem.id,
      original: problem.quote,
      replacement: safe,
      grounded: groundedNumbers(safe, source),
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
