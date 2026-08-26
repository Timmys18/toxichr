import { expect, test } from "@playwright/test";

const RESUME = `Иван Иванов
Product Manager

Опыт работы: Product Manager в сервисе доставки, 2022–2026.
Проводил интервью с пользователями, формировал дорожную карту продукта и координировал команду разработки.
Отвечал за продуктовую аналитику, подготовку требований и запуск новых функций.
Руководил командой и согласовывал приоритеты со смежными подразделениями.
Образование: государственный университет, менеджмент.`;

function completedId(stream: string): string | null {
  for (const frame of stream.replace(/\r\n/g, "\n").split("\n\n")) {
    const line = frame.split("\n").find((item) => item.startsWith("data:"));
    if (!line) continue;
    const event = JSON.parse(line.slice(5).trim()) as {
      type?: string;
      analysisId?: string;
    };
    if (event.type === "completed") return event.analysisId ?? null;
  }
  return null;
}

test("повторный поток возвращает готовый разбор без второго запуска AI", async ({ request }) => {
  const resumeResponse = await request.post("/api/resumes/text", {
    data: { text: RESUME },
  });
  expect(resumeResponse.status()).toBe(200);
  const { resumeId } = await resumeResponse.json();

  const first = await request.post("/api/analyses/stream", {
    data: { resumeId, personaId: "lera" },
  });
  const second = await request.post("/api/analyses/stream", {
    data: { resumeId, personaId: "lera" },
  });

  expect(first.status()).toBe(200);
  expect(second.status()).toBe(200);
  const firstId = completedId(await first.text());
  const secondId = completedId(await second.text());
  expect(firstId).toBeTruthy();
  expect(secondId).toBe(firstId);
});
