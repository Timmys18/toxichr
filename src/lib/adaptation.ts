import { z } from "zod";
import { aiLiveEnabled, runAi } from "@/lib/ai/gateway";
import {
  isGroundedAdaptationText,
  isUsefulImprovementAnswer,
  selectSafeAdaptationReplacement,
} from "@/lib/improvement";
import type { MatchAssessment, StructuredVacancyAssessment } from "@/lib/vacancy";

export type AdaptationQuestion = {
  requirementId: string;
  requirement: string;
  vacancyQuote: string;
  resumeQuote: string;
  question: string;
};

export type AdaptationAnswer = {
  requirementId: string;
  answer: string;
};

export type AdaptationChange = {
  requirementId: string;
  requirement: string;
  original: string;
  replacement: string;
  vacancyQuote: string;
};

export class AdaptationAiError extends Error {
  constructor(
    readonly reason: "invalid_json" | "validation_failed" | "provider_error",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AdaptationAiError";
  }
}

const AiAdaptationSchema = z.object({
  replacements: z.array(z.object({
    requirementId: z.string().min(1),
    text: z.string().trim().min(1).max(2_000),
  })).max(7),
});

function preferredRequirementIds(match: MatchAssessment) {
  return [
    ...match.preApplyFixes.flatMap((item) => item.requirementIds),
    ...match.matches
      .filter((item) => item.status === "hidden_match" || item.status === "partial_match")
      .map((item) => item.requirementId),
    ...match.matches
      .filter((item) => item.status === "strong_match")
      .map((item) => item.requirementId),
    ...match.matches
      .filter((item) => item.status === "unknown")
      .map((item) => item.requirementId),
  ];
}

export function buildAdaptationQuestions(
  vacancy: StructuredVacancyAssessment,
  match: MatchAssessment,
): AdaptationQuestion[] {
  const requirements = new Map(vacancy.requirements.map((item) => [item.id, item]));
  const matchByRequirement = new Map(match.matches.map((item) => [item.requirementId, item]));
  const seen = new Set<string>();
  const questions: AdaptationQuestion[] = [];

  for (const requirementId of preferredRequirementIds(match)) {
    if (seen.has(requirementId)) continue;
    const requirement = requirements.get(requirementId);
    const evidence = matchByRequirement.get(requirementId)?.resumeQuotes[0];
    if (!requirement || !evidence) continue;
    // Название роли и короткий ярлык должности — не строка резюме для
    // «усиления»: туда легко приклеить чужой результат и получить абсурд.
    if (requirement.sourceQuote.trim().toLowerCase() === vacancy.title.trim().toLowerCase() || evidence.trim().length < 20) continue;
    seen.add(requirementId);
    questions.push({
      requirementId,
      requirement: requirement.text,
      vacancyQuote: requirement.sourceQuote,
      resumeQuote: evidence,
      question: `Что именно в этом опыте важно для требования «${requirement.text}»? Укажи только то, что делал лично и можешь подтвердить.`,
    });
    if (questions.length === 5) break;
  }

  return questions;
}

async function aiAdaptedReplacements(input: {
  questions: AdaptationQuestion[];
  answers: AdaptationAnswer[];
}): Promise<Record<string, string>> {
  const testInput = JSON.stringify(input);
  const testFailure = process.env.AI_TEST_VACANCY_FAILURES === "markers"
    ? testInput.includes("[[TOXICHR_TEST_AI_ERROR]]")
      ? "provider_error"
      : testInput.includes("[[TOXICHR_TEST_AI_INVALID_JSON]]")
        ? "invalid_json"
        : null
    : null;
  if (!aiLiveEnabled() && !testFailure) return {};
  const answerByRequirement = Object.fromEntries(input.answers.map((item) => [item.requirementId, item.answer]));
  let response: Awaited<ReturnType<typeof runAi>>;
  try {
    if (testFailure === "provider_error") throw new Error("Смоделированный отказ AI-провайдера.");
    response = testFailure === "invalid_json" ? {
      provider: "openai",
      model: "test-invalid-json",
      content: "{invalid-json",
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
    } : await runAi({
      stage: "anti_generic",
      system: `Ты адаптируешь резюме под вакансию. Перепиши только данные строки резюме.
Сохрани исходное действие и все его числа. Используй только слова и факты из исходной строки и подтверждённого ответа кандидата.
Не добавляй компании, технологии, команды, бюджеты, сроки, результаты или способности. Не пиши о личности кандидата.
Если безопасно объединить строку и ответ нельзя, верни исходную строку без изменений.
Верни только JSON: {"replacements":[{"requirementId":"...","text":"..."}]}.`,
      user: JSON.stringify({ questions: input.questions, answers: answerByRequirement }),
      jsonSchemaName: "resume_vacancy_adaptation",
      temperature: 0.15,
      maxTokens: 1_600,
    });
  } catch (error) {
    console.error("[adaptation-ai] stage=anti_generic reason=provider_error", error);
    throw new AdaptationAiError("provider_error", "AI не смог собрать адаптацию.", { cause: error });
  }
  const start = response.content.indexOf("{");
  const end = response.content.lastIndexOf("}");
  if (start < 0 || end <= start) {
    console.error("[adaptation-ai] stage=anti_generic reason=invalid_json");
    throw new AdaptationAiError("invalid_json", "AI вернул повреждённый ответ для адаптации.");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(response.content.slice(start, end + 1));
  } catch (error) {
    console.error("[adaptation-ai] stage=anti_generic reason=invalid_json", error);
    throw new AdaptationAiError("invalid_json", "AI вернул повреждённый ответ для адаптации.", { cause: error });
  }
  const parsed = AiAdaptationSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("[adaptation-ai] stage=anti_generic reason=validation_failed", parsed.error.issues);
    throw new AdaptationAiError("validation_failed", "Ответ AI не прошёл проверку адаптации.");
  }
  const allowed = new Set(input.questions.map((item) => item.requirementId));
  return Object.fromEntries(parsed.data.replacements.filter((item) => allowed.has(item.requirementId)).map((item) => [item.requirementId, item.text]));
}

export async function buildAdaptedResume(input: {
  resumeText: string;
  vacancy: StructuredVacancyAssessment;
  match: MatchAssessment;
  answers: AdaptationAnswer[];
}) {
  const liveAi = aiLiveEnabled();
  const questions = buildAdaptationQuestions(input.vacancy, input.match);
  const answerMap = new Map(input.answers.map((item) => [item.requirementId, item.answer.trim()]));
  const usefulAnswers = input.answers.filter((item) => isUsefulImprovementAnswer(item.answer));
  const ai = await aiAdaptedReplacements({ questions, answers: usefulAnswers });

  let adaptedText = input.resumeText;
  const changes: AdaptationChange[] = [];
  for (const question of questions) {
    const answer = answerMap.get(question.requirementId) ?? "";
    if (!isUsefulImprovementAnswer(answer) || !adaptedText.includes(question.resumeQuote)) continue;
    const aiCandidate = ai[question.requirementId];
    if (liveAi && !aiCandidate) continue;
    const replacement = selectSafeAdaptationReplacement(question.resumeQuote, answer, aiCandidate);
    if (!isGroundedAdaptationText(replacement, question.resumeQuote, answer) || replacement === question.resumeQuote) continue;
    adaptedText = adaptedText.replace(question.resumeQuote, replacement);
    changes.push({
      requirementId: question.requirementId,
      requirement: question.requirement,
      original: question.resumeQuote,
      replacement,
      vacancyQuote: question.vacancyQuote,
    });
  }

  return { questions, adaptedText, changes };
}
