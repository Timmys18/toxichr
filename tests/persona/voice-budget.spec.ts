import { expect, test } from "@playwright/test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { knownManifestCost, priorVoiceCost } from "./voice-budget";

test("charges cached tokens, cache writes and completion by model", () => {
  const cost = knownManifestCost({ calls: 1, usage: [{ model: "gpt-6.1-sol", usage: { prompt_tokens: 1000, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 200, cache_write_tokens: 400 } } }] });
  expect(cost).toBeCloseTo((800 * 2 + 200 * 0.1 + 400 * 2 * 0.25 + 100 * 10) / 1_000_000, 9);
});
test("refuses to estimate if any previous call has unknown cost", () => {
  expect(() => knownManifestCost({ calls: 1, usage: [] })).toThrow();
  expect(() => knownManifestCost({ calls: 1, usage: [{ model: "gpt-6.1-sol", usage: null }] })).toThrow();
});
test("a missing manifest blocks future budget reconciliation", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "toxichr-budget-test-"));
  try {
    await mkdir(path.join(root, "interrupted"));
    await expect(priorVoiceCost(root)).rejects.toThrow("нет отчёта о расходах");
  } finally { await rm(root, { recursive: true }); }
});
test("reserves a specified interrupted run without treating it as known spending", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "toxichr-budget-test-"));
  try {
    await mkdir(path.join(root, "interrupted"));
    expect(await priorVoiceCost(root, { interrupted: 1 })).toBe(1);
    await mkdir(path.join(root, "another"));
    await expect(priorVoiceCost(root, { interrupted: 1 })).rejects.toThrow("нет отчёта о расходах");
  } finally { await rm(root, { recursive: true }); }
});
