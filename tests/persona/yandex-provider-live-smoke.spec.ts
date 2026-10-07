import { expect, test } from "@playwright/test";
import { yandexBaseUrl } from "../../src/lib/ai/gateway";

test("YandexGPT Pro 5.1 accepts strict JSON Schema", async () => {
  test.skip(process.env.RUN_YANDEX_STRICT_SMOKE !== "1", "Requires explicit pre-release approval and Yandex credentials");
  const apiKey = process.env.YANDEX_AI_API_KEY?.trim();
  const folderId = process.env.YANDEX_AI_FOLDER_ID?.trim();
  expect(apiKey, "YANDEX_AI_API_KEY is required").toBeTruthy();
  expect(folderId, "YANDEX_AI_FOLDER_ID is required").toBeTruthy();

  const response = await fetch(`${yandexBaseUrl()}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: {
      Authorization: `Api-Key ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Project": folderId!,
      "x-data-logging-enabled": "false",
    },
    body: JSON.stringify({
      model: `gpt://${folderId}/yandexgpt-5.1`,
      temperature: 0,
      max_tokens: 32,
      messages: [{ role: "user", content: "Верни JSON, где поле ok равно true. Не используй персональные данные." }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "strict_contract_probe",
          strict: true,
          schema: {
            type: "object",
            properties: { ok: { type: "boolean" } },
            required: ["ok"],
            additionalProperties: false,
          },
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`Yandex strict smoke failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string }; finish_reason?: string }> };
  expect(payload.choices?.[0]?.finish_reason).toBe("stop");
  expect(JSON.parse(payload.choices?.[0]?.message?.content ?? "")).toEqual({ ok: true });
});
