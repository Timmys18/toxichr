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
  if (!aiLiveEnabled()) return {};
  const answerByRequirement = Object.fromEntries(input.answers.map((item) => [item.requirementId, item.answer]));
  const response = await runAi({
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
  const start = response.content.indexOf("{");
  const end = response.content.lastIndexOf("}");
  if (start < 0 || end <= start) return {};
  const parsed = AiAdaptationSchema.safeParse(JSON.parse(response.content.slice(start, end + 1)));
  if (!parsed.success) return {};
  const allowed = new Set(input.questions.map((item) => item.requirementId));
  return Object.fromEntries(parsed.data.replacements.filter((item) => allowed.has(item.requirementId)).map((item) => [item.requirementId, item.text]));
}

export async function buildAdaptedResume(input: {
  resumeText: string;
  vacancy: StructuredVacancyAssessment;
  match: MatchAssessment;
  answers: AdaptationAnswer[];
}) {
  const questions = buildAdaptationQuestions(input.vacancy, input.match);
  const answerMap = new Map(input.answers.map((item) => [item.requirementId, item.answer.trim()]));
  const usefulAnswers = input.answers.filter((item) => isUsefulImprovementAnswer(item.answer));
  const ai = await aiAdaptedReplacements({ questions, answers: usefulAnswers }).catch(() => ({} as Record<string, string>));

  let adaptedText = input.resumeText;
  const changes: AdaptationChange[] = [];
  for (const question of questions) {
    const answer = answerMap.get(question.requirementId) ?? "";
    if (!isUsefulImprovementAnswer(answer) || !adaptedText.includes(question.resumeQuote)) continue;
    const replacement = selectSafeAdaptationReplacement(question.resumeQuote, answer, ai[question.requirementId]);
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
