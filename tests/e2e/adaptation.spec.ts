import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";

const RESUME = `Анна Петрова
Product Manager

Опыт работы
Product Manager, сервис доставки, 2022–2026
Проводила интервью с пользователями, формировала дорожную карту и готовила требования для команды разработки.
Работала с продуктовой аналитикой и запуском новых функций.`;

const VACANCY = `Senior Product Manager
Ищем продуктового менеджера для сервиса доставки.
Нужно проводить исследования пользователей и продуктовые эксперименты.
Требуется опыт управления кросс-функциональной командой.
Важно уметь работать с продуктовыми метриками и приоритизацией дорожной карты.`;

test("адаптация создаёт новую версию по подтверждённому факту и повторно сопоставляет её без второго списания", async ({ request }) => {
  const resumeResponse = await request.post("/api/resumes/text", { data: { text: RESUME } });
  expect(resumeResponse.status()).toBe(200);
  const { resumeId } = await resumeResponse.json();
  const analysisResponse = await request.post("/api/analyses", { data: { resumeId, personaId: "lera" } });
  expect(analysisResponse.status()).toBe(200);
  const { analysisId } = await analysisResponse.json();
  await prisma.toxicHrPackage.create({ data: { resumeId, source: "test" } });

  const match = await request.post("/api/vacancies/review", { data: { text: VACANCY, analysisId } });
  expect(match.status()).toBe(200);
  const { vacancyId } = await match.json();

  // Mock Match Analyst специально работает в аварийном, сверхконсервативном
  // режиме. Для этого теста добавляем уже подтверждённую цитату из резюме,
  // чтобы проверить именно flow адаптации, а не качество mock-сопоставления.
  const savedMatch = await prisma.vacancyMatch.findUniqueOrThrow({ where: { vacancyId_analysisId: { vacancyId, analysisId } } });
  const savedReview = savedMatch.result as { matchAssessment: { matches: Array<{ requirementId: string; status: string; resumeQuotes: string[] }> } };
  const target = savedReview.matchAssessment.matches.find((item) => item.requirementId === "VR03");
  expect(target).toBeTruthy();
  target!.status = "partial_match";
  target!.resumeQuotes = ["Проводила интервью с пользователями, формировала дорожную карту и готовила требования для команды разработки."];
  await prisma.vacancyMatch.update({ where: { id: savedMatch.id }, data: { result: savedReview } });

  const prepared = await request.get(`/api/adaptations?analysisId=${analysisId}&vacancyId=${vacancyId}`);
  expect(prepared.status()).toBe(200);
  const preparedData = await prepared.json();
  expect(preparedData.questions.length).toBeGreaterThan(0);

  const adaptation = await request.post("/api/adaptations", {
    data: {
      analysisId,
      vacancyId,
      answers: [{ requirementId: preparedData.questions[0].requirementId, answer: "Лично провела 8 интервью и проверила две гипотезы." }],
    },
  });
  expect(adaptation.status()).toBe(200);
  const adaptationData = await adaptation.json();
  expect(adaptationData).toMatchObject({ ready: true });
  expect(adaptationData.adaptedText).toContain("Проводила интервью с пользователями");
  expect(adaptationData.adaptedText).toContain("8 интервью");

  const accessAfterAdaptation = await request.get(`/api/payments/access?analysisId=${analysisId}`);
  expect(await accessAfterAdaptation.json()).toMatchObject({ adaptationUsed: true, adaptationAvailable: false, rechecksRemaining: 5 });

  const recheck = await request.post(`/api/adaptations/${adaptationData.adaptationId}/recheck`);
  expect(recheck.status()).toBe(200);
  const recheckData = await recheck.json();
  expect(recheckData.analysisId).toBeTruthy();
  const repeated = await request.post(`/api/adaptations/${adaptationData.adaptationId}/recheck`);
  expect(repeated.status()).toBe(200);
  expect(await repeated.json()).toMatchObject({ reused: true, analysisId: recheckData.analysisId });

  const accessAfterRecheck = await request.get(`/api/payments/access?analysisId=${recheckData.analysisId}`);
  expect(await accessAfterRecheck.json()).toMatchObject({ rechecksUsed: 1, rechecksRemaining: 4 });
  const savedRecheck = await request.get(`/api/vacancies/${vacancyId}?analysisId=${recheckData.analysisId}`);
  expect(savedRecheck.status()).toBe(200);
  expect((await savedRecheck.json()).result).toBeTruthy();
});
