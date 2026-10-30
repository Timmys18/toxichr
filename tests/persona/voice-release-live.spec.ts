import { test, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import cases from "../fixtures/voice-release-cases.json";
import { runAnalysisPipeline } from "../../src/lib/ai/pipeline";
import { aiMockEnabled } from "../../src/lib/ai/gateway";
import type { PersonaId } from "../../src/lib/personas";
import { priorVoiceCost } from "./voice-budget";
import { reviewFinalDraft } from "../../src/lib/ai/final-review";

// Explicitly enabled, synthetic inputs only. One bounded batch, never part of CI.
test("bounded voice acceptance batch — artifacts require human review", async () => {
  test.skip(process.env.RUN_VOICE_RELEASE !== "1", "Live generation explicitly disabled");
  const selectedIds = (process.env.VOICE_CASE_IDS ?? "R01").split(",");
  const selected = cases.cases.filter(c => selectedIds.includes(c.id));
  expect(selected.length).toBe(selectedIds.length);
  const repetitions = Number(process.env.VOICE_REPETITIONS ?? "1");
  const maxCalls = Number(process.env.VOICE_MAX_CALLS);
  const personaIds = (process.env.VOICE_PERSONAS ?? "tamara,lera,gleb,vadik").split(",");
  expect(personaIds.every(id => ["tamara", "lera", "gleb", "vadik"].includes(id))).toBeTruthy();
  expect(Number.isInteger(repetitions) && repetitions >= 1 && repetitions <= 3).toBeTruthy();
  expect(Number.isInteger(maxCalls) && maxCalls >= 1 && maxCalls <= 60).toBeTruthy();
  expect(aiMockEnabled()).toBe(false);
  const dir = `artifacts/voice-release/${Date.now()}-${randomUUID().slice(0, 8)}`;
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const dirty = Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim());
  const originalFetch = globalThis.fetch;
  let calls = 0;
  // One historical interrupted batch lacks a manifest; reserve $1 for it,
  // without inventing actual usage. Any other missing manifest still blocks.
  const ledgerUsd = await priorVoiceCost("artifacts/voice-release", { "1793340823663-02f0fb90": 1 });
  let reservedUsd = Math.max(ledgerUsd * 1.02, Number(process.env.VOICE_PREVIOUS_RESERVED_USD ?? "0"));
  expect(Number.isFinite(reservedUsd) && reservedUsd >= 0 && reservedUsd < 4.75).toBeTruthy();
  await mkdir(dir, { recursive: true });
  const usage: unknown[] = [];
  const syntheticResponses: unknown[] = [];
  globalThis.fetch = async (...args) => {
    if (calls >= maxCalls) throw new Error("VOICE_MAX_CALLS reached; no further network requests");
    const body = args[1]?.body;
    if (typeof body !== "string") throw new Error("Unpriced request blocked");
    const payload = JSON.parse(body);
    const rates: Record<string, [number, number]> = { "gpt-6.1-sol": [2, 10], "gpt-6.1-terra": [1, 5], "gpt-5.4-mini": [0.75, 4.5], "gpt-5-mini": [0.25, 2], "gpt-5-nano": [0.05, 0.4] };
    const rate = rates[payload.model];
    if (!rate) throw new Error("Unpriced model blocked");
    const outputLimit = payload.max_completion_tokens;
    if (!Number.isInteger(outputLimit) || outputLimit <= 0) throw new Error("Unbounded output blocked");
    // Conservative bound: each serialized input byte could be a token; no
    // cache discount and full max output are reserved, including failures.
    const reservation = (Buffer.byteLength(body, "utf8") * rate[0] * (payload.model.startsWith("gpt-6") ? 1.25 : 1) + outputLimit * rate[1]) / 1_000_000;
    if (reservedUsd + reservation > 4.75) throw new Error("USD budget reservation reached; no further requests");
    reservedUsd += reservation;
    calls++;
    const response = await originalFetch(...args);
    try { const data = await response.clone().json(); usage.push({ model: payload.model, status: response.status, usage: data.usage ?? null }); if (process.env.VOICE_RECORD_SYNTHETIC_RESPONSES === "true") syntheticResponses.push({ model: payload.model, status: response.status, content: data.choices?.[0]?.message?.content ?? null }); } catch { usage.push({ model: payload.model, status: response.status, usage: null }); }
    return response;
  };
  const manifest: unknown[] = [];
  const blind: unknown[] = [];
  const sharedAssessments = new Map<string, NonNullable<Awaited<ReturnType<typeof runAnalysisPipeline>>["report"]["professionalAssessment"]>>();
  const reviewedAssessments = new Set<string>();
  if (process.env.VOICE_SEED_REPORT) {
    const seed = JSON.parse(await readFile(process.env.VOICE_SEED_REPORT, "utf8"));
    if (!selectedIds.includes(seed.caseId) || !seed.result?.report?.professionalAssessment) throw new Error("Seed report must match a selected synthetic case");
    sharedAssessments.set(seed.caseId, seed.result.report.professionalAssessment);
    if (process.env.VOICE_SEED_IS_REVIEWED === "true") reviewedAssessments.add(seed.caseId);
  }
  test.setTimeout(Math.min(maxCalls * 45_000 + 10_000, 1_800_000));
  try {
    if (process.env.VOICE_FINAL_REVIEW_REGRESSION === "true") {
      const resume = "Координатор смен подготовила журнал заявок. Следующая смена видит статус и ответственного.";
      const base = { verdict: { title: "Передача смены", comment: "В журнале следующая смена видит статус заявки и ответственного.", findingIds: ["S01"] }, contentBlocks: [{ type: "strength" as const, findingIds: ["S01"], content: "Смена видит статус заявки и ответственного в журнале." }, { type: "summary" as const, findingIds: [], content: "Описан конкретный порядок передачи информации." }], priorities: [{ findingIds: ["S01"], action: "Сохраните описание журнала и его применения." }], shareLines: ["Статус и ответственный доступны смене."] };
      const supported = await reviewFinalDraft(resume, base);
      manifest.push({ caseId: "final-review-supported", supported: supported.review.supported });
      const fabricated = { ...base, verdict: { ...base.verdict, comment: "Ты заменила устные доклады журналом: следующая смена видит статус заявки и ответственного." } };
      const rejected = await reviewFinalDraft(resume, fabricated);
      manifest.push({ caseId: "final-review-fabricated", supported: rejected.review.supported });
      expect(supported.review.supported).toBe(true);
      expect(rejected.review.supported).toBe(false);
      return;
    }
    for (const item of selected) for (let repeat = 0; repeat < repetitions; repeat++) {
      for (const personaId of personaIds as PersonaId[]) {
        if (calls >= maxCalls) throw new Error("Batch stopped at request cap");
        const id = randomUUID();
        const started = Date.now();
        // Reuse the first verified assessment for all voices in the same batch.
        const previousReview = process.env.AI_SEMANTIC_REVIEW;
        if (process.env.AI_INDEPENDENT_PERSPECTIVE !== "true" && reviewedAssessments.has(item.id)) process.env.AI_SEMANTIC_REVIEW = "false";
        let result: Awaited<ReturnType<typeof runAnalysisPipeline>>;
        try { result = await runAnalysisPipeline({ resumeText: item.text, personaId, professionalAssessment: sharedAssessments.get(item.id) }); }
        finally { if (previousReview === undefined) delete process.env.AI_SEMANTIC_REVIEW; else process.env.AI_SEMANTIC_REVIEW = previousReview; }
        if (result.report.professionalAssessment) sharedAssessments.set(item.id, result.report.professionalAssessment);
        if (result.report.generationMeta?.stages.some(stage => stage.name === "assessment-semantic-review")) reviewedAssessments.add(item.id);
        // Save before asserting, including failures and limited output.
        await writeFile(`${dir}/${id}.json`, JSON.stringify({ id, commit, dirty, caseId: item.id, personaId, repeat, latencyMs: Date.now() - started, result }, null, 2));
        manifest.push({ id, caseId: item.id, personaId, repeat, status: result.report.generationMeta?.voice?.status });
        blind.push({ id, source: item.text, title: result.report.verdict.title, lead: result.report.verdict.comment, blocks: result.report.contentBlocks });
        expect(result.provider).not.toBe("mock");
        expect(result.report.generationMeta?.voice?.status).toBe("generated");
        if (process.env.AI_VOICE_POLISH === "true") expect(result.report.generationMeta?.stages.map(stage => stage.name)).toContain("persona-voice-polish");
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
    await writeFile(`${dir}/manifest.json`, JSON.stringify({ commit, dirty, calls, maxCalls, reservedUsd, usage, literaryAcceptance: "pending-human-review", entries: manifest }, null, 2));
    await writeFile(`${dir}/blind.json`, JSON.stringify(blind.sort((a, b) => (a as {id:string}).id.localeCompare((b as {id:string}).id)), null, 2));
    if (process.env.VOICE_RECORD_SYNTHETIC_RESPONSES === "true") await writeFile(`${dir}/synthetic-responses.json`, JSON.stringify(syntheticResponses, null, 2));
    console.log(`Voice batch saved: ${dir}; external calls: ${calls}/${maxCalls}. Literary acceptance remains pending.`);
  }
});
