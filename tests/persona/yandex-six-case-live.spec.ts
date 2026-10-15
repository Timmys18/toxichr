import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { buildAdaptedResume } from "../../src/lib/adaptation";
import { aiLiveEnabled } from "../../src/lib/ai/gateway";
import { withCalibrationAiCalls } from "../../src/lib/ai/calibration-audit";
import { runAnalysisPipeline } from "../../src/lib/ai/pipeline";
import type { ProfessionalAssessment } from "../../src/lib/ai/professional-assessment";
import { buildImprovedResume, buildImprovementQuestions } from "../../src/lib/improvement";
import type { PersonaId } from "../../src/lib/personas";
import { assessMatch, assessVacancy } from "../../src/lib/vacancy";

type Case = { id: string; resume: string; vacancy: string; expectedProfession: string; expectedLevel: string };
const artifact = (name: string) => resolve(process.cwd(), "tests", "artifacts", "ai", name);
const manifest = JSON.parse(readFileSync(artifact("provider-comparison-plan.json"), "utf8")) as { caseIds: string[] };
const allCases = JSON.parse(readFileSync(artifact("beta-calibration-cases.json"), "utf8")) as Case[];
const selected = manifest.caseIds.map((id) => {
  const item = allCases.find((entry) => entry.id === id);
  if (!item) throw new Error(`Missing prepared case: ${id}`);
  return item;
});
const personas: PersonaId[] = ["tamara", "lera", "gleb", "vadik"];
const voiceCases = new Set(["senior-backend", "operations-executive"]);
// Authored confirmations for synthetic cases; never inferred from the model.
const confirmations: Record<string, { topic: RegExp; answer: string }> = {
  "junior-ux": { topic: /интервью|сценарии/iu, answer: "Лично составляла порядок вопросов интервью и фиксировала наблюдения после каждой сессии." },
  "senior-backend": { topic: /миграци|восстановлен/iu, answer: "Лично отвечал за план миграции и координировал трёх инженеров." },
  "support-manager": { topic: /маршрутизац|обращен|SLA/iu, answer: "Лично определила правила маршрутизации обращений по сложности и обучила старших смен." },
};
const normalized = (text: string) => text.toLowerCase().replace(/ё/gu, "е").replace(/[^a-zа-я0-9]+/gu, " ").trim();
const quoteIn = (quote: string, source: string) => Boolean(quote.trim()) && normalized(source).includes(normalized(quote));

test.skip(process.env.RUN_YANDEX_SIX_CASES !== "1" || process.env.AI_PROVIDER !== "yandex" || !aiLiveEnabled(), "Explicit Yandex-only synthetic calibration");

for (const [index, item] of selected.entries()) {
  test(`Yandex synthetic service path: ${item.id}`, async () => {
    test.setTimeout(10 * 60_000);
    const outputDir = resolve(process.cwd(), "_diag", "yandex-six-case-live");
    mkdirSync(outputDir, { recursive: true });
    const requests: Array<{ httpStatus: number | null; elapsedMs: number; tokensIn: number; tokensOut: number }> = [];
    const responseContents: string[] = [];
    const originalFetch = global.fetch;
    global.fetch = async (input, init) => {
      const hostname = new URL(input instanceof Request ? input.url : String(input)).hostname;
      if (hostname !== "ai.api.cloud.yandex.net" && hostname !== "llm.api.cloud.yandex.net") throw new Error("Unexpected AI hostname");
      if (requests.length >= 20) throw new Error("Synthetic case request limit reached");
      const record = { httpStatus: null as number | null, elapsedMs: 0, tokensIn: 0, tokensOut: 0 };
      requests.push(record);
      const start = performance.now();
      try {
        const response = await originalFetch(input, init);
        record.httpStatus = response.status;
        if (response.ok) {
          const data = await response.clone().json() as { usage?: { prompt_tokens?: number; completion_tokens?: number }; choices?: Array<{ message?: { content?: string } }> };
          record.tokensIn = data.usage?.prompt_tokens ?? 0;
          record.tokensOut = data.usage?.completion_tokens ?? 0;
          responseContents.push(data.choices?.[0]?.message?.content ?? "");
        }
        return response;
      } finally {
        record.elapsedMs = Math.round(performance.now() - start);
      }
    };

    const issues: string[] = [];
    let stage = "analysis";
    let result: Record<string, unknown> = { id: item.id, provider: "yandex", source: "authored-synthetic", issues };
    try {
      const audited = await withCalibrationAiCalls(async () => {
        try {
          const persona = personas[index % personas.length];
          const analysis = await runAnalysisPipeline({ resumeText: item.resume, personaId: persona });
          const report = analysis.report;
          const professional = report.professionalAssessment as ProfessionalAssessment;
          if (!professional) throw new Error("No professional assessment");
          if (report.generationMeta?.voice?.status !== "generated") issues.push("persona_fallback");
          for (const problem of report.topProblems) if (!quoteIn(problem.quote, item.resume)) issues.push(`ungrounded_problem:${problem.id}`);
          result = { ...result, profession: report.candidateProfile.primaryRole, level: report.candidateProfile.inferredLevel,
            expectedProfession: item.expectedProfession, expectedLevel: item.expectedLevel, score: report.score.total,
            initialPersona: persona, verdict: report.verdict.comment, contentBlocks: report.contentBlocks,
            topProblems: report.topProblems, generationMeta: report.generationMeta };

          stage = "vacancy";
          const vacancy = await assessVacancy(item.vacancy);
          stage = "match";
          const match = await assessMatch(vacancy, professional, item.resume);
          for (const entry of match.matches) {
            if (entry.resumeQuotes.some((quote) => !quoteIn(quote, item.resume))) issues.push(`ungrounded_match:${entry.requirementId}`);
            if (["strong_match", "partial_match"].includes(entry.status) && entry.resumeQuotes.length === 0) issues.push(`unsupported_match:${entry.requirementId}`);
          }
          result = { ...result, vacancyTitle: vacancy.title, requirements: vacancy.requirements,
            decision: match.decision, matches: match.matches };

          stage = "persona";
          if (voiceCases.has(item.id)) {
            const voices: Partial<Record<PersonaId, { verdict: string; blocks: unknown; status: unknown }>> = {
              [persona]: { verdict: report.verdict.comment, blocks: report.contentBlocks, status: report.generationMeta?.voice?.status },
            };
            for (const voice of personas) {
              if (voice === persona) continue;
              const variant = await runAnalysisPipeline({ resumeText: item.resume, personaId: voice, professionalAssessment: professional });
              voices[voice] = { verdict: variant.report.verdict.comment, blocks: variant.report.contentBlocks, status: variant.report.generationMeta?.voice?.status };
              if (variant.report.generationMeta?.voice?.status !== "generated") issues.push(`persona_fallback:${voice}`);
            }
            if (new Set(Object.values(voices).map((voice) => normalized(voice.verdict))).size !== 4) issues.push("duplicate_persona_verdict");
            result = { ...result, voices };
          }

          stage = "rewrite";
          const confirmation = confirmations[item.id];
          if (confirmation) {
            const question = buildImprovementQuestions(report, item.resume).find((entry) => confirmation.topic.test(entry.quote));
            if (!question) issues.push("rewrite_question_missing");
            else {
              const improved = await buildImprovedResume({ report, resumeText: item.resume,
                answers: [{ problemId: question.problemId, answer: confirmation.answer }], personaId: persona });
              if (improved.replacements.length === 0) issues.push("rewrite_not_applied");
              result = { ...result, rewriteQuestion: question, rewrite: improved.replacements, improvedText: improved.improvedText };
            }
          }

          stage = "adaptation";
          const prepared = await buildAdaptedResume({ resumeText: item.resume, vacancy, match, answers: [] });
          if (prepared.changes.length) issues.push("adaptation_without_confirmation");
          result = { ...result, adaptationQuestions: prepared.questions };
          if (confirmation) {
            const question = prepared.questions.find((entry) => confirmation.topic.test(entry.resumeQuote));
            if (question) {
              const adapted = await buildAdaptedResume({ resumeText: item.resume, vacancy, match,
                answers: [{ requirementId: question.requirementId, answer: confirmation.answer }] });
              result = { ...result, adaptation: adapted.changes, adaptedText: adapted.adaptedText };
            }
          }
          return { errorName: null as string | null };
        } catch (error) {
          return { errorName: error instanceof Error ? error.name : "UnknownError" };
        }
      });
      const successfulStages = new Set(audited.calls.filter((call) => call.provider === "yandex" && call.status === "success").map((call) => call.stage));
      for (const required of ["extract", "persona", "vacancy", "vacancy_match"]) if (!successfulStages.has(required)) issues.push(`missing_live_stage:${required}`);
      result = { ...result, stage, errorName: audited.value.errorName, aiCalls: audited.calls, requests,
        estimatedCostRub: Number((requests.reduce((sum, req) => sum + req.tokensIn + req.tokensOut, 0) * 0.0008).toFixed(4)) };
    } finally {
      global.fetch = originalFetch;
      result = { ...result, rawResponses: responseContents };
      writeFileSync(resolve(outputDir, `${item.id}.json`), `${JSON.stringify(result, (key, value) =>
        key === "model" && typeof value === "string" && value.startsWith("gpt://") ? "yandexgpt-5.1" : value, 2)}\n`, "utf8");
    }
    console.log(JSON.stringify({ caseId: item.id, stage, errorName: result.errorName,
      issues, requests: requests.length, estimatedCostRub: result.estimatedCostRub }));
    expect(result.errorName, `Synthetic case ${item.id} failed at ${stage}; see local _diag result`).toBeNull();
    expect(issues, `Synthetic case ${item.id} has blockers; see local _diag result`).toEqual([]);
  });
}
