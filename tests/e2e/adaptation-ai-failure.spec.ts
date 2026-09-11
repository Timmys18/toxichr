import { expect, test, type APIRequestContext } from "@playwright/test";
import { prisma } from "@/lib/prisma";

const RESUME = `Мария Иванова
Product Manager

Product Manager, сервис доставки, 2022–2026
Проводила интервью с пользователями и формировала дорожную карту продукта.
Готовила требования для команды разработки и анализировала продуктовые метрики.`;

const VACANCY = `Senior Product Manager
Ищем продуктового менеджера для сервиса доставки.
Нужно проводить исследования пользователей и продуктовые эксперименты.
Требуется опыт управления кросс-функциональной командой.
Важно уметь работать с продуктовыми метриками и приоритизацией дорожной карты.`;

async function prepareRecheck(request: APIRequestContext, marker: string) {
  const resumeResponse = await request.post("/api/resumes/text", { data: { text: RESUME } });
  expect(resumeResponse.status()).toBe(200);
  const { resumeId } = await resumeResponse.json();
  const analysisResponse = await request.post("/api/analyses", { data: { resumeId, personaId: "lera" } });
  expect(analysisResponse.status()).toBe(200);
  const { analysisId } = await analysisResponse.json();
  const analysis = await prisma.analysis.findUniqueOrThrow({ where: { id: analysisId } });
  await prisma.toxicHrPackage.create({ data: { resumeId, source: "test-ai-failure" } });
  const version = await prisma.resumeVersion.create({
    data: {
      resumeId,
      parentVersionId: analysis.resumeVersionId,
      versionNumber: 2,
      source: "adaptation",
      structuredContent: { text: RESUME },
    },
  });
  const vacancy = await prisma.vacancy.create({
    data: {
      sourceText: `Senior Product Manager ${marker}\nНужно проводить исследования пользователей, управлять дорожной картой и работать с продуктовыми метриками.`,
    },
  });
  const adaptation = await prisma.resumeAdaptation.create({
    data: {
      analysisId,
      vacancyId: vacancy.id,
      resumeVersionId: version.id,
      status: "ready",
      answers: [],
      changes: [],
      adaptedText: RESUME,
    },
  });
  return { adaptationId: adaptation.id, resumeId, vacancyId: vacancy.id };
}

async function prepareAdaptation(request: APIRequestContext) {
  const resumeResponse = await request.post("/api/resumes/text", { data: { text: RESUME } });
  const { resumeId } = await resumeResponse.json();
  const analysisResponse = await request.post("/api/analyses", { data: { resumeId, personaId: "lera" } });
  const { analysisId } = await analysisResponse.json();
  await prisma.toxicHrPackage.create({ data: { resumeId, source: "test-adaptation-ai-failure" } });
  const matchResponse = await request.post("/api/vacancies/review", { data: { text: VACANCY, analysisId } });
  expect(matchResponse.status()).toBe(200);
  const { vacancyId } = await matchResponse.json();
  const savedMatch = await prisma.vacancyMatch.findUniqueOrThrow({ where: { vacancyId_analysisId: { vacancyId, analysisId } } });
  const review = savedMatch.result as { matchAssessment: { matches: Array<{ requirementId: string; status: string; resumeQuotes: string[] }> } };
  const target = review.matchAssessment.matches.find((item) => item.requirementId === "VR03");
  expect(target).toBeTruthy();
  target!.status = "partial_match";
  target!.resumeQuotes = ["Проводила интервью с пользователями и формировала дорожную карту продукта."];
  await prisma.vacancyMatch.update({ where: { id: savedMatch.id }, data: { result: review } });
  const prepared = await request.get(`/api/adaptations?analysisId=${analysisId}&vacancyId=${vacancyId}`);
  const preparedData = await prepared.json();
  return { analysisId, vacancyId, resumeId, requirementId: preparedData.questions[0].requirementId as string };
}

for (const scenario of [
  { name: "ошибка AI", marker: "[[TOXICHR_TEST_AI_ERROR]]" },
  { name: "невалидный JSON", marker: "[[TOXICHR_TEST_AI_INVALID_JSON]]" },
]) {
  test(`${scenario.name} не списывает re-check и не сохраняет деградированный результат`, async ({ request }) => {
    const prepared = await prepareRecheck(request, scenario.marker);
    const response = await request.post(`/api/adaptations/${prepared.adaptationId}/recheck`);
    expect(response.status()).toBe(502);
    expect(await response.json()).toMatchObject({ retryable: true });

    const packageRow = await prisma.toxicHrPackage.findUniqueOrThrow({ where: { resumeId: prepared.resumeId } });
    expect(await prisma.packageUsage.count({ where: { packageId: packageRow.id, kind: "RECHECK" } })).toBe(0);
    expect(await prisma.vacancyMatch.count({ where: { vacancyId: prepared.vacancyId } })).toBe(0);
    expect((await prisma.resumeAdaptation.findUniqueOrThrow({ where: { id: prepared.adaptationId } })).recheckAnalysisId).toBeNull();
  });

  test(`${scenario.name} не списывает адаптацию и не создаёт новую версию`, async ({ request }) => {
    const prepared = await prepareAdaptation(request);
    const versionsBefore = await prisma.resumeVersion.count({ where: { resumeId: prepared.resumeId } });
    const response = await request.post("/api/adaptations", {
      data: {
        analysisId: prepared.analysisId,
        vacancyId: prepared.vacancyId,
        answers: [{ requirementId: prepared.requirementId, answer: `${scenario.marker} Лично провела восемь интервью.` }],
      },
    });
    expect(response.status()).toBe(502);
    expect(await response.json()).toMatchObject({ retryable: true });
    const packageRow = await prisma.toxicHrPackage.findUniqueOrThrow({ where: { resumeId: prepared.resumeId } });
    expect(await prisma.packageUsage.count({ where: { packageId: packageRow.id, kind: "ADAPTATION" } })).toBe(0);
    expect(await prisma.resumeAdaptation.count({ where: { analysisId: prepared.analysisId, vacancyId: prepared.vacancyId } })).toBe(0);
    expect(await prisma.resumeVersion.count({ where: { resumeId: prepared.resumeId } })).toBe(versionsBefore);
  });
}
