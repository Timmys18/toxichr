import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { createPackageCheckout, refreshPendingPackagePayment, syncYooKassaPayment } from "@/lib/package";
import { deleteAccountData } from "@/lib/account-deletion";
import { clientIp } from "@/lib/rate-limit";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

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

test("лимитер предпочитает IP, установленный reverse proxy", () => {
  const request = new Request("https://app.example/api/analyses", {
    headers: { "X-Forwarded-For": "198.51.100.5", "X-Real-IP": "203.0.113.8" },
  });
  expect(clientIp(request)).toBe("203.0.113.8");
});

test("локальный backup содержит читаемую SQLite и файл загрузки", async () => {
  const source = await mkdtemp(path.join(tmpdir(), "toxichr-backup-source-"));
  const destination = await mkdtemp(path.join(tmpdir(), "toxichr-backup-destination-"));
  try {
    const dataDir = path.join(source, ".data");
    await mkdir(path.join(dataDir, "uploads"), { recursive: true });
    execFileSync(process.execPath, [path.join(process.cwd(), "scripts", "ensure-sqlite-file.mjs")], {
      cwd: source,
      env: { ...process.env, DATABASE_URL: "file:./.data/test.db" },
    });
    const db = new Database(path.join(dataDir, "test.db"));
    db.exec("CREATE TABLE proof (value TEXT NOT NULL); INSERT INTO proof (value) VALUES ('saved');");
    db.close();
    await writeFile(path.join(dataDir, "uploads", "resume.txt"), "private fixture");
    execFileSync(process.execPath, [path.join(process.cwd(), "scripts", "backup-critical.mjs"), destination], {
      cwd: source,
      env: { ...process.env, DATABASE_URL: "file:./.data/test.db", STORAGE_DRIVER: "local" },
    });
    const [name] = await readdir(destination);
    const backupDir = path.join(destination, name);
    const manifest = JSON.parse(await readFile(path.join(backupDir, "manifest.json"), "utf8")) as { files: Record<string, string> };
    expect(Object.keys(manifest.files).sort()).toEqual(["database.sqlite", "uploads/resume.txt"]);
    const restored = new Database(path.join(backupDir, "database.sqlite"), { readonly: true });
    try {
      expect(restored.prepare("SELECT value FROM proof").get()).toEqual({ value: "saved" });
    } finally {
      restored.close();
    }
    expect(await readFile(path.join(backupDir, "uploads", "resume.txt"), "utf8")).toBe("private fixture");
  } finally {
    await rm(source, { recursive: true, force: true });
    await rm(destination, { recursive: true, force: true });
  }
});

test("повтор checkout идемпотентен, а возврат подтверждает платёж без webhook", async ({ request }) => {
  const resumeResponse = await request.post("/api/resumes/text", { data: { text: RESUME } });
  const { resumeId } = await resumeResponse.json();
  const analysisResponse = await request.post("/api/analyses", { data: { resumeId, personaId: "lera" } });
  const { analysisId } = await analysisResponse.json();
  const externalId = `test-provider-${analysisId}`;
  const originalFetch = globalThis.fetch;
  const previousShop = process.env.YOOKASSA_SHOP_ID;
  const previousSecret = process.env.YOOKASSA_SECRET_KEY;
  const previousPaywall = process.env.BETA_PAYWALL_ENABLED;
  const keys: string[] = [];
  const returnUrls: string[] = [];
  let providerStatus: "pending" | "succeeded" = "pending";
  process.env.YOOKASSA_SHOP_ID = "test-shop";
  process.env.YOOKASSA_SECRET_KEY = "test-secret";
  process.env.BETA_PAYWALL_ENABLED = "true";
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    expect(url).toContain("https://api.yookassa.ru/v3/payments");
    if (init?.method === "POST") {
      keys.push(String(new Headers(init.headers).get("Idempotence-Key")));
      returnUrls.push((JSON.parse(String(init.body)) as { confirmation: { return_url: string } }).confirmation.return_url);
      return Response.json({ id: externalId, status: "pending", confirmation: { confirmation_url: "https://checkout.example/pay" } });
    }
    return Response.json({ id: externalId, status: providerStatus, paid: providerStatus === "succeeded" });
  };
  try {
    const [first, concurrent] = await Promise.all([
      createPackageCheckout({ analysisId, returnUrl: "https://app.example/revenge" }),
      createPackageCheckout({ analysisId, returnUrl: "https://app.example/revenge" }),
    ]);
    const repeated = await createPackageCheckout({ analysisId, returnUrl: "https://app.example/vacancy" });
    expect(first).toMatchObject({ access: false, checkoutUrl: "https://checkout.example/pay" });
    expect(concurrent).toMatchObject(first);
    expect(repeated).toMatchObject(first);
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(1);
    expect(returnUrls).toEqual(["https://app.example/revenge", "https://app.example/revenge", "https://app.example/revenge"]);
    expect(await prisma.payment.count({ where: { analysisId, provider: "yookassa" } })).toBe(1);
    providerStatus = "succeeded";
    await refreshPendingPackagePayment(analysisId);
    await refreshPendingPackagePayment(analysisId);
    expect(await prisma.payment.findFirst({ where: { analysisId }, select: { status: true } })).toMatchObject({ status: "PAID" });
    expect(await prisma.toxicHrPackage.count({ where: { resumeId } })).toBe(1);
    const payment = await prisma.payment.findFirstOrThrow({ where: { analysisId, provider: "yookassa" } });
    expect(await prisma.productEvent.count({ where: { eventName: "package_purchased", properties: { path: "$.paymentId", equals: payment.id } } })).toBe(1);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousShop === undefined) delete process.env.YOOKASSA_SHOP_ID; else process.env.YOOKASSA_SHOP_ID = previousShop;
    if (previousSecret === undefined) delete process.env.YOOKASSA_SECRET_KEY; else process.env.YOOKASSA_SECRET_KEY = previousSecret;
    if (previousPaywall === undefined) delete process.env.BETA_PAYWALL_ENABLED; else process.env.BETA_PAYWALL_ENABLED = previousPaywall;
  }
});

test("сетевой сбой checkout сохраняет pending и повторяет тот же ключ", async ({ request }) => {
  const resumeResponse = await request.post("/api/resumes/text", { data: { text: RESUME } });
  const { resumeId } = await resumeResponse.json();
  const analysisResponse = await request.post("/api/analyses", { data: { resumeId, personaId: "lera" } });
  const { analysisId } = await analysisResponse.json();
  const originalFetch = globalThis.fetch;
  const oldShop = process.env.YOOKASSA_SHOP_ID;
  const oldSecret = process.env.YOOKASSA_SECRET_KEY;
  const oldPaywall = process.env.BETA_PAYWALL_ENABLED;
  const keys: string[] = [];
  process.env.YOOKASSA_SHOP_ID = "test-shop";
  process.env.YOOKASSA_SECRET_KEY = "test-secret";
  process.env.BETA_PAYWALL_ENABLED = "true";
  globalThis.fetch = async (_input, init) => {
    keys.push(String(new Headers(init?.headers).get("Idempotence-Key")));
    if (keys.length === 1) throw new Error("network interrupted");
    return Response.json({ id: `retry-${analysisId}`, status: "pending", confirmation: { confirmation_url: "https://checkout.example/retry" } });
  };
  try {
    await expect(createPackageCheckout({ analysisId, returnUrl: "https://app.example/revenge" })).rejects.toThrow("network interrupted");
    expect(await prisma.payment.findFirstOrThrow({ where: { analysisId } })).toMatchObject({ status: "PENDING", externalId: null });
    const retry = await createPackageCheckout({ analysisId, returnUrl: "https://app.example/revenge" });
    expect(retry).toMatchObject({ access: false, checkoutUrl: "https://checkout.example/retry" });
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(await prisma.payment.count({ where: { analysisId } })).toBe(1);
    expect(await prisma.toxicHrPackage.count({ where: { resumeId } })).toBe(0);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldShop === undefined) delete process.env.YOOKASSA_SHOP_ID; else process.env.YOOKASSA_SHOP_ID = oldShop;
    if (oldSecret === undefined) delete process.env.YOOKASSA_SECRET_KEY; else process.env.YOOKASSA_SECRET_KEY = oldSecret;
    if (oldPaywall === undefined) delete process.env.BETA_PAYWALL_ENABLED; else process.env.BETA_PAYWALL_ENABLED = oldPaywall;
  }
});

test("отмена YooKassa не выдаёт пакет и освобождает checkout для новой попытки", async ({ request }) => {
  const resumeResponse = await request.post("/api/resumes/text", { data: { text: RESUME } });
  const { resumeId } = await resumeResponse.json();
  const analysisResponse = await request.post("/api/analyses", { data: { resumeId, personaId: "lera" } });
  const { analysisId } = await analysisResponse.json();
  const payment = await prisma.payment.create({
    data: { analysisId, provider: "yookassa", externalId: `canceled-${analysisId}`, checkoutKey: `package:${analysisId}`, returnUrl: "https://app.example/revenge", productCode: "toxichr_package", amount: 19_900, currency: "RUB" },
  });
  const originalFetch = globalThis.fetch;
  const oldShop = process.env.YOOKASSA_SHOP_ID;
  const oldSecret = process.env.YOOKASSA_SECRET_KEY;
  const oldPaywall = process.env.BETA_PAYWALL_ENABLED;
  process.env.YOOKASSA_SHOP_ID = "test-shop";
  process.env.YOOKASSA_SECRET_KEY = "test-secret";
  process.env.BETA_PAYWALL_ENABLED = "true";
  globalThis.fetch = async (input, init) => init?.method === "POST"
    ? Response.json({ id: `new-${analysisId}`, status: "pending", confirmation: { confirmation_url: "https://checkout.example/new" } })
    : Response.json({ id: String(input).includes(payment.externalId!) ? payment.externalId : `new-${analysisId}`, status: "canceled" });
  try {
    await syncYooKassaPayment(payment.externalId!);
    await syncYooKassaPayment(payment.externalId!);
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).toMatchObject({ status: "CANCELED", checkoutKey: null });
    expect(await prisma.toxicHrPackage.count({ where: { resumeId } })).toBe(0);
    expect(await prisma.productEvent.count({ where: { eventName: "payment_failed", properties: { path: "$.paymentId", equals: payment.id } } })).toBe(1);
    const access = await request.get(`/api/payments/access?analysisId=${analysisId}`);
    expect(await access.json()).toMatchObject({ hasPackage: false, paymentStatus: "canceled" });
    const retry = await createPackageCheckout({ analysisId, returnUrl: "https://app.example/revenge" });
    expect(retry).toMatchObject({ access: false, checkoutUrl: "https://checkout.example/new" });
    expect(await prisma.payment.count({ where: { analysisId } })).toBe(2);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldShop === undefined) delete process.env.YOOKASSA_SHOP_ID; else process.env.YOOKASSA_SHOP_ID = oldShop;
    if (oldSecret === undefined) delete process.env.YOOKASSA_SECRET_KEY; else process.env.YOOKASSA_SECRET_KEY = oldSecret;
    if (oldPaywall === undefined) delete process.env.BETA_PAYWALL_ENABLED; else process.env.BETA_PAYWALL_ENABLED = oldPaywall;
  }
});

test("удаление аккаунта очищает скрытую карточку и производные данные", async ({ request }) => {
  const user = await prisma.user.create({ data: { email: `privacy-${crypto.randomUUID()}@example.test` } });
  const resume = await prisma.resume.create({ data: { userId: user.id, status: "READY", sanitizedText: "Личный текст" } });
  const version = await prisma.resumeVersion.create({ data: { resumeId: resume.id, structuredContent: { personal: "Личный текст" } } });
  const analysis = await prisma.analysis.create({ data: { userId: user.id, resumeVersionId: version.id, status: "COMPLETED", reportPayload: { personal: "Личный текст" }, scorePayload: { score: 1 } } });
  const vacancy = await prisma.vacancy.create({ data: { userId: user.id, sourceText: "Личная вакансия" } });
  const share = await prisma.publicShare.create({ data: { userId: user.id, analysisId: analysis.id, slug: `privacy-${crypto.randomUUID()}`, active: false, publicPayload: { quote: "Личный текст" }, title: "Личный текст", description: "Личный текст" } });
  await prisma.resumeAdaptation.create({ data: { userId: user.id, analysisId: analysis.id, vacancyId: vacancy.id, answers: { personal: "Личный текст" } } });
  await prisma.analysisFeedback.create({ data: { analysisId: analysis.id, verdict: "useful", note: "Личный текст" } });
  await prisma.candidateProfile.create({ data: { resumeVersionId: version.id, primaryRole: "Личный текст" } });
  await prisma.productEvent.create({ data: { userId: user.id, eventName: "test", properties: { personal: "Личный текст" } } });

  await deleteAccountData(user.id);

  expect(await prisma.publicShare.findUniqueOrThrow({ where: { id: share.id } })).toMatchObject({ active: false, publicPayload: { redacted: true }, title: null, description: null });
  expect((await request.get(`/api/public-shares/${share.slug}`)).status()).toBe(404);
  expect(await prisma.resumeAdaptation.count({ where: { userId: user.id } })).toBe(0);
  expect(await prisma.analysisFeedback.count({ where: { analysisId: analysis.id } })).toBe(0);
  expect(await prisma.candidateProfile.count({ where: { resumeVersionId: version.id } })).toBe(0);
  expect(await prisma.productEvent.count({ where: { userId: user.id } })).toBe(0);
  expect(await prisma.resume.findUniqueOrThrow({ where: { id: resume.id } })).toMatchObject({ sanitizedText: null, status: "DELETED" });
  expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ passwordHash: null, displayName: "удалён" });
});

test("регистрация без согласия не создаёт аккаунт", async ({ request }) => {
  const email = `no-consent-${crypto.randomUUID()}@example.test`;
  const response = await request.post("/api/auth/register", { data: { email, password: "safe-password-123", consent: false } });
  expect(response.status()).toBe(400);
  expect(await prisma.user.count({ where: { email } })).toBe(0);
});

test("доступ различает pending, failed, canceled и paid при возврате после оплаты", async ({ request }) => {
  const resumeResponse = await request.post("/api/resumes/text", { data: { text: RESUME } });
  const { resumeId } = await resumeResponse.json();
  const analysisResponse = await request.post("/api/analyses", { data: { resumeId, personaId: "lera" } });
  const { analysisId } = await analysisResponse.json();

  const payment = await prisma.payment.create({
    data: { analysisId, provider: "test", productCode: "toxichr_package", amount: 19_900, currency: "RUB" },
  });
  const pending = await request.get(`/api/payments/access?analysisId=${analysisId}`);
  expect(await pending.json()).toMatchObject({ hasPackage: false, paymentStatus: "pending" });

  await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
  const failed = await request.get(`/api/payments/access?analysisId=${analysisId}`);
  expect(await failed.json()).toMatchObject({ hasPackage: false, paymentStatus: "failed" });

  await prisma.payment.update({ where: { id: payment.id }, data: { status: "CANCELED" } });
  const canceled = await request.get(`/api/payments/access?analysisId=${analysisId}`);
  expect(await canceled.json()).toMatchObject({ hasPackage: false, paymentStatus: "canceled" });

  await prisma.payment.update({ where: { id: payment.id }, data: { status: "PAID", paidAt: new Date() } });
  await prisma.toxicHrPackage.create({ data: { resumeId, paymentId: payment.id, source: "test" } });
  const paid = await request.get(`/api/payments/access?analysisId=${analysisId}`);
  expect(await paid.json()).toMatchObject({ hasPackage: true, paymentStatus: "paid" });
});

test("недоступный YooKassa сохраняет pending без ложного 404", async ({ request }) => {
  const resumeResponse = await request.post("/api/resumes/text", { data: { text: RESUME } });
  const { resumeId } = await resumeResponse.json();
  const analysisResponse = await request.post("/api/analyses", { data: { resumeId, personaId: "lera" } });
  const { analysisId } = await analysisResponse.json();
  await prisma.payment.create({ data: { analysisId, provider: "yookassa", externalId: `pending-${analysisId}`, productCode: "toxichr_package", amount: 19_900, currency: "RUB" } });
  const response = await request.get(`/api/payments/access?analysisId=${analysisId}&refresh=1`);
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ hasPackage: false, paymentStatus: "pending", verificationDelayed: true });
  expect(await prisma.toxicHrPackage.count({ where: { resumeId } })).toBe(0);
});

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
  const clarification = await request.post(`/api/improvements/${analysisId}`, {
    data: { answers: [{ problemId: questionData.questions[0].problemId, answer: "Не помню" }] },
  });
  expect(clarification.status()).toBe(422);
  expect((await clarification.json()).questions[0].quote).toBe(questionData.questions[0].quote);
  expect(await prisma.packageUsage.count({ where: { packageId: testPackage.id, kind: "IMPROVEMENT" } })).toBe(0);
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


test("аудит: владельцы, повторный анализ и история версий", async ({ playwright, page }) => {
  const contexts = [];
  for (let i = 0; i < 2; i++) {
    const context = await playwright.request.newContext({ baseURL: "http://127.0.0.1:3102" });
    contexts.push(context);
    const email = `audit-${Date.now()}-${i}@example.test`;
    expect((await context.post("/api/auth/register", { data: { email, password: "audit-password-123", consent: true } })).ok()).toBeTruthy();
    const { csrfToken } = await (await context.get("/api/auth/csrf")).json();
    await context.post("/api/auth/callback/credentials", { form: { csrfToken, email, password: "audit-password-123", callbackUrl: "/me" } });
  }
  const [owner, other] = contexts;
  try {
    const session = await (await owner.get("/api/auth/session")).json();
    expect(session.user.id).toBeTruthy();
    const { resumeId } = await (await owner.post("/api/resumes/text", { data: { text: RESUME } })).json();
    expect((await prisma.resume.findUniqueOrThrow({ where: { id: resumeId } })).userId).toBe(session.user.id);
    expect((await other.post("/api/analyses", { data: { resumeId, personaId: "lera" } })).status()).toBe(403);
    const deniedStream = await other.post("/api/analyses/stream", { data: { resumeId, personaId: "lera" } });
    expect(await deniedStream.text()).toContain("Нет доступа.");
    expect(await prisma.analysis.count({ where: { resumeVersion: { resumeId } } })).toBe(0);
    const response = await owner.post("/api/analyses", { data: { resumeId, personaId: "lera" } });
    expect(response.ok()).toBeTruthy();
    const { analysisId } = await response.json();
    expect((await prisma.analysis.findUniqueOrThrow({ where: { id: analysisId } })).userId).toBe(session.user.id);
    const cachedDenied = await other.post("/api/analyses/stream", { data: { resumeId, personaId: "lera" } });
    expect(await cachedDenied.text()).not.toContain(analysisId);
    await prisma.toxicHrPackage.create({ data: { resumeId, userId: session.user.id, source: "test" } });
    const first = await (await owner.post("/api/vacancies/review", { data: { text: VACANCY, analysisId } })).json();
    const second = await (await owner.post("/api/vacancies/review", { data: { text: VACANCY + " Дополнительно: SQL и аналитика.", analysisId, vacancyId: first.vacancyId } })).json();
    expect(second.vacancyId).toBeTruthy();
    expect(second.vacancyId).not.toBe(first.vacancyId);
    expect((await prisma.vacancy.findUniqueOrThrow({ where: { id: first.vacancyId } })).sourceText).toBe(VACANCY);
    const questions = await (await owner.get(`/api/improvements/${analysisId}`)).json();
    expect((await owner.post(`/api/improvements/${analysisId}`, { data: { answers: [{ problemId: questions.questions[0].problemId, answer: "Провела 8 интервью и проверила две гипотезы." }] } })).ok()).toBeTruthy();
    const recheck = await owner.post(`/api/improvements/${analysisId}/recheck`);
    expect(recheck.ok()).toBeTruthy();
    const improved = await recheck.json();
    const saved = await prisma.resumeImprovement.findUniqueOrThrow({ where: { analysisId } });
    const improvedAnalysis = await prisma.analysis.findUniqueOrThrow({ where: { id: improved.analysisId } });
    expect(improvedAnalysis.resumeVersionId).toBe(saved.resumeVersionId);
    expect(improved.analysisId).not.toBe(analysisId);
    expect(await (await owner.post(`/api/improvements/${analysisId}/recheck`)).json()).toEqual(improved);
    const originalVersionId = improvedAnalysis.resumeVersionId;
    expect((await owner.patch(`/api/improvements/${analysisId}`, { data: { improvedText: saved.improvedText + "\nНавыки: SQL." } })).ok()).toBeTruthy();
    const edited = await (await owner.post(`/api/improvements/${analysisId}/recheck`)).json();
    expect(edited.analysisId).not.toBe(improved.analysisId);
    expect((await prisma.analysis.findUniqueOrThrow({ where: { id: improved.analysisId } })).resumeVersionId).toBe(originalVersionId);
    await page.context().addCookies((await owner.storageState()).cookies);
    for (const width of [1280, 834, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await expect(page.getByText("Получи бесплатный разбор:", { exact: false })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
      await page.screenshot({ path: `tests/artifacts/audit/home-${width}.png`, fullPage: true });
    }
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/session?view=${analysisId}`);
      await expect(page.getByText("Продолжить работу с резюме · пакет открыт")).toBeVisible();
      await page.screenshot({ path: `tests/artifacts/audit/result-${width}.png`, fullPage: true });
      await page.goto(`/revenge?analysisId=${analysisId}`);
      await expect(page.getByRole("button", { name: "Проверить под вакансию →" })).toBeVisible();
      await page.screenshot({ path: `tests/artifacts/audit/improvement-${width}.png`, fullPage: true });
      await page.goto(`/vacancy?analysisId=${analysisId}&vacancyId=${first.vacancyId}`);
      await expect(page.getByRole("button", { name: "Сравнить с другой вакансией" })).toBeVisible();
      await expect(page.getByText(/Адаптация (входит в пакет|уже использована)/)).toBeVisible();
      await expect(page.getByRole("link", { name: /Адаптировать резюме под вакансию|Исправить резюме/ })).toBeVisible();
      await page.screenshot({ path: `tests/artifacts/audit/vacancy-${width}.png`, fullPage: true });
      await page.getByRole("button", { name: "Сравнить с другой вакансией" }).click();
      await expect(page.getByRole("textbox", { name: "Текст вакансии" })).toHaveValue("");
      expect(page.url()).not.toContain("vacancyId=");
    }
  } finally { for (const context of contexts) await context.dispose(); }
});
