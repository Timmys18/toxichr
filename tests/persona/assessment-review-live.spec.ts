import { test, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import cases from "../fixtures/voice-release-cases.json";
import { reviewAssessment } from "../../src/lib/ai/assessment-review";
import { priorVoiceCost } from "./voice-budget";

test("bounded semantic reviewer regression — synthetic data only", async () => {
  test.skip(process.env.RUN_SEMANTIC_REGRESSION !== "1", "Live test disabled");
  const seedPath = process.env.SEMANTIC_SEED_REPORT;
  if (!seedPath) throw new Error("Seed report required");
  const seed = JSON.parse(await readFile(seedPath, "utf8"));
  const sample = cases.cases.find(item => item.id === seed.caseId);
  if (!sample || !seed.result?.report?.professionalAssessment) throw new Error("A valid synthetic seed is required");
  const before = seed.result.report.professionalAssessment;
  const initial = Math.max((await priorVoiceCost()) * 1.02, Number(process.env.VOICE_PREVIOUS_RESERVED_USD));
  if (!Number.isFinite(initial) || initial < 0 || initial >= 0.95) throw new Error("Previous spending reserve required");
  const fetchBefore = globalThis.fetch;
  let calls = 0, reservation = 0;
  const usage: unknown[] = [];
  globalThis.fetch = async (...args) => {
    if (calls) throw new Error("Only one review request permitted");
    const body = args[1]?.body;
    if (typeof body !== "string") throw new Error("Unpriced request");
    const payload = JSON.parse(body);
    const rates: Record<string, [number, number]> = { "gpt-5.4-mini": [0.75, 4.5], "gpt-6.1-sol": [2.5, 10] };
    const rate = rates[payload.model];
    if (!rate || !Number.isInteger(payload.max_completion_tokens)) throw new Error("Unpriced model or output");
    reservation = (Buffer.byteLength(body, "utf8") * rate[0] + payload.max_completion_tokens * rate[1]) / 1_000_000;
    if (initial + reservation > 0.95) throw new Error("Budget bound reached");
    calls++;
    const response = await fetchBefore(...args);
    try { const data = await response.clone().json(); usage.push({ model: payload.model, status: response.status, usage: data.usage ?? null }); } catch { usage.push({ model: payload.model, status: response.status, usage: null }); }
    return response;
  };
  const dir = `artifacts/voice-release/${Date.now()}-${randomUUID().slice(0, 8)}`;
  await mkdir(dir, { recursive: true });
  try {
    const result = await reviewAssessment(sample.text, before);
    await writeFile(`${dir}/review.json`, JSON.stringify({ caseId: sample.id, before, after: result.assessment, model: result.model, raw: result.content }, null, 2));
    expect(result.assessment.strengths.length).toBeGreaterThan(0);
  } finally {
    globalThis.fetch = fetchBefore;
    await writeFile(`${dir}/manifest.json`, JSON.stringify({ calls, reservedUsd: initial + reservation, usage, literaryAcceptance: "not-applicable" }, null, 2));
    console.log(`Semantic regression saved: ${dir}; external calls: ${calls}.`);
  }
});
