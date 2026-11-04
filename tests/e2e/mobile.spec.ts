import { expect, test } from "@playwright/test";

test("мобильная главная не вылезает за экран и сохраняет основной CTA", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Твоё резюме не работает\?/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Разобрать вакансию" })).toBeVisible();
  await expect(page.getByText("Выбери своего HR и узнай почему")).toBeVisible();
  await expect(page.getByRole("button", { name: "Кидай резюме" })).toBeVisible();

  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(metrics.scrollWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(
    metrics.innerWidth + 1,
  );

  await page.getByRole("button", { name: /Лера, Бигтех/ }).click();
  await expect(page.getByRole("button", { name: "Начать разбор", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Вставить текст" })).toBeVisible();

  await page.getByRole("button", { name: "Вставить текст" }).click();
  await page.getByLabel("Резюме без файла").fill("Короткий опыт");
  await expect(page.getByText(/Добавь ещё \d+ символов/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Начать разбор", exact: true })).toBeDisabled();
});

test("черновик резюме переживает refresh и back/forward", async ({ page }) => {
  const draft = "Product Manager. Проводил исследования пользователей, запускал эксперименты, работал с метриками и координировал команду разработки.";
  await page.goto("/");
  await page.getByRole("button", { name: "Вставить текст" }).click();
  await page.getByLabel("Резюме без файла").fill(draft);
  await page.waitForTimeout(350);
  await page.reload();
  await expect(page.getByLabel("Резюме без файла")).toHaveValue(draft);
  await expect(page.getByText("Черновик восстановлен. Проверь текст и продолжай.")).toBeVisible();

  await page.goto("/pricing");
  await page.goBack();
  await expect(page.getByLabel("Резюме без файла")).toHaveValue(draft);
  await page.goForward();
  await expect(page).toHaveURL(/\/pricing$/);
});

test("HR-состав не вылезает за экран и возвращает выбранного HR в основной flow", async ({ page }) => {
  await page.goto("/hr");
  await expect(page.getByRole("heading", { name: "Выбери своего HR." })).toBeVisible();

  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(metrics.scrollWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.innerWidth + 1);

  await page.getByRole("link", { name: "Выбрать HR: Лера" }).click();

  await expect(page).toHaveURL(/\/?\?persona=lera#resume-start$/);
  await expect(page.getByRole("button", { name: /Лера, Бигтех/ })).toBeVisible();
});

test("цены и auth используют единый mobile-контур без переполнения", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: "Цены." })).toBeVisible();
  await expect(page.getByText("199 ₽", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth + 1),
  );

  await page.goto("/auth");
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await expect(page.getByText(/Согласен на обработку резюме/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth + 1),
  );
});

test("ошибка разбора остаётся в общем mobile-контуре", async ({ page }) => {
  await page.goto("/session?resumeId=missing&personaId=lera");
  await expect(page.getByText("Резюме не найдено.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Попробовать снова" })).toBeVisible();
  await expect(page.getByRole("link", { name: "На главную" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth + 1),
  );
});

test("rewrite сохраняет общий mobile-контур при недоступном разборе", async ({ page }) => {
  await page.goto("/revenge?analysisId=missing");
  await expect(page.getByRole("heading", { name: "Сделаем резюме сильнее." })).toBeVisible();
  await expect(page.getByText("Разбор не найден.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth + 1),
  );
});

test("мобильная вакансия объясняет минимум текста и сохраняет черновик", async ({ page }) => {
  await page.goto("/vacancy");

  const vacancy = page.getByLabel("Текст вакансии");
  const submit = page.getByRole("button", { name: "Разобрать вакансию" });
  await expect(submit).toBeDisabled();
  await vacancy.fill("Ищем менеджера продукта");
  await expect(page.getByText(/Данных недостаточно · ещё \d+ символов/)).toBeVisible();

  await vacancy.fill(
    "Ищем менеджера продукта. Нужно проводить исследования, управлять командой, работать с метриками и запускать эксперименты.",
  );
  await expect(submit).toBeEnabled();
  await expect(page.getByText("Черновик сохранён")).toBeVisible();
  await page.reload();
  await expect(page.locator('textarea[aria-label="Текст вакансии"]:visible')).toHaveValue(/Ищем менеджера продукта/);

  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(metrics.scrollWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.innerWidth + 1);
});
