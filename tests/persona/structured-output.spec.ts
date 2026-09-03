import { expect, test } from "@playwright/test";

import { runAi } from "../../src/lib/ai/gateway";
import { PROFESSIONAL_ASSESSMENT_JSON_SCHEMA } from "../../src/lib/ai/professional-assessment";

test("OpenAI получает strict JSON Schema, а не только json_object", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousProvider = process.env.AI_PROVIDER;
  const previousFetch = global.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];
  process.env.OPENAI_API_KEY = "test-only-key";
  process.env.AI_PROVIDER = "openai";
  global.fetch = (async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }], usage: {} }), { status: 200 });
  }) as typeof fetch;
  try {
    await runAi({ stage: "extract", system: "system", user: "user", model: "gpt-5.4-mini", jsonSchemaName: "assessment", jsonSchema: PROFESSIONAL_ASSESSMENT_JSON_SCHEMA });
    const requestBody = requestBodies[0];
    expect(requestBody).toBeTruthy();
    const format = requestBody.response_format as { type?: string; json_schema?: { strict?: boolean; name?: string; schema?: unknown } };
    expect(format.type).toBe("json_schema");
    expect(format.json_schema?.strict).toBe(true);
    expect(format.json_schema?.name).toBe("assessment");
    expect(format.json_schema?.schema).toEqual(PROFESSIONAL_ASSESSMENT_JSON_SCHEMA);
    expect(requestBody).toHaveProperty("max_completion_tokens");
    expect(requestBody).not.toHaveProperty("max_tokens");
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
    if (previousProvider === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = previousProvider;
  }
});
