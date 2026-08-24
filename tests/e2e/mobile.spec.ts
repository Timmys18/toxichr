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
