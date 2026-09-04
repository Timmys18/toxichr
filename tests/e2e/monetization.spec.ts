import { expect, test } from "@playwright/test";

const RESUME = `Анна Петрова
Product Manager

Опыт работы
Product Manager, сервис доставки, 2022–2026
Проводила интервью с пользователями, формировала дорожную карту и готовила требования для команды разработки.
Работала с продуктовой аналитикой и запуском новых функций.

Образование
Высшая школа экономики, менеджмент.`;

const VACANCY = `Senior Product Manager
Ищем продуктового менеджера для сервиса доставки.
Нужно проводить исследования пользователей и продуктовые эксперименты.
Требуется опыт управления кросс-функциональной командой.
Важно уметь работать с продуктовыми метриками и приоритизацией дорожной карты.`;

test("платный match закрыт сервером, а самостоятельный разбор вакансии остаётся бесплатным", async ({ request }) => {
  const resumeResponse = await request.post("/api/resumes/text", { data: { text: RESUME } });
  expect(resumeResponse.status()).toBe(200);
  const { resumeId } = await resumeResponse.json();

  const analysisResponse = await request.post("/api/analyses", { data: { resumeId, personaId: "lera" } });
  expect(analysisResponse.status()).toBe(200);
  const { analysisId } = await analysisResponse.json();

  const standalone = await request.post("/api/vacancies/review", { data: { text: VACANCY } });
  expect(standalone.status()).toBe(200);
  expect((await standalone.json()).matched).toBe(false);

  const match = await request.post("/api/vacancies/review", { data: { text: VACANCY, analysisId } });
  expect(match.status()).toBe(402);
  const paywall = await match.json();
  expect(paywall).toMatchObject({
    paymentRequired: true,
    product: "vacancy_match",
    priceRub: 199,
  });
  expect(paywall.vacancyId).toBeTruthy();

  const access = await request.get(`/api/payments/access?analysisId=${analysisId}&product=vacancy_match&vacancyId=${paywall.vacancyId}`);
  expect(access.status()).toBe(200);
  expect(await access.json()).toMatchObject({ paywallEnabled: true, hasAccess: false, priceRub: 199 });

  const questions = await request.get(`/api/improvements/${analysisId}`);
  const questionData = await questions.json();
  const rewrite = await request.post(`/api/improvements/${analysisId}`, {
    data: { answers: [{ problemId: questionData.questions[0].problemId, answer: "Провела 8 интервью и проверила две гипотезы." }] },
  });
  expect(rewrite.status()).toBe(402);
  expect(await rewrite.json()).toMatchObject({ paymentRequired: true, priceRub: 199 });
});
