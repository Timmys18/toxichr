import { expect, test } from "@playwright/test";
import { AiConfigError, aiLiveEnabled, runAi } from "../../src/lib/ai/gateway";

const envNames = ["AI_PROVIDER", "YANDEX_AI_API_KEY", "YANDEX_AI_FOLDER_ID", "YANDEX_AI_MODEL"] as const;

test("Yandex provider requires both key and folder without making a request", async () => {
  const saved = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => { called = true; throw new Error("must not call"); };
  process.env.AI_PROVIDER = "yandex";
  process.env.YANDEX_AI_API_KEY = "";
  process.env.YANDEX_AI_FOLDER_ID = "folder-test";
  try {
    expect(aiLiveEnabled()).toBe(false);
    await expect(runAi({ stage: "extract", system: "s", user: "u" })).rejects.toBeInstanceOf(AiConfigError);
    expect(called).toBe(false);
  } finally {
    global.fetch = originalFetch;
    for (const name of envNames) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
});

test("Yandex provider uses isolated credentials, model and strict schema", async () => {
  const saved = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  const originalFetch = global.fetch;
  let captured: { url?: string; init?: RequestInit } = {};
  global.fetch = async (url, init) => {
    captured = { url: String(url), init };
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 12, completion_tokens: 4 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  process.env.AI_PROVIDER = "yandex";
  process.env.YANDEX_AI_API_KEY = "test-secret";
  process.env.YANDEX_AI_FOLDER_ID = "folder-test";
  process.env.YANDEX_AI_MODEL = "gpt://folder-test/yandexgpt/rc";
  try {
    const response = await runAi({
      stage: "extract",
      system: "system",
      user: "user",
      model: "gpt-5-mini",
      jsonSchemaName: "probe",
      jsonSchema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
    });
    const headers = new Headers(captured.init?.headers);
    const body = JSON.parse(String(captured.init?.body));
    expect(captured.url).toBe("https://ai.api.cloud.yandex.net/v1/chat/completions");
    expect(headers.get("Authorization")).toBe("Api-Key test-secret");
    expect(headers.get("OpenAI-Project")).toBe("folder-test");
    expect(headers.get("x-data-logging-enabled")).toBe("false");
    expect(body.model).toBe("gpt://folder-test/yandexgpt/rc");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(response).toMatchObject({ provider: "yandex", content: '{"ok":true}', tokensIn: 12, tokensOut: 4 });
  } finally {
    global.fetch = originalFetch;
    for (const name of envNames) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
});
