import { expect, test } from "@playwright/test";

const resume = `Иван Петров — продуктовый менеджер. Опыт работы с цифровыми сервисами с 2021 года.
Вёл команду разработки, проводил интервью с пользователями и отвечал за запуск новых функций.
Собирал требования, планировал продуктовую дорожную карту и анализировал обратную связь.
Образование: Санкт-Петербургский государственный университет.`;

test("локальный путь: загрузка, HR, результат и кабинет", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: /Лера, Бигтех/ }).click();
  await page.getByRole("button", { name: "Вставить текст" }).click();
  await page.getByLabel("Резюме без файла").fill(resume);
  await page.getByRole("button", { name: "Начать разбор", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Перед разбором" })).toBeVisible();
  await page.getByRole("dialog").getByRole("checkbox").check();
  await page.getByRole("dialog").getByRole("button", { name: "Начать разбор" }).click();
  await expect(page).toHaveURL(/\/session\?/);
  await expect(page.locator(".result-hero")).toBeVisible({ timeout: 90_000 });
  await expect(page.locator(".result-issue").first()).toBeVisible();
  expect(await page.locator(".result-issue").count()).toBeLessThanOrEqual(3);
  await page.screenshot({ path: "artifacts/ux-ui-rebuild/after/result-1440.png", fullPage: true, animations: "disabled" });
  const improvementHref = await page.locator(".result-next").getAttribute("href");
  const analysisId = new URL(improvementHref!, "http://local").searchParams.get("analysisId");
  expect(analysisId).toBeTruthy();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "artifacts/ux-ui-rebuild/after/result-390.png", fullPage: true, animations: "disabled" });

  await page.goto(`/auth?analysisId=${analysisId}&next=/me`);
  await page.getByLabel("Почта").fill(`ux-rebuild-${Date.now()}@example.test`);
  await page.getByLabel("Пароль", { exact: true }).fill("test-only-password-123");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Создать аккаунт/ }).click();
  await expect(page).toHaveURL(/\/me/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /Мои резюме/ })).toBeVisible();
  await expect(page.locator(".cabinet-feature")).toBeVisible();
  await page.screenshot({ path: "artifacts/ux-ui-rebuild/after/cabinet-390.png", fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: "artifacts/ux-ui-rebuild/after/cabinet-1440.png", fullPage: true, animations: "disabled" });

  await page.getByRole("navigation", { name: "Личный кабинет" }).getByRole("link", { name: "Вакансии" }).click();
  await expect(page).toHaveURL(/\/vacancies/);
  await expect(page.getByRole("navigation", { name: "Личный кабинет" })).toBeVisible();
  await expect(page.locator('.cabinet-vacancies[aria-busy="true"]')).toBeHidden();
  await expect(page.locator("#main").getByRole("link", { name: "Разобрать вакансию" })).toBeVisible();
  await page.screenshot({ path: "artifacts/ux-ui-rebuild/after/saved-vacancies-1440.png", fullPage: true, animations: "disabled" });
  await page.getByRole("navigation", { name: "Личный кабинет" }).getByRole("link", { name: "Документы" }).click();
  await expect(page).toHaveURL(/\/me\?tab=documents/);
  await expect(page.getByRole("navigation", { name: "Личный кабинет" })).toBeVisible();
  await page.screenshot({ path: "artifacts/ux-ui-rebuild/after/documents-1440.png", fullPage: true, animations: "disabled" });
  await page.getByRole("navigation", { name: "Личный кабинет" }).getByRole("link", { name: "Настройки" }).click();
  await expect(page).toHaveURL(/\/settings/);
  await page.screenshot({ path: "artifacts/ux-ui-rebuild/after/settings-1440.png", fullPage: true, animations: "disabled" });

  await page.goto(`/revenge?analysisId=${analysisId}`);
  await expect(page.locator(".revenge")).toBeVisible();
  await page.screenshot({ path: "artifacts/ux-ui-rebuild/after/improvement-1440.png", fullPage: true, animations: "disabled" });
  await page.getByLabel("Твой ответ").fill("Лично провёл 12 интервью с пользователями и запустил две функции по результатам проверки гипотез.");
  for (let step = 0; step < 5 && await page.getByRole("button", { name: "Дальше", exact: true }).isVisible().catch(() => false); step += 1) {
    await page.getByRole("button", { name: "Дальше", exact: true }).click();
  }
  await page.getByRole("button", { name: "Собрать резюме" }).click();
  await expect(page.getByRole("heading", { name: "Резюме готово." })).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: "artifacts/ux-ui-rebuild/after/improvement-ready-1440.png", fullPage: true, animations: "disabled" });
  const documentDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать готовое резюме · DOCX" }).click();
  expect((await documentDownload).suggestedFilename()).toMatch(/\.docx$/i);

  await page.goto("/vacancy");
  await page.getByRole("textbox", { name: "Текст вакансии" }).fill(`Senior Product Manager. Ищем человека для развития цифрового сервиса. Нужен опыт исследований пользователей, запуска функций, управления командой разработки и принятия продуктовых решений на основе фактов.`);
  await page.getByRole("button", { name: "Разобрать вакансию" }).click();
  await expect(page.locator(".ds-comparison-result")).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: "artifacts/ux-ui-rebuild/after/vacancy-result-1440.png", fullPage: true, animations: "disabled" });

  await page.goto(`/vacancy?analysisId=${analysisId}`);
  await page.getByRole("textbox", { name: "Текст вакансии" }).fill(`Senior Product Manager. Развиваем цифровой сервис и ищем менеджера продукта с подтверждёнными запусками. Важны интервью с пользователями, командная работа, аналитика и приоритизация задач.`);
  await page.getByRole("button", { name: "Сопоставить с резюме" }).click();
  await expect(page.locator(".ds-comparison-result")).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: "artifacts/ux-ui-rebuild/after/comparison-1440.png", fullPage: true, animations: "disabled" });
  const savedVacancyId = new URL(page.url()).searchParams.get("vacancyId");
  expect(savedVacancyId).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "artifacts/ux-ui-rebuild/after/comparison-390.png", fullPage: true, animations: "disabled" });

  await page.goto(`/adaptation?analysisId=${analysisId}&vacancyId=${savedVacancyId}`);
  await expect(page.locator(".ds-adaptation")).toBeVisible();
  await expect(page.locator(".ds-adaptation-skeleton")).toBeHidden({ timeout: 30_000 });
  await page.screenshot({ path: "artifacts/ux-ui-rebuild/after/adaptation-390.png", fullPage: true, animations: "disabled" });
  if (await page.getByLabel("Твой ответ").count()) {
    await page.getByLabel("Твой ответ").fill("Проводил интервью с пользователями и передавал проверенные требования команде разработки.");
    for (let step = 0; step < 30 && await page.getByRole("button", { name: /^(Дальше|Пропустить)$/ }).isVisible().catch(() => false); step += 1) {
      await page.getByRole("button", { name: /^(Дальше|Пропустить)$/ }).click();
    }
    await page.getByRole("button", { name: "Собрать версию под вакансию" }).click();
    await expect(page.getByText(/Пока подтверждённых фактов недостаточно/)).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: "artifacts/ux-ui-rebuild/after/adaptation-insufficient-390.png", fullPage: true, animations: "disabled" });
  }
});
