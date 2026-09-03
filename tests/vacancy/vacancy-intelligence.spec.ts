import { expect, test } from "@playwright/test";
import {
  MATCH_ASSESSMENT_VERSION,
  MatchAssessmentSchema,
  StructuredVacancyAssessmentSchema,
  VACANCY_ASSESSMENT_VERSION,
  writeVacancyPersona,
} from "../../src/lib/vacancy";

const vacancy = {
  schemaVersion: VACANCY_ASSESSMENT_VERSION,
  vacancyFingerprint: "0123456789abcdef",
  title: "Руководитель продукта",
  roleReality: "Роль отвечает за продуктовую стратегию и результаты запуска.",
  whoTheySeek: "Нужен руководитель с опытом запуска и управления продуктом.",
  mainTask: "Запустить и развивать продукт вместе с командой.",
  requirements: [
    { id: "VR01", text: "Запускать продукты", sourceQuote: "Запускать продукты", priority: "critical", kind: "fact", interpretation: "Ключевая задача роли." },
    { id: "VR02", text: "Управлять командой", sourceQuote: "Управлять командой", priority: "critical", kind: "fact", interpretation: "Нужен управленческий опыт." },
    { id: "VR03", text: "Работать с зарубежными поставщиками", sourceQuote: "Работать с зарубежными поставщиками", priority: "secondary", kind: "fact", interpretation: "Вторичный профессиональный контекст." },
  ],
  contradictions: [], risks: [], clarificationPoints: [], employerQuestions: ["Как измеряется результат роли?"],
};

const baseMatch = {
  schemaVersion: MATCH_ASSESSMENT_VERSION,
  decision: { code: "apply" as const, headline: "Откликайся", reasoning: "Есть прямой опыт запуска продукта и управления командой." },
  matches: [
    { requirementId: "VR01", status: "strong_match" as const, resumeEvidenceIds: ["S01"], resumeQuotes: ["Запустил новый сервис для клиентов."], explanation: "Прямое подтверждение запуска." },
    { requirementId: "VR02", status: "hidden_match" as const, resumeEvidenceIds: ["F01"], resumeQuotes: ["Координировал работу команды из пяти человек."], explanation: "Опыт есть, но его нужно подать как управление." },
    { requirementId: "VR03", status: "unknown" as const, resumeEvidenceIds: [], resumeQuotes: [], explanation: "Резюме этого не показывает; это не вывод о возможностях человека." },
  ],
  whyInviteRequirementIds: ["VR01"], whyRejectRequirementIds: [], preApplyFixes: [{ requirementIds: ["VR02"], action: "Назови свою управленческую роль рядом с координацией команды.", boundary: "Не добавляй полномочия, которых не было." }], unknownRequirementIds: ["VR03"], candidateQuestions: ["Какой ваш личный вклад в запуске?"], employerQuestions: ["Как измеряется результат роли?"], limits: ["Зарубежные поставщики не подтверждены резюме."],
};
const vacancyAssessment = StructuredVacancyAssessmentSchema.parse(vacancy);
const matchAssessment = MatchAssessmentSchema.parse(baseMatch);

test("структурированная оценка вакансии и match используют только связные идентификаторы", () => {
  expect(StructuredVacancyAssessmentSchema.safeParse(vacancyAssessment).success).toBe(true);
  expect(MatchAssessmentSchema.safeParse(matchAssessment).success).toBe(true);
  expect(matchAssessment.matches.find((item) => item.status === "unknown")?.explanation).toContain("Резюме этого не показывает");
});

test("решения об отклике представлены всеми четырьмя исходами без процентов", () => {
  const codes = ["apply", "revise", "explain_gap", "skip"] as const;
  for (const code of codes) {
    const value = { ...matchAssessment, decision: { ...matchAssessment.decision, code } };
    expect(MatchAssessmentSchema.safeParse(value).success).toBe(true);
  }
});

test("один match даёт одинаковые факты и разные голоса четырёх HR", async () => {
  const before = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = "mock";
  try {
    const outputs = await Promise.all((["tamara", "lera", "gleb", "vadik"] as const).map((persona) => writeVacancyPersona(persona, vacancyAssessment, matchAssessment)));
    expect(new Set(outputs.map((item) => item.comment)).size).toBe(4);
    expect(matchAssessment.decision.code).toBe("apply");
    expect(matchAssessment.matches.map((item) => item.requirementId)).toEqual(["VR01", "VR02", "VR03"]);
  } finally {
    process.env.AI_PROVIDER = before;
  }
});
