import { expect, test } from "@playwright/test";
import {
  isGroundedImprovementText,
  isUsefulImprovementAnswer,
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

  expect(isGroundedImprovementText(fabricated, [PROBLEM.quote, answer])).toBe(
    false,
  );
  expect(selectSafeReplacement(PROBLEM, answer, fabricated)).toBe(
    "Проводил интервью с пользователями. Лично провёл 12 интервью, проверил 4 гипотезы и довёл 2 до запуска.",
  );
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
  ).toBe(
    "Проводил интервью с пользователями. Лично провёл 12 интервью, проверил 4 гипотезы и довёл 2 до запуска.",
  );
});

test("исходное действие и новый масштаб объединяются детерминированно", () => {
  const problem = {
    ...PROBLEM,
    quote: "Руководил продуктом.",
  };
  const answer = "Команда из 5 человек.";
  const combinedByModel = "Руководил продуктом, командой из 5 человек.";

  expect(
    isGroundedImprovementText(combinedByModel, [problem.quote, answer]),
  ).toBe(false);
  expect(selectSafeReplacement(problem, answer, combinedByModel)).toBe(
    "Руководил продуктом. Команда из 5 человек.",
  );
  expect(
    selectSafeReplacement(
      problem,
      answer,
      "Увеличил выручку продукта, руководил командой из 5 человек.",
    ),
  ).toBe("Руководил продуктом. Команда из 5 человек.");
});

test("похожие русские окончания не подменяют смысл факта", () => {
  expect(
    isGroundedImprovementText("Управлял аналитиками.", [
      "Управлял аналитикой.",
    ]),
  ).toBe(false);
});

test("числа остаются привязаны к своему локальному факту", () => {
  const problem = {
    ...PROBLEM,
    quote: "Руководил 5 проектами.",
  };
  const answer = "Команда из 10 человек.";
  const swapped = "Руководил 10 проектами, команда из 5 человек.";

  expect(isGroundedImprovementText(swapped, [problem.quote, answer])).toBe(
    false,
  );
  expect(selectSafeReplacement(problem, answer, swapped)).toBe(
    "Руководил 5 проектами. Команда из 10 человек.",
  );

  const combinedAnswer = "Руководил 5 проектами, команда из 10 человек.";
  expect(isGroundedImprovementText(swapped, [combinedAnswer])).toBe(false);
  expect(
    isGroundedImprovementText(
      "Руководил 5 проектами, команда из 10 человек.",
      [combinedAnswer],
    ),
  ).toBe(true);
});

test("бессодержательный ответ не считается фактом для замены", () => {
  expect(isUsefulImprovementAnswer("не знаю")).toBe(false);
  expect(isUsefulImprovementAnswer("Не помню точную цифру.")).toBe(false);
  expect(isUsefulImprovementAnswer("Не знаю точной цифры.")).toBe(false);
  expect(isUsefulImprovementAnswer("Не уверен в точных показателях.")).toBe(
    false,
  );
  expect(isUsefulImprovementAnswer("Не уверена в точных показателях.")).toBe(
    false,
  );
  expect(isUsefulImprovementAnswer("Команда из 5 человек.")).toBe(true);
  expect(isUsefulImprovementAnswer("5 человек")).toBe(true);
  expect(isUsefulImprovementAnswer("2 года")).toBe(true);
  expect(
    isUsefulImprovementAnswer("Не знаю точной цифры, но и вспомнить не могу."),
  ).toBe(false);
  expect(
    isUsefulImprovementAnswer("Не знаю точной цифры, но сейчас проверить не могу."),
  ).toBe(false);
  expect(
    isUsefulImprovementAnswer("Не знаю точной цифры, но сейчас проверю."),
  ).toBe(false);
  expect(
    isUsefulImprovementAnswer(
      "Не помню точную цифру, но руководил командой разработки.",
    ),
  ).toBe(false);
  expect(
    isUsefulImprovementAnswer(
      "Не знаю точной цифры, но обещал позже проверить результаты.",
    ),
  ).toBe(false);
  expect(isUsefulImprovementAnswer("Руководил командой разработки.")).toBe(true);
  expect(
    selectSafeReplacement(
      PROBLEM,
      "Не помню точную цифру, но провёл интервью с пользователями.",
    ),
  ).toBe("Проводил интервью с пользователями.");
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
