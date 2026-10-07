import { expect, test } from "@playwright/test";
import { runAi } from "../../src/lib/ai/gateway";

test("Yandex access and JSON object, independently of strict schema", async () => {
  test.skip(process.env.RUN_YANDEX_ACCESS_SMOKE !== "1", "Requires explicit authorization and local credentials");
  expect(process.env.AI_PROVIDER).toBe("yandex");
  expect(process.env.YANDEX_AI_API_KEY?.trim()).toBeTruthy();
  expect(process.env.YANDEX_AI_FOLDER_ID?.trim()).toBeTruthy();
  const result = await runAi({
    stage: "extract", system: "Верни только JSON-объект. Это синтетическая проверка подключения.",
    user: 'Верни ровно {"ok":true}.', temperature: 0, maxTokens: 32, timeoutMs: 20_000,
  });
  expect(JSON.parse(result.content)).toEqual({ ok: true });
  console.log(JSON.stringify({ syntheticAccess: "passed", provider: result.provider, model: result.model, tokensIn: result.tokensIn, tokensOut: result.tokensOut, cost: result.cost }));
});
