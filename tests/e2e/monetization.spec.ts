import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";

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

for (const entryPoint of ["access", "checkout"] as const) {
  test(`старая покупка распознаётся через ${entryPoint} без повторной оплаты`, async ({ request }) => {
    const resumeResponse = await request.post("/api/resumes/text", { data: { text: RESUME } });
    expect(resumeResponse.status()).toBe(200);
    const { resumeId } = await resumeResponse.json();
    const analysisResponse = await request.post("/api/analyses", { data: { resumeId, personaId: "lera" } });
    expect(analysisResponse.status()).toBe(200);
    const { analysisId } = await analysisResponse.json();

    // Только старая покупка: reservePackageAction до первого обращения не вызывается.
    await prisma.accessGrant.create({
      data: { analysisId, productCode: "resume_improvement", source: "payment" },
    });
    expect(await prisma.toxicHrPackage.count({ where: { resumeId } })).toBe(0);

    const firstResponse = entryPoint === "access"
      ? await request.get(`/api/payments/access?analysisId=${analysisId}`)
      : await request.post("/api/payments/checkout", { data: { analysisId } });
    expect(firstResponse.status()).toBe(200);
    expect(await firstResponse.json()).toMatchObject(entryPoint === "access"
      ? { hasPackage: true, matchesRemaining: 5, rechecksRemaining: 5 }
      : { access: true, checkoutUrl: null });

    const migrated = await prisma.toxicHrPackage.findUniqueOrThrow({ where: { resumeId } });
    expect(migrated.source).toBe("legacy_migration");
    await prisma.packageUsage.create({
      data: {
        packageId: migrated.id,
        kind: "MATCH",
        status: "COMPLETED",
        dedupeKey: "legacy-match-used",
        completedAt: new Date(),
      },
    });

    // Повторная проверка не создаёт платёж/второй пакет и не сбрасывает остатки.
    const checkout = await request.post("/api/payments/checkout", { data: { analysisId } });
    expect(checkout.status()).toBe(200);
    expect(await checkout.json()).toMatchObject({ access: true, checkoutUrl: null });
    const access = await request.get(`/api/payments/access?analysisId=${analysisId}`);
    expect(access.status()).toBe(200);
    expect(await access.json()).toMatchObject({ hasPackage: true, matchesUsed: 1, matchesRemaining: 4 });
    expect(await prisma.toxicHrPackage.count({ where: { resumeId } })).toBe(1);
    expect(await prisma.payment.count({ where: { analysisId } })).toBe(0);
  });
}

test("платный match закрыт сервером, а самостоятельный разбор вакансии остаётся бесплатным", async ({ request }) => {
  const resumeResponse = await request.post("/api/resumes/text", { data: { text: RESUME } });
  expect(resumeResponse.status()).toBe(200);
  const { resumeId } = await resumeResponse.json();

  const analysisResponse = await request.post("/api/analyses", { data: { resumeId, personaId: "lera" } });
  expect(analysisResponse.status()).toBe(200);
  const { analysisId } = await analysisResponse.json();

  const secondHr = await request.post("/api/analyses", { data: { resumeId, personaId: "tamara" } });
  expect(secondHr.status()).toBe(200);

  const standalone = await request.post("/api/vacancies/review", { data: { text: VACANCY } });
  expect(standalone.status()).toBe(200);
  expect((await standalone.json()).matched).toBe(false);

  const match = await request.post("/api/vacancies/review", { data: { text: VACANCY, analysisId } });
  expect(match.status()).toBe(402);
  const paywall = await match.json();
  expect(paywall).toMatchObject({
    paymentRequired: true,
    priceRub: 199,
  });
  expect(paywall.vacancyId).toBeTruthy();

  const forgedCheckout = await request.post("/api/payments/checkout", {
    data: {
      analysisId,
      vacancyId: "vacancy-id-that-was-never-saved",
    },
  });
  expect(forgedCheckout.status()).toBe(404);
  expect(await forgedCheckout.json()).toMatchObject({
    error: "Вакансия не найдена или недоступна.",
  });

  const access = await request.get(`/api/payments/access?analysisId=${analysisId}`);
  expect(access.status()).toBe(200);
  expect(await access.json()).toMatchObject({ paywallEnabled: true, hasPackage: false, priceRub: 199 });

  const testPackage = await prisma.toxicHrPackage.create({ data: { resumeId, source: "test" } });
  // Имитируем оборванный старый запрос: следующая попытка обязана освободить
  // бронь, а не считать её использованным match.
  await prisma.packageUsage.create({
    data: {
      packageId: testPackage.id,
      kind: "MATCH",
      status: "PENDING",
      dedupeKey: "abandoned-match",
      createdAt: new Date(Date.now() - 16 * 60 * 1000),
    },
  });
  const paidMatch = await request.post("/api/vacancies/review", { data: { text: VACANCY, analysisId, vacancyId: paywall.vacancyId } });
  expect(paidMatch.status()).toBe(200);

  const usedAccess = await request.get(`/api/payments/access?analysisId=${analysisId}`);
  expect(await usedAccess.json()).toMatchObject({ hasPackage: true, matchesUsed: 1, matchesRemaining: 4, improvementAvailable: true, adaptationAvailable: true, rechecksRemaining: 5 });

  const questions = await request.get(`/api/improvements/${analysisId}`);
  const questionData = await questions.json();
  const rewrite = await request.post(`/api/improvements/${analysisId}`, {
    data: { answers: [{ problemId: questionData.questions[0].problemId, answer: "Провела 8 интервью и проверила две гипотезы." }] },
  });
  expect(rewrite.status()).toBe(200);

  const usedImprovement = await request.get(`/api/payments/access?analysisId=${analysisId}`);
  expect(await usedImprovement.json()).toMatchObject({ improvementUsed: true, improvementAvailable: false });

  const thirdHr = await request.post("/api/analyses", { data: { resumeId, personaId: "vadik" } });
  expect(thirdHr.status()).toBe(200);
  const { analysisId: recheckAnalysisId } = await thirdHr.json();
  const recheck = await request.post("/api/vacancies/review", { data: { text: VACANCY, analysisId: recheckAnalysisId, vacancyId: paywall.vacancyId } });
  expect(recheck.status()).toBe(200);
  expect((await recheck.json()).package).toMatchObject({ rechecksUsed: 1, rechecksRemaining: 4 });

  // Уже израсходованные действия моделируем в изолированной БД. Это оставляет
  // проверку серверного запрета реальной, но не гоняет Match Analyst ещё четыре раза.
  const packageRecord = await prisma.toxicHrPackage.findUniqueOrThrow({
    where: { resumeId },
    select: { id: true },
  });
  await prisma.packageUsage.createMany({
    data: Array.from({ length: 4 }, (_, index) => ({
      packageId: packageRecord.id,
      kind: "MATCH" as const,
      status: "COMPLETED" as const,
      dedupeKey: `seeded-match:${index}`,
      completedAt: new Date(),
    })),
  });
  const exhausted = await request.post("/api/vacancies/review", {
    data: { text: `${VACANCY}\nЕщё одно отдельное условие.`, analysisId },
  });
  expect(exhausted.status()).toBe(403);
  expect(await exhausted.json()).toMatchObject({ limitReached: true, paymentRequired: false });
});
