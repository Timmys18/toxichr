import { expect, test } from "@playwright/test";
import {
  isGroundedImprovementText,
  selectSafeReplacement,
} from "../../src/lib/improvement";
import type { Problem } from "../../src/lib/ai/schemas";
import {
  parseVacancyAiResponse,
  sanitizeVacancyRequirement,
} from "../../src/lib/vacancy";

const PROBLEM: Problem = {
  id: "problem-1",
  severity: "high",
  title: "Нет результата",
  quote: "Проводил интервью с пользователями.",
  roast: "Действие есть, результата не видно.",
  diagnosis: "Формулировке не хватает масштаба и результата.",
  recommendation: "Добавить только подтверждённые факты.",
  suggestedRewrite: "Внедрил Kubernetes и удвоил выручку.",
};

test("AI-редактура не добавляет выдуманные факты без цифр", () => {
  const answer =
    "Лично провёл 12 интервью, проверил 4 гипотезы и довёл 2 до запуска.";
  const fabricated =
    "Лично провёл 12 интервью, внедрил Kubernetes и довёл 2 продукта до запуска.";

  expect(isGroundedImprovementText(fabricated, [answer, PROBLEM.quote])).toBe(
    false,
  );
  expect(selectSafeReplacement(PROBLEM, answer, fabricated)).toBe(answer);
});

test("AI-редактура принимает только подтверждённое сокращение ответа", () => {
  const answer =
    "Лично провёл 12 интервью, проверил 4 гипотезы и довёл 2 до запуска.";
  const grounded = "Провёл 12 интервью, проверил 4 гипотезы и довёл 2 до запуска.";

  expect(isGroundedImprovementText(grounded, [answer, PROBLEM.quote])).toBe(
    true,
  );
  expect(selectSafeReplacement(PROBLEM, answer, grounded)).toBe(grounded);
  expect(
    selectSafeReplacement(
      PROBLEM,
      answer,
      "Провёл 20 интервью, проверил 4 гипотезы и довёл 2 до запуска.",
    ),
  ).toBe(answer);
});

test("сломанный JSON вакансии отклоняется до использования в интерфейсе", () => {
  expect(
    parseVacancyAiResponse(
      JSON.stringify({
        title: "Product Manager",
        summary: "Краткое описание",
        requirements: "это не массив",
        redFlags: [],
        corporateWater: [],
        interviewQuestions: [],
      }),
    ),
  ).toBeNull();

  expect(
    parseVacancyAiResponse(
      JSON.stringify({
        title: "Product Manager",
        summary: "Краткое описание",
        requirements: [],
      }),
    ),
  ).toBeNull();
});

test("подтверждённая категория без точной цитаты понижается до уточнения", () => {
  const resume = "Проводил интервью с пользователями и формировал дорожную карту.";
  const item = {
    id: "req-1",
    text: "Опыт работы с Kubernetes",
    category: "proven" as const,
    evidence: "Внедрил Kubernetes в production",
    explanation: "Опыт подтверждён.",
  };

  expect(sanitizeVacancyRequirement(item, 0, resume)).toMatchObject({
    category: "clarify",
    evidence: undefined,
    explanation:
      "Прямой подтверждающей цитаты в резюме нет — соответствие нужно уточнить.",
  });

  expect(
    sanitizeVacancyRequirement(
      {
        ...item,
        text: "Исследования пользователей",
        evidence: "Проводил интервью с пользователями",
      },
      0,
      resume,
    ),
  ).toMatchObject({
    category: "proven",
    evidence: "Проводил интервью с пользователями",
  });
});
