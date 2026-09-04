import { expect, test } from "@playwright/test";

const RESUME = `Иван Иванов
Product Manager

Опыт работы
Product Manager, сервис доставки, 2022–2026
Участвовал в запуске нового продукта и взаимодействовал с командой разработки.
Отвечал за продуктовую аналитику и подготовку требований.
Руководил командой и обеспечивал эффективное взаимодействие.
Проводил интервью с пользователями и формировал дорожную карту.
Ответственный, коммуникабельный, ориентирован на результат.

Образование
Санкт-Петербургский государственный университет, менеджмент.`;

const VACANCY = `Senior Product Manager
Ищем продуктового менеджера для сервиса доставки.
Нужно проводить исследования пользователей и продуктовые эксперименты.
Требуется опыт управления кросс-функциональной командой.
Важно уметь работать с продуктовыми метриками и приоритизацией дорожной карты.
Ожидаем подтверждённые результаты запусков и влияние на выручку.
Мы предлагаем дружный коллектив, амбициозные задачи и возможности роста.`;

test("полный путь: два HR → редактор → вакансия → кабинет", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Токсичный HR/i })).toBeVisible();

  await page.getByRole("button", { name: /^Лера —/ }).click();
  await page.getByRole("button", { name: "Вставить текст" }).click();
  await page.getByLabel("Текст резюме").fill(RESUME);
  await page.getByRole("button", { name: /Отдать текст/i }).click();

  await expect(page).toHaveURL(/\/session\?/);
  await expect(page.getByText("Одно резюме. Четыре разных фильтра.")).toBeVisible({ timeout: 60_000 });

  const improvementHref = await page
    .getByRole("link", { name: /Исправить резюме · 199 ₽/i })
    .first()
    .getAttribute("href");
  expect(improvementHref).toMatch(/^\/revenge\?analysisId=/);
  const firstAnalysisId = new URL(improvementHref!, "http://local").searchParams.get("analysisId");
  expect(firstAnalysisId).toBeTruthy();

  await page.getByRole("link", { name: /Тамара/i }).click();
  await expect(page).toHaveURL(/personaId=tamara/);
  await expect(page.locator(".presence .nm")).toHaveText("Тамара Петровна");
  await expect(page.locator(".presence .st")).toContainText("заключение готово", { timeout: 60_000 });

  await page.goto(`/revenge?analysisId=${firstAnalysisId}`);
  await expect(page.getByText(/Вопрос 1 из/)).toBeVisible();
  await expect(page.getByText(/Готовая новая версия — 199 ₽/)).toBeVisible();
  await page.getByLabel(/Ответ:/).fill(
    "Лично провёл 12 интервью, сформировал 4 гипотезы и довёл 2 из них до запуска.",
  );

  while (await page.getByRole("button", { name: /^(Дальше|Пропустить)$/ }).isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /^(Дальше|Пропустить)$/ }).click();
  }
  await page.getByRole("button", { name: /Собрать резюме/ }).click();
  await expect(page.getByRole("heading", { name: "Новая версия готова" })).toBeVisible({ timeout: 60_000 });

  await page.getByRole("tab", { name: "Редактор" }).click();
  const editor = page.getByLabel("Редактор новой версии резюме");
  const generated = await editor.inputValue();
  await editor.fill(`${generated}\nПровёл 12 интервью и проверил 4 продуктовые гипотезы.`);
  await expect(page.getByText("Есть несохранённые правки")).toBeVisible();
  await page.getByRole("button", { name: "Сохранить версию" }).click();
  await expect(page.getByText(/DOCX, PDF и проверка вакансией используют эту версию/)).toBeVisible();

  await page.getByRole("tab", { name: "Сравнить до / после" }).click();
  await expect(page.getByText("Исходное резюме", { exact: true })).toBeVisible();
  await expect(page.getByText("Новая версия", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: /Проверить под вакансию/ }).click();
  await page.getByLabel("Текст вакансии").fill(VACANCY);
  await page.getByRole("button", { name: "Сопоставить с резюме" }).click();
  await expect(page.getByText(/Вакансия сохранена · \d+ знаков/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: /Откликайся|Сначала поправь резюме|Не трать время/ })).toBeVisible();

  const email = `e2e-${Date.now()}@example.com`;
  await page.goto(`/auth?analysisId=${firstAnalysisId}&next=/me`);
  await page.getByPlaceholder("Имя (по желанию)").fill("Иван");
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("Пароль (от 8 символов)").fill("test-password-2026");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Создать аккаунт" }).click();

  await expect(page).toHaveURL(/\/me$/, { timeout: 30_000 });
  await expect(page.getByText("Версии до / после")).toBeVisible();
  await expect(page.getByLabel("Мои разборы: 2")).toBeVisible();
  await expect(page.getByText(/^Лера ·/).first()).toBeVisible();
  await expect(page.getByText(/^Тамара Петровна ·/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Мои вакансии/ }).first()).toBeVisible();
  await page.getByRole("link", { name: /Мои вакансии/ }).first().click();
  await expect(page.getByRole("heading", { name: "Сохранённые вакансии" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Senior Product Manager/ })).toBeVisible();

  await page.goto("/pricing");
  await expect(page.getByText(/199 ₽/).first()).toBeVisible();
  await expect(page.getByText(/Первый HR-разбор и ещё один взгляд/)).toBeVisible();
  await expect(page.locator(".topnav").getByText("Мои вакансии")).toHaveCount(0);
});

test("защитные сценарии API не ломают продукт", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ ok: true, service: "toxichr" });

  const shortResume = await request.post("/api/resumes/text", { data: { text: "слишком коротко" } });
  expect(shortResume.status()).toBe(400);

  const longResume = await request.post("/api/resumes/text", { data: { text: "а".repeat(60_001) } });
  expect(longResume.status()).toBe(413);

  const wrongFile = await request.post("/api/resumes/upload", {
    multipart: {
      file: { name: "resume.txt", mimeType: "text/plain", buffer: Buffer.from(RESUME) },
    },
  });
  expect(wrongFile.status()).toBe(415);

  const invalidCheckout = await request.post("/api/payments/checkout", { data: {} });
  expect(invalidCheckout.status()).toBe(400);

  const home = await request.get("/");
  expect(home.headers()["x-content-type-options"]).toBe("nosniff");
  expect(home.headers()["x-frame-options"]).toBe("DENY");
});

test("серверный цикл сохраняет две оценки, редактуру и сопоставление", async ({ request }) => {
  const resumeResponse = await request.post("/api/resumes/text", { data: { text: RESUME } });
  expect(resumeResponse.status()).toBe(200);
  const { resumeId } = await resumeResponse.json();

  const firstResponse = await request.post("/api/analyses", { data: { resumeId, personaId: "lera" } });
  const secondResponse = await request.post("/api/analyses", { data: { resumeId, personaId: "tamara" } });
  expect(firstResponse.status()).toBe(200);
  expect(secondResponse.status()).toBe(200);
  const { analysisId } = await firstResponse.json();
  const second = await secondResponse.json();
  expect(second.analysisId).not.toBe(analysisId);

  const thirdResponse = await request.post("/api/analyses", { data: { resumeId, personaId: "vadik" } });
  expect(thirdResponse.status()).toBe(403);
  expect((await thirdResponse.json()).error).toMatch(/Бесплатный лимит исчерпан/);

  const accessResponse = await request.get(`/api/payments/access?analysisId=${analysisId}&product=resume_rewrite`);
  expect(accessResponse.status()).toBe(200);
  expect(await accessResponse.json()).toMatchObject({ paywallEnabled: false, hasAccess: true, priceRub: 199 });

  const questionsResponse = await request.get(`/api/improvements/${analysisId}`);
  expect(questionsResponse.status()).toBe(200);
  const questions = await questionsResponse.json();
  expect(questions.questions.length).toBeGreaterThan(0);

  const improvementResponse = await request.post(`/api/improvements/${analysisId}`, {
    data: {
      answers: [{
        problemId: questions.questions[0].problemId,
        answer: "Лично провёл 12 интервью, проверил 4 гипотезы и довёл 2 до запуска.",
      }],
    },
  });
  expect(improvementResponse.status()).toBe(200);
  const improvement = await improvementResponse.json();
  expect(improvement.improvedText.length).toBeGreaterThan(80);

  const editedText = `${improvement.improvedText}\nПровёл 12 интервью и проверил 4 продуктовые гипотезы.`;
  const editorResponse = await request.patch(`/api/improvements/${analysisId}`, { data: { improvedText: editedText } });
  expect(editorResponse.status()).toBe(200);
  expect((await editorResponse.json()).improvedText).toContain("12 интервью");

  const docxResponse = await request.get(`/api/improvements/${analysisId}/docx`);
  expect(docxResponse.status()).toBe(200);
  expect(docxResponse.headers()["content-type"]).toContain("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  expect((await docxResponse.body()).byteLength).toBeGreaterThan(1_000);

  const analysisResponse = await request.get(`/api/analyses/${analysisId}`);
  expect(analysisResponse.status()).toBe(200);
  const analysis = await analysisResponse.json();
  const quoteId = analysis.report.shareQuotes[0]?.id;
  expect(quoteId).toBeTruthy();

  const shareResponse = await request.post("/api/public-shares", {
    data: {
      analysisId,
      mode: "pro",
      format: "og",
      quoteId,
      metrics: ["total", "evidence"],
      anonymization: {
        showName: false,
        showPhoto: false,
        showCompanies: false,
        showRole: true,
        showLevel: true,
      },
    },
  });
  expect(shareResponse.status()).toBe(200);
  const share = await shareResponse.json();
  expect((await request.get(`/api/public-shares/${share.slug}`)).status()).toBe(200);
  const cardResponse = await request.get(`/api/cards/${share.slug}?format=og`);
  expect(cardResponse.status()).toBe(200);
  expect(cardResponse.headers()["content-type"]).toContain("image/png");

  const vacancyResponse = await request.post("/api/vacancies/review", { data: { text: VACANCY, analysisId } });
  expect(vacancyResponse.status()).toBe(200);
  const vacancy = await vacancyResponse.json();
  expect(vacancy.matched).toBe(true);
  expect(vacancy.result.vacancyAssessment.requirements.length).toBeGreaterThan(0);
  expect(vacancy.result.matchAssessment.decision.code).toBeTruthy();
});
