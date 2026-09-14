import "dotenv/config";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { aiLiveEnabled } from "../../src/lib/ai/gateway";
import { withCalibrationAiCalls } from "../../src/lib/ai/calibration-audit";
import { runAnalysisPipeline } from "../../src/lib/ai/pipeline";
import type { ProfessionalAssessment } from "../../src/lib/ai/professional-assessment";
import type { PersonaId } from "../../src/lib/personas";
import { assessMatch, assessVacancy } from "../../src/lib/vacancy";
import { MATCH_ASSESSMENT_VERSION, VACANCY_ASSESSMENT_VERSION } from "../../src/lib/vacancy";
import { PROFESSIONAL_CORE_VERSION } from "../../src/lib/ai/prompts/professional-core";
import { PERSONA_BIBLE_VERSION } from "../../src/lib/ai/prompts/persona-bibles";
import { VACANCY_RULES_VERSION, MATCH_RULES_VERSION } from "../../src/lib/vacancy";
import { buildImprovedResume, IMPROVEMENT_RULES_VERSION } from "../../src/lib/improvement";
import { calibrationProvenance } from "./calibration-provenance";

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
  professionalSummary?: string;
  vacancySummary?: string;
  matchItems?: Array<{ requirement: string; priority: string; status: string; explanation: string; evidenceIds: string[] }>;
  provider?: string;
  aiCalls?: number;
  voiceSamples?: Partial<Record<PersonaId, string>>;
  evidence?: ProfessionalAssessment;
  rewriteClarifications?: unknown;
  voiceDetails?: Partial<Record<PersonaId, unknown>>;
  issues: string[];
  error?: string;
};

const artifact = (name: string) => resolve(process.cwd(), "tests", "artifacts", "ai", name);
const cases = JSON.parse(readFileSync(artifact("beta-calibration-cases.json"), "utf8")) as CalibrationCase[];
const selectedIds = process.env.CALIBRATION_CASE_IDS?.split(",").filter(Boolean);
const output = artifact(selectedIds ? "beta-calibration-targeted-results.json" : "beta-calibration-results.json");
const journal = artifact("beta-calibration-run-journal.jsonl");
const personas = ["tamara", "lera", "gleb", "vadik"] as const;
const voiceCases = new Set(["senior-backend", "operations-executive"]);
const resumedRun = process.env.CALIBRATION_RESUME === "1"
  ? JSON.parse(readFileSync(output, "utf8")) as { runId: string; sourceSha: string; codeWorktreeDirty: boolean; cases: CalibrationResult[] }
  : null;
const runId = resumedRun?.runId ?? randomUUID();
const provenance = resumedRun
  ? { sourceSha: resumedRun.sourceSha, codeWorktreeDirty: resumedRun.codeWorktreeDirty }
  : calibrationProvenance();

function normalized(value: string) {
  return value.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/g, " ").trim();
}

function quoteIsGrounded(quote: string, source: string) {
  return normalized(source).includes(normalized(quote));
}

function professionMatches(actual: string, expected: string) {
  const ignored = new Set(["по", "и", "в", "на"]);
  const actualWords = normalized(actual).split(" ");
  return normalized(expected).split(" ").filter((word) => !ignored.has(word)).every((word) =>
    actualWords.some((actualWord) => actualWord === word || (word.length >= 6 && actualWord.startsWith(word.slice(0, 6)))),
  );
}

function levelMatches(actual: string, expected: string) {
  const value = normalized(actual);
  const aliases: Record<string, RegExp> = {
    junior: /junior|младш|стажер/,
    middle: /middle|средн|специалист/,
    senior: /senior|старш|ведущ/,
    директор: /директор|дирекц/,
    руководитель: /руковод|директор|дирекц|управлен/,
    специалист: /специалист|middle|старш|ведущ/,
  };
  return aliases[expected]?.test(value) ?? value.includes(normalized(expected));
}

function persist(results: CalibrationResult[]) {
  const content = `${JSON.stringify({ runId, ...provenance, generatedAt: new Date().toISOString(), cases: results }, null, 2)}\n`;
  writeFileSync(output, content, "utf8");
  mkdirSync(artifact("calibration-runs"), { recursive: true });
  writeFileSync(artifact(`calibration-runs/${runId}.json`), content, "utf8");
}

test.skip(process.env.RUN_LIVE_AI_ACCEPTANCE !== "1" || !aiLiveEnabled(), "Живая beta-калибровка запускается только явно.");
test("15–30 профессий: professional core, vacancy, match и различимость голосов", async () => {
  test.setTimeout(3 * 60 * 60_000);
  expect(cases.length).toBeGreaterThanOrEqual(15);
  expect(cases.length).toBeLessThanOrEqual(30);
  const resume = process.env.CALIBRATION_RESUME === "1";
  const previous = resume
    ? new Map<string, CalibrationResult>((resumedRun?.cases ?? []).map((item) => [item.id, item]))
    : new Map<string, CalibrationResult>();
  const results: CalibrationResult[] = [];

  for (const [index, item] of cases.entries()) {
    if (selectedIds && !selectedIds.includes(item.id)) continue;
    const completed = previous.get(item.id);
    if (completed && !completed.error) {
      completed.issues = completed.issues.filter((issue) => !issue.startsWith("плохой профессиональный вывод:") && !issue.startsWith("неправильный match: gap"));
      if (completed.actualProfession && !professionMatches(completed.actualProfession, item.expectedProfession)) completed.issues.push("плохой профессиональный вывод: ожидаемая профессия не распознана явно");
      if (completed.actualLevel && !levelMatches(completed.actualLevel, item.expectedLevel)) completed.issues.push("плохой профессиональный вывод: ожидаемый уровень не распознан явно");
      results.push(completed);
      continue;
    }
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
    const audited = await withCalibrationAiCalls(async () => {
    try {
      const analysis = await runAnalysisPipeline({ resumeText: item.resume, personaId: persona });
      current.provider = analysis.provider;
      const report = analysis.report;
      const professional = report.professionalAssessment as ProfessionalAssessment | undefined;
      current.actualProfession = report.candidateProfile.primaryRole;
      current.actualLevel = report.candidateProfile.inferredLevel;
      current.score = report.score.total;
      current.verdict = report.verdict.comment;
      current.professionalSummary = professional?.professionalAssessment.overallImpression;

      if (!professionMatches(current.actualProfession, item.expectedProfession)) {
        current.issues.push("плохой профессиональный вывод: ожидаемая профессия не распознана явно");
      }
      if (!levelMatches(current.actualLevel, item.expectedLevel)) {
        current.issues.push("плохой профессиональный вывод: ожидаемый уровень не распознан явно");
      }
      for (const problem of report.topProblems) {
        if (!quoteIsGrounded(problem.quote, item.resume)) current.issues.push(`hallucination / grounding problem: ${problem.id}`);
      }

      if (!professional) throw new Error("Professional Core отсутствует в отчёте");
      current.evidence = professional;
      const unchanged = await buildImprovedResume({ report, resumeText: item.resume, answers: [], personaId: persona });
      current.rewriteClarifications = unchanged.clarificationQuestions;
      const vacancy = await assessVacancy(item.vacancy);
      const match = await assessMatch(vacancy, professional);
      current.vacancyTitle = vacancy.title;
      current.vacancySummary = vacancy.roleReality;
      current.decision = match.decision.code;
      current.matchItems = match.matches.map((entry) => ({
        requirement: vacancy.requirements.find((requirement) => requirement.id === entry.requirementId)?.text ?? entry.requirementId,
        priority: vacancy.requirements.find((requirement) => requirement.id === entry.requirementId)?.priority ?? "unknown",
        status: entry.status,
        explanation: entry.explanation,
        evidenceIds: entry.resumeEvidenceIds,
      }));
      current.statusCounts = Object.fromEntries(
        ["strong_match", "partial_match", "hidden_match", "unknown", "gap"].map((status) => [status, match.matches.filter((entry) => entry.status === status).length]),
      );
      for (const entry of match.matches) {
        if (entry.resumeQuotes.some((quote) => !quoteIsGrounded(quote, item.resume))) current.issues.push(`hallucination / grounding problem: match ${entry.requirementId}`);
        if ((entry.status === "strong_match" || entry.status === "partial_match") && entry.resumeQuotes.length === 0) current.issues.push(`неправильный match: ${entry.status} без цитаты ${entry.requirementId}`);
        if (entry.status === "unknown" && entry.resumeQuotes.length > 0) current.issues.push(`неправильный match: unknown при наличии цитаты ${entry.requirementId}`);
      }

      if (voiceCases.has(item.id)) {
        current.voiceSamples = { [persona]: report.verdict.comment };
        current.voiceDetails = { [persona]: { blocks: report.contentBlocks, priorities: report.improvementPlan, meta: report.generationMeta } };
        for (const voice of personas) {
          if (voice === persona) continue;
          const variant = await runAnalysisPipeline({ resumeText: item.resume, personaId: voice, professionalAssessment: professional });
          current.voiceSamples[voice] = variant.report.verdict.comment;
          current.voiceDetails[voice] = { blocks: variant.report.contentBlocks, priorities: variant.report.improvementPlan, meta: variant.report.generationMeta };
        }
        if (new Set(Object.values(current.voiceSamples).map((value) => normalized(value ?? ""))).size !== 4) {
          current.issues.push("неправильный persona voice: голоса совпали");
        }
      }
    } catch (error) {
      current.error = error instanceof Error ? error.message : String(error);
      current.issues.push("технический сбой калибровки");
    }
    });
    current.aiCalls = audited.calls.length;
    const requiredStages = ["extract", "vacancy", "vacancy_match"];
    if (!current.error && requiredStages.some((stage) => !audited.calls.some((call) => call.stage === stage && call.provider === "openai" && call.status === "success"))) {
      current.error = "Не подтверждён живой AI на всех обязательных этапах";
      current.issues.push("технический сбой калибровки");
    }
    appendFileSync(journal, `${JSON.stringify({
      runId, ...provenance, caseId: item.id, at: new Date().toISOString(),
      scope: selectedIds ? "targeted" : "matrix18",
      rulesVersion: `${PROFESSIONAL_CORE_VERSION}+${VACANCY_ASSESSMENT_VERSION}+${MATCH_ASSESSMENT_VERSION}+${VACANCY_RULES_VERSION}+${MATCH_RULES_VERSION}+${PERSONA_BIBLE_VERSION}+${IMPROVEMENT_RULES_VERSION}`,
      provider: current.provider ?? "none", status: current.error ? "error" : "success",
      score: current.score ?? null, issueCount: current.issues.length,
      calls: audited.calls,
    })}\n`, "utf8");
    persist(results);
  }

  expect(results.filter((item) => item.error), JSON.stringify(results, null, 2)).toEqual([]);
  expect(results.length).toBe(selectedIds?.length ?? cases.length);
  for (const result of results) {
    if (result.id === "senior-backend") {
      const kafka = result.matchItems?.find((item) => /Kafka/iu.test(item.requirement));
      expect(kafka, "Kafka должно сохраниться до match").toBeTruthy();
      expect(kafka?.priority).toBe("critical");
      expect(kafka?.status).toBe("unknown");
    }
    if (result.id === "operations-executive") {
      const pnl = result.matchItems?.find((item) => /P\s*&\s*L/iu.test(item.requirement));
      expect(pnl?.status).toBe("unknown");
      expect(pnl?.evidenceIds).toEqual([]);
    }
  }
});
