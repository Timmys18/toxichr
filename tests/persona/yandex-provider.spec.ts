import { expect, test } from "@playwright/test";
import { AiConfigError, aiLiveEnabled, runAi, yandexBaseUrl } from "../../src/lib/ai/gateway";

const envNames = ["AI_PROVIDER", "YANDEX_AI_API_KEY", "YANDEX_AI_FOLDER_ID", "YANDEX_AI_BASE_URL"] as const;

for (const base of [undefined, "https://ai.api.cloud.yandex.net/v1", "https://llm.api.cloud.yandex.net/v1/"]) {
  test(`Yandex endpoint is explicit: ${base ?? "default"}`, async () => {
    const saved = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
    const originalFetch = global.fetch;
    let capturedUrl = "";
    global.fetch = async url => {
      capturedUrl = String(url);
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }] }));
    };
    process.env.AI_PROVIDER = "yandex";
    process.env.YANDEX_AI_API_KEY = "synthetic-test-key";
    process.env.YANDEX_AI_FOLDER_ID = "synthetic-folder";
    if (base === undefined) delete process.env.YANDEX_AI_BASE_URL;
    else process.env.YANDEX_AI_BASE_URL = base;
    try {
      await runAi({ stage: "extract", system: "s", user: "u" });
      expect(capturedUrl).toBe(`${(base ?? "https://ai.api.cloud.yandex.net/v1").replace(/\/+$/, "")}/chat/completions`);
    } finally {
      global.fetch = originalFetch;
      for (const name of envNames) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; }
    }
  });
}

for (const base of ["http://llm.api.cloud.yandex.net/v1", "https://example.com/v1", "https://ai.api.cloud.yandex.net.evil.test/v1", "https://secret@llm.api.cloud.yandex.net/v1", "https://llm.api.cloud.yandex.net/v1?redirect=evil", "https://llm.api.cloud.yandex.net:444/v1"]) {
  test(`Yandex rejects an unapproved endpoint before sending a secret: ${base}`, async () => {
    const saved = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
    const originalFetch = global.fetch;
    let called = false;
    global.fetch = async () => { called = true; throw new Error("must not call"); };
    process.env.AI_PROVIDER = "yandex";
    process.env.YANDEX_AI_API_KEY = "synthetic-test-key";
    process.env.YANDEX_AI_FOLDER_ID = "synthetic-folder";
    process.env.YANDEX_AI_BASE_URL = base;
    try {
      expect(yandexBaseUrl).toThrow(AiConfigError);
      await expect(runAi({ stage: "extract", system: "s", user: "u" })).rejects.toBeInstanceOf(AiConfigError);
      expect(called).toBe(false);
    } finally {
      global.fetch = originalFetch;
      for (const name of envNames) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; }
    }
  });
}

test("unknown provider fails closed instead of falling back to OpenAI", async () => {
  const saved = process.env.AI_PROVIDER;
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => { called = true; throw new Error("must not call"); };
  process.env.AI_PROVIDER = "yadnex";
  try {
    expect(() => aiLiveEnabled()).toThrow(AiConfigError);
    await expect(runAi({ stage: "extract", system: "s", user: "u" })).rejects.toBeInstanceOf(AiConfigError);
    expect(called).toBe(false);
  } finally {
    global.fetch = originalFetch;
    if (saved === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = saved;
  }
});

test("Yandex provider requires both key and folder without making a request", async () => {
  const saved = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => { called = true; throw new Error("must not call"); };
  process.env.AI_PROVIDER = "yandex";
  process.env.YANDEX_AI_API_KEY = "";
  process.env.YANDEX_AI_FOLDER_ID = "folder-test";
  delete process.env.YANDEX_AI_BASE_URL;
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

test("Yandex provider uses isolated credentials, pinned model and documented schema", async () => {
  const saved = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  const originalFetch = global.fetch;
  let captured: { url?: string; init?: RequestInit } = {};
  global.fetch = async (url, init) => {
    captured = { url: String(url), init };
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }],
      usage: { prompt_tokens: 12, completion_tokens: 4 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  process.env.AI_PROVIDER = "yandex";
  process.env.YANDEX_AI_API_KEY = "test-secret";
  process.env.YANDEX_AI_FOLDER_ID = "folder-test";
  delete process.env.YANDEX_AI_BASE_URL;
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
    expect(body.model).toBe("gpt://folder-test/yandexgpt-5.1");
    expect(body.response_format.json_schema.strict).toBe(false);
    expect(response).toMatchObject({
      provider: "yandex",
      content: '{"ok":true}',
      tokensIn: 12,
      tokensOut: 4,
      cost: { amount: 0.0128, currency: "RUB" },
    });
  } finally {
    global.fetch = originalFetch;
    for (const name of envNames) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
});

for (const sample of [
  { name: "empty response", content: "", finishReason: "stop", message: "пустой ответ" },
  { name: "truncated response", content: '{"ok":', finishReason: "length", message: "причиной length" },
  { name: "invalid JSON", content: "not-json", finishReason: "stop", message: "невалидный JSON" },
]) {
  test(`Yandex provider rejects ${sample.name}`, async () => {
    const saved = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
    const originalFetch = global.fetch;
    global.fetch = async () => new Response(JSON.stringify({
      choices: [{ message: { content: sample.content }, finish_reason: sample.finishReason }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
    process.env.AI_PROVIDER = "yandex";
    process.env.YANDEX_AI_API_KEY = "test-secret";
    process.env.YANDEX_AI_FOLDER_ID = "folder-test";
    try {
      await expect(runAi({ stage: "extract", system: "s", user: "u" })).rejects.toThrow(sample.message);
    } finally {
      global.fetch = originalFetch;
      for (const name of envNames) {
        if (saved[name] === undefined) delete process.env[name];
        else process.env[name] = saved[name];
      }
    }
  });
}
