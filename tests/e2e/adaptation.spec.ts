import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { buildAdaptationQuestions } from "@/lib/adaptation";
import { MatchAssessmentSchema, StructuredVacancyAssessmentSchema, VACANCY_ASSESSMENT_VERSION, MATCH_ASSESSMENT_VERSION } from "@/lib/vacancy";

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

test("unknown без цитаты из резюме всё равно создаёт вопрос без выдуманной цитаты", () => {
  const requirement = { id: "VR01", text: "Английский язык не ниже B2", sourceQuote: "Английский язык не ниже B2", priority: "critical" as const, kind: "fact" as const, interpretation: "Работодатель прямо указывает языковое требование." };
  const vacancy = StructuredVacancyAssessmentSchema.parse({ schemaVersion: VACANCY_ASSESSMENT_VERSION, vacancyFingerprint: "fingerprint", title: "Менеджер", roleReality: "Роль требует подтверждённого английского языка.", whoTheySeek: "Нужен менеджер с подтверждённым английским языком.", mainTask: "Вести работу в международной команде.", requirements: [requirement], contradictions: [], risks: [], clarificationPoints: [], employerQuestions: [] });
  const match = MatchAssessmentSchema.parse({ schemaVersion: MATCH_ASSESSMENT_VERSION, decision: { code: "explain_gap", headline: "Нужно уточнить требование", reasoning: "В тексте резюме нет прямого подтверждения уровня английского языка." }, matches: [{ requirementId: "VR01", status: "unknown", resumeEvidenceIds: [], resumeQuotes: [], explanation: "Резюме этого не показывает; нужен ответ кандидата." }], whyInviteRequirementIds: [], whyRejectRequirementIds: [], preApplyFixes: [], unknownRequirementIds: ["VR01"], candidateQuestions: ["Какой у тебя уровень английского языка?"], employerQuestions: [], limits: [] });
  const questions = buildAdaptationQuestions(vacancy, match);
  expect(questions).toHaveLength(1);
  expect(questions[0]).toMatchObject({ requirementId: "VR01", resumeQuote: "" });
  expect(questions[0].question).toMatch(/есть ли|уточни|укажи/i);
});

test("адаптация создаёт новую версию по подтверждённому факту и повторно сопоставляет её без второго списания", async ({ request, page }) => {
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

  await page.goto(`/adaptation?analysisId=${encodeURIComponent(analysisId)}&vacancyId=${encodeURIComponent(vacancyId)}`);
  const adaptationDraft = "Лично провела 8 интервью и проверила две гипотезы.";
  const answerField = page.getByLabel("Твой ответ");
  await answerField.fill(adaptationDraft);
  await page.waitForTimeout(350);
  await page.reload();
  await expect(page.getByLabel("Твой ответ")).toHaveValue(adaptationDraft);

  const adaptation = await request.post("/api/adaptations", {
    data: {
      analysisId,
      vacancyId,
      answers: [{ requirementId: preparedData.questions[0].requirementId, answer: adaptationDraft }],
    },
  });
  expect(adaptation.status()).toBe(200);
  const adaptationData = await adaptation.json();
  expect(adaptationData).toMatchObject({ ready: true });
  expect(adaptationData.adaptedText).toContain("Проводила интервью с пользователями");
  expect(adaptationData.adaptedText).toContain("8 интервью");

  const accessAfterAdaptation = await request.get(`/api/payments/access?analysisId=${analysisId}`);
  expect(await accessAfterAdaptation.json()).toMatchObject({ adaptationUsed: true, adaptationAvailable: false, rechecksRemaining: 5 });

  await page.goto(`/adaptation?analysisId=${encodeURIComponent(analysisId)}&vacancyId=${encodeURIComponent(vacancyId)}`);
  await expect(page.getByRole("heading", { name: "Резюме под вакансию готово" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Скачать готовое резюме/ })).toBeVisible();
  await page.screenshot({ path: "tests/artifacts/ux-after/adaptation-1280.png", fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: "tests/artifacts/ux-after/adaptation-390.png", fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Повторно проверить" }).click();
  await page.waitForURL((url) => url.pathname === "/vacancy" && url.searchParams.get("analysisId") !== null && url.searchParams.get("vacancyId") === vacancyId);
  const redirected = new URL(page.url());
  const recheckData = { analysisId: redirected.searchParams.get("analysisId")!, vacancyId: redirected.searchParams.get("vacancyId")! };
  expect(recheckData.analysisId).toBeTruthy();
  expect(recheckData.vacancyId).toBe(vacancyId);

  const savedAdaptation = await prisma.resumeAdaptation.findUniqueOrThrow({ where: { id: adaptationData.adaptationId } });
  const recheckAnalysis = await prisma.analysis.findUniqueOrThrow({ where: { id: recheckData.analysisId } });
  expect(recheckAnalysis.resumeVersionId).toBe(savedAdaptation.resumeVersionId);

  const repeated = await request.post(`/api/adaptations/${adaptationData.adaptationId}/recheck`);
  expect(repeated.status()).toBe(200);
  expect(await repeated.json()).toMatchObject({ reused: true, analysisId: recheckData.analysisId });

  const accessAfterRecheck = await request.get(`/api/payments/access?analysisId=${recheckData.analysisId}`);
  expect(await accessAfterRecheck.json()).toMatchObject({ rechecksUsed: 1, rechecksRemaining: 4 });
  const savedRecheck = await request.get(`/api/vacancies/${vacancyId}?analysisId=${recheckData.analysisId}`);
  expect(savedRecheck.status()).toBe(200);
  expect((await savedRecheck.json()).result).toBeTruthy();
});
