import { expect, test } from "@playwright/test";

const resume = `Иван Петров — продуктовый менеджер. С 2021 года развиваю цифровые сервисы.
Проводил интервью с пользователями, вёл команду разработки и отвечал за запуск новых функций.
Собирал требования, планировал продуктовую дорожную карту, анализировал обратную связь.
Образование: Санкт-Петербургский государственный университет.`;

test("результат, честный разбор вакансии и четыре состояния кабинета", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Лера, Бигтех/ }).click();
  await page.getByRole("button", { name: "Вставить текст" }).click();
  await page.getByLabel("Резюме без файла").fill(resume);
  await page.getByRole("button", { name: "Начать разбор", exact: true }).click();
  await page.getByRole("dialog").getByRole("checkbox").check();
  await page.getByRole("dialog").getByRole("button", { name: "Начать разбор" }).click();
  await expect(page.locator(".result-hr-quote cite")).toContainText("В резюме:", { timeout: 90_000 });
  const href = await page.locator(".result-next").getAttribute("href");
  const analysisId = new URL(href!, "http://local").searchParams.get("analysisId")!;
  await page.screenshot({ path: "artifacts/ux-ui-rebuild/working/result-acceptance-desktop.png", fullPage: true, animations: "disabled" });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => { const box = await page.locator(".result-next").boundingBox(); return box ? box.y + box.height : 9999; }).toBeLessThan(844);
  await page.screenshot({ path: "artifacts/ux-ui-rebuild/working/result-acceptance-mobile.png", fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto(`/auth?analysisId=${analysisId}&next=/me`);
  await page.getByLabel("Почта").fill(`acceptance-${Date.now()}@example.test`);
  await page.getByLabel("Пароль", { exact: true }).fill("test-only-password-123");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Создать аккаунт/ }).click();
  await expect(page).toHaveURL(/\/me/, { timeout: 30_000 });
  await expect(page.locator(".cabinet-feature")).toContainText("Смотреть разбор");
  await expect(page.locator(".cabinet-resume-summary")).toContainText("продуктовый менеджер");

  await page.evaluate((id) => localStorage.setItem(`toxichr:revenge:${id}`, JSON.stringify({ question: "Провёл 12 интервью с пользователями" })), analysisId);
  await page.reload();
  await expect(page.locator(".cabinet-feature")).toContainText("Продолжить ответы");
  await page.screenshot({ path: "artifacts/ux-ui-rebuild/working/cabinet-draft-desktop.png", fullPage: true, animations: "disabled" });

  const second = await page.request.post("/api/resumes/text", { data: { text: `Мария Соколова — бухгалтер. Вела первичную документацию, сверяла счета и готовила отчёты с 2020 года. Работала с поставщиками и внутренними заявками. ${resume}` } });
  expect(second.ok()).toBeTruthy();
  await page.reload();
  await expect(page.locator(".cabinet-resume-summary")).toHaveCount(2);
  await expect(page.locator(".cabinet-resume-summary").first()).toContainText("бухгалтер");
  await expect(page.locator(".cabinet-resume-summary").nth(1)).toContainText("продуктовый менеджер");

  await page.goto(`/revenge?analysisId=${analysisId}`);
  await page.getByLabel("Твой ответ").fill("Лично провёл 12 интервью с пользователями и запустил две функции по результатам проверки гипотез.");
  for (let step = 0; step < 5 && await page.getByRole("button", { name: "Дальше", exact: true }).isVisible().catch(() => false); step += 1) {
    await page.getByRole("button", { name: "Дальше", exact: true }).click();
  }
  await page.getByRole("button", { name: "Собрать резюме" }).click();
  await expect(page.getByRole("heading", { name: "Резюме готово." })).toBeVisible({ timeout: 60_000 });
  await page.goto("/me");
  await expect(page.locator(".cabinet-feature")).toContainText("Скачать DOCX");
  await page.screenshot({ path: "artifacts/ux-ui-rebuild/working/cabinet-ready-desktop.png", fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/ux-ui-rebuild/working/cabinet-ready-mobile.png", fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 1440, height: 900 });
  const download = page.waitForEvent("download");
  await page.locator(".cabinet-feature").click();
  expect((await download).suggestedFilename()).toMatch(/\.docx$/i);

  const vacancyText = "Senior Product Manager. Развиваем цифровой сервис и ищем менеджера продукта с опытом интервью с пользователями, запуска функций, управления командой разработки и принятия решений на основе фактов.";
  await page.goto("/vacancy");
  await page.getByRole("textbox", { name: "Текст вакансии" }).fill(vacancyText);
  await page.getByRole("button", { name: "Разобрать вакансию" }).click();
  await expect(page.locator('.ds-comparison-result[data-evaluation-state="unavailable"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".ds-comparison-result")).not.toContainText("Откликайся");
  await expect(page.locator(".ds-comparison-result")).not.toContainText("Адаптировать резюме");
  await page.screenshot({ path: "artifacts/ux-ui-rebuild/working/vacancy-unavailable-desktop.png", fullPage: true, animations: "disabled" });

  await page.goto(`/vacancy?analysisId=${analysisId}`);
  await page.getByRole("textbox", { name: "Текст вакансии" }).fill(vacancyText);
  await page.getByRole("button", { name: "Сопоставить с резюме" }).click();
  await expect(page.locator('.ds-comparison-result[data-evaluation-state="unavailable"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".ds-comparison-result")).not.toContainText("Откликайся");
  await expect(page.locator(".ds-comparison-result")).not.toContainText("Адаптировать резюме");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/ux-ui-rebuild/working/match-unavailable-mobile.png", fullPage: true, animations: "disabled" });
});
