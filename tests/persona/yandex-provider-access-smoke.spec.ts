import { expect, test } from "@playwright/test";
import { runAi } from "../../src/lib/ai/gateway";

test("Yandex access and JSON object, independently of strict schema", async () => {
  test.skip(process.env.RUN_YANDEX_ACCESS_SMOKE !== "1", "Requires explicit authorization and local credentials");
  expect(process.env.AI_PROVIDER).toBe("yandex");
  expect(process.env.YANDEX_AI_API_KEY?.trim()).toBeTruthy();
  expect(process.env.YANDEX_AI_FOLDER_ID?.trim()).toBeTruthy();
  const originalFetch = global.fetch;
  let requests = 0;
  let httpStatus: number | null = null;
  let hostname: string | null = null;
  const startedAt = new Date().toISOString();
  const start = performance.now();
  // Observe the real request, without replacing its response or logging credentials.
  global.fetch = async (input, init) => {
    if (++requests !== 1) throw new Error("Access smoke permits only one request");
    hostname = new URL(input instanceof Request ? input.url : String(input)).hostname;
    const response = await originalFetch(input, init);
    httpStatus = response.status;
    return response;
  };
  try {
    const result = await runAi({
      stage: "extract", system: "Верни только JSON-объект. Это синтетическая проверка подключения.",
      user: 'Верни ровно {"ok":true}.', temperature: 0, maxTokens: 32, timeoutMs: 20_000,
    });
    expect(JSON.parse(result.content)).toEqual({ ok: true });
    expect(requests).toBe(1);
    console.log(JSON.stringify({ syntheticAccess: "passed", startedAt, elapsedMs: Math.round((performance.now() - start) * 100) / 100, hostname, httpStatus, requests, response: { ok: true }, provider: result.provider, modelName: "yandexgpt-5.1", tokensIn: result.tokensIn, tokensOut: result.tokensOut, estimatedCost: result.cost, costSource: "local-token-rate-estimate-not-api-billing" }));
  } catch {
    // Do not let a provider error body expose identifiers in the test report.
    console.log(JSON.stringify({ syntheticAccess: "failed", startedAt, elapsedMs: Math.round((performance.now() - start) * 100) / 100, hostname, httpStatus, requests }));
    throw new Error("Yandex access smoke failed; see safe transport/status diagnostics above");
  } finally {
    global.fetch = originalFetch;
  }
});
