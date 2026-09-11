import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { aiLiveEnabled } from "../../src/lib/ai/gateway";
import { runAnalysisPipeline } from "../../src/lib/ai/pipeline";
import type { ProfessionalAssessment } from "../../src/lib/ai/professional-assessment";
import type { PersonaId } from "../../src/lib/personas";
import { assessMatch, assessVacancy } from "../../src/lib/vacancy";

type CalibrationCase = {
  id: string;
  segment: string;
  expectedProfession: string;
  expectedLevel: string;
  resume: string;
  vacancy: string;
};

type CalibrationResult = {
  id: string;
  segment: string;
  expectedProfession: string;
  expectedLevel: string;
  actualProfession?: string;
  actualLevel?: string;
  score?: number;
  persona?: PersonaId;
  verdict?: string;
  vacancyTitle?: string;
  decision?: string;
  statusCounts?: Record<string, number>;
  voiceSamples?: Partial<Record<PersonaId, string>>;
  issues: string[];
  error?: string;
};

const artifact = (name: string) => resolve(process.cwd(), "tests", "artifacts", "ai", name);
const cases = JSON.parse(readFileSync(artifact("beta-calibration-cases.json"), "utf8")) as CalibrationCase[];
const output = artifact("beta-calibration-results.json");
const personas = ["tamara", "lera", "gleb", "vadik"] as const;
const voiceCases = new Set(["senior-backend", "operations-executive"]);

function normalized(value: string) {
  return value.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/g, " ").trim();
}

function quoteIsGrounded(quote: string, source: string) {
  return normalized(source).includes(normalized(quote));
}

function persist(results: CalibrationResult[]) {
  writeFileSync(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), cases: results }, null, 2)}\n`, "utf8");
}

test.skip(process.env.RUN_LIVE_AI_ACCEPTANCE !== "1" || !aiLiveEnabled(), "Живая beta-калибровка запускается только явно.");
test("15 профессий: professional core, vacancy, match и различимость голосов", async () => {
  test.setTimeout(45 * 60_000);
  expect(cases.length).toBeGreaterThanOrEqual(15);
  expect(cases.length).toBeLessThanOrEqual(30);
  const results: CalibrationResult[] = [];

  for (const [index, item] of cases.entries()) {
    const persona = personas[index % personas.length];
    const current: CalibrationResult = {
      id: item.id,
      segment: item.segment,
      expectedProfession: item.expectedProfession,
      expectedLevel: item.expectedLevel,
      persona,
      issues: [],
    };
    results.push(current);
    try {
      const analysis = await runAnalysisPipeline({ resumeText: item.resume, personaId: persona });
      const report = analysis.report;
      const professional = report.professionalAssessment as ProfessionalAssessment | undefined;
      current.actualProfession = report.candidateProfile.primaryRole;
      current.actualLevel = report.candidateProfile.inferredLevel;
      current.score = report.score.total;
      current.verdict = report.verdict.comment;

      if (!normalized(current.actualProfession).includes(normalized(item.expectedProfession))) {
        current.issues.push("плохой профессиональный вывод: ожидаемая профессия не распознана явно");
      }
      if (!normalized(current.actualLevel).includes(normalized(item.expectedLevel))) {
        current.issues.push("плохой профессиональный вывод: ожидаемый уровень не распознан явно");
      }
      for (const problem of report.topProblems) {
        if (!quoteIsGrounded(problem.quote, item.resume)) current.issues.push(`hallucination / grounding problem: ${problem.id}`);
      }

      if (!professional) throw new Error("Professional Core отсутствует в отчёте");
      const vacancy = await assessVacancy(item.vacancy);
      const match = await assessMatch(vacancy, professional);
      current.vacancyTitle = vacancy.title;
      current.decision = match.decision.code;
      current.statusCounts = Object.fromEntries(
        ["strong_match", "partial_match", "hidden_match", "unknown", "gap"].map((status) => [status, match.matches.filter((entry) => entry.status === status).length]),
      );
      for (const entry of match.matches) {
        if (entry.resumeQuotes.some((quote) => !quoteIsGrounded(quote, item.resume))) current.issues.push(`hallucination / grounding problem: match ${entry.requirementId}`);
        if ((entry.status === "strong_match" || entry.status === "partial_match") && entry.resumeQuotes.length === 0) current.issues.push(`неправильный match: ${entry.status} без цитаты ${entry.requirementId}`);
        if ((entry.status === "unknown" || entry.status === "gap") && entry.resumeQuotes.length > 0) current.issues.push(`неправильный match: ${entry.status} при наличии цитаты ${entry.requirementId}`);
      }

      if (voiceCases.has(item.id)) {
        current.voiceSamples = { [persona]: report.verdict.comment };
        for (const voice of personas) {
          if (voice === persona) continue;
          const variant = await runAnalysisPipeline({ resumeText: item.resume, personaId: voice, professionalAssessment: professional });
          current.voiceSamples[voice] = variant.report.verdict.comment;
        }
        if (new Set(Object.values(current.voiceSamples).map((value) => normalized(value ?? ""))).size !== 4) {
          current.issues.push("неправильный persona voice: голоса совпали");
        }
      }
    } catch (error) {
      current.error = error instanceof Error ? error.message : String(error);
      current.issues.push("технический сбой калибровки");
    }
    persist(results);
  }

  expect(results.filter((item) => item.error), JSON.stringify(results, null, 2)).toEqual([]);
});
