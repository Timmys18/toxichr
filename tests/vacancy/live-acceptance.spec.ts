import "dotenv/config";
import { expect, test } from "@playwright/test";
import { aiLiveEnabled } from "../../src/lib/ai/gateway";
import { assessMatch, assessVacancy, writeVacancyPersona } from "../../src/lib/vacancy";
import type { ProfessionalAssessment } from "../../src/lib/ai/professional-assessment";

const enabled = process.env.RUN_LIVE_AI_ACCEPTANCE === "1" && aiLiveEnabled();
const resumeAssessment: ProfessionalAssessment = {
  candidateContext: { primaryProfession: "продуктовый менеджер", secondaryContext: "B2B", claimedLevel: "руководитель", inferredLevel: "руководитель", industry: "технологии", careerPattern: "продуктовый рост", confidence: 0.8 },
  professionalAssessment: { overallImpression: "Опыт запуска и развития B2B-продуктов подтверждён конкретными строками.", strongestProfessionalSignal: "Запуск сервиса и работа с командой.", mainResumeProblem: "Недостаточно ясно показан масштаб ответственности.", seniorityConsistency: "Заявленный уровень требует пояснения полномочий.", resumeVsExperienceGap: "Факты есть, но не все вынесены в позиционирование." },
  findings: [{ id: "F01", sourceQuote: "Координировал команду из пяти человек при запуске сервиса.", interpretation: "Есть опыт координации команды.", whyItMatters: "Это может быть связано с управленческим требованием.", severity: "medium", confidence: "high", issueType: "управление" }],
  strengths: [{ id: "S01", sourceQuote: "Запустил новый B2B-сервис для клиентов.", interpretation: "Есть прямой факт запуска продукта." }],
  questionsCreatedByResume: [], uncertainties: [], claimsNotAllowed: [],
};

test.skip(!enabled, "Живой acceptance запускается только при RUN_LIVE_AI_ACCEPTANCE=1 и настроенном AI.");
test("живой контур вакансии выдаёт связанную оценку и четыре разных голоса", async ({}, testInfo) => {
  const vacancy = await assessVacancy("Руководитель продукта\nЗапускать и развивать B2B-сервис. Управлять продуктовой командой. Опыт с зарубежными поставщиками будет преимуществом. В первые шесть месяцев нужен запуск новой версии продукта.");
  const match = await assessMatch(vacancy, resumeAssessment);
  const personas = await Promise.all((["tamara", "lera", "gleb", "vadik"] as const).map((persona) => writeVacancyPersona(persona, vacancy, match)));
  expect(vacancy.requirements.every((item) => item.sourceQuote.length > 5)).toBe(true);
  expect(match.matches.every((item) => vacancy.requirements.some((requirement) => requirement.id === item.requirementId))).toBe(true);
  expect(new Set(personas.map((item) => item.comment)).size).toBeGreaterThan(2);
  await testInfo.attach("vacancy-live-acceptance.json", {
    body: JSON.stringify({ vacancy, match, personas }, null, 2),
    contentType: "application/json",
  });
});
