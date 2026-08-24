import { expect, test } from "@playwright/test";

test("мобильная главная не вылезает за экран и сохраняет основной CTA", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Токсичный HR/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Разобрать вакансию" })).toBeVisible();
  await expect(page.getByText(/Нажми на HR/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Получить разбор" })).toHaveCount(0);

  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(metrics.scrollWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(
    metrics.innerWidth + 1,
  );

  await page.getByRole("button", { name: /^Лера —/ }).click();
  await expect(page.getByRole("button", { name: "Получить разбор" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Или вставить текст" })).toBeVisible();

  await page.getByRole("button", { name: "Или вставить текст" }).click();
  await page.getByLabel("Текст резюме").fill("Короткий опыт");
  await expect(page.getByText(/Добавь ещё \d+ симв/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Отдать текст/ })).toBeDisabled();
});

test("мобильная вакансия объясняет минимум текста и сохраняет черновик", async ({ page }) => {
  await page.goto("/vacancy");

  const vacancy = page.getByLabel("Текст вакансии");
  const submit = page.getByRole("button", { name: "Разобрать вакансию" });
  await expect(submit).toBeDisabled();
  await vacancy.fill("Ищем менеджера продукта");
  await expect(page.getByText(/Добавь ещё \d+ симв/)).toBeVisible();

  await vacancy.fill(
    "Ищем менеджера продукта. Нужно проводить исследования, управлять командой, работать с метриками и запускать эксперименты.",
  );
  await expect(submit).toBeEnabled();
  await expect(page.getByText("Черновик сохранён на этом устройстве")).toBeVisible();

  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(metrics.scrollWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.innerWidth + 1);
});
