import "dotenv/config";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { buildAdaptedResume } from "../../src/lib/adaptation";
import { aiLiveEnabled } from "../../src/lib/ai/gateway";
import { withCalibrationAiCalls } from "../../src/lib/ai/calibration-audit";
import { runAnalysisPipeline } from "../../src/lib/ai/pipeline";
import type { ProfessionalAssessment } from "../../src/lib/ai/professional-assessment";
import { buildImprovedResume, buildImprovementQuestions, IMPROVEMENT_RULES_VERSION, isGroundedImprovementText } from "../../src/lib/improvement";
import { assessMatch, assessVacancy } from "../../src/lib/vacancy";
import { calibrationProvenance } from "./calibration-provenance";

type CalibrationCase = { id: string; resume: string; vacancy: string };
const artifact = (name: string) => resolve(process.cwd(), "tests", "artifacts", "ai", name);
// Authored candidate confirmations for synthetic cases, never model-generated
// facts or evidence for evaluating the original resume.
const confirmations: Record<string, { topic: RegExp; answer: string }> = {
  "junior-ux": { topic: /интервью|сценарии/iu, answer: "Лично составляла порядок вопросов интервью и фиксировала наблюдения после каждой сессии." },
  "senior-backend": { topic: /миграци|восстановлен/iu, answer: "Лично отвечал за план миграции и координировал трёх инженеров." },
  "support-manager": { topic: /маршрутизац|обращен|SLA/iu, answer: "Лично определила правила маршрутизации обращений по сложности и обучила старших смен." },
};
const cases = (JSON.parse(readFileSync(artifact("beta-calibration-cases.json"), "utf8")) as CalibrationCase[]).filter((item) => item.id in confirmations);

test.skip(process.env.RUN_LIVE_AI_ACCEPTANCE !== "1" || !aiLiveEnabled(), "Живая rewrite-калибровка запускается только явно.");
test("generic и vacancy-aware rewrite: конкретный фрагмент, подтверждение или уточнение", async () => {
  test.setTimeout(20 * 60_000);
  const results: Array<Record<string, unknown>> = [];
  const runId = randomUUID();
  const provenance = calibrationProvenance();
  for (const item of cases) {
    const current: Record<string, unknown> = { id: item.id, issues: [] };
    results.push(current);
    const audited = await withCalibrationAiCalls(async () => {
      try {
        const analysis = await runAnalysisPipeline({ resumeText: item.resume, personaId: "gleb" });
        const professional = analysis.report.professionalAssessment as ProfessionalAssessment;
        const questions = buildImprovementQuestions(analysis.report, item.resume);
        const confirmation = confirmations[item.id];
        const question = questions.find((entry) => confirmation.topic.test(entry.quote));
        current.questions = questions;
        expect(question, `${item.id}: нет уточнения конкретного фрагмента`).toBeTruthy();
        const noAnswer = await buildImprovedResume({ report: analysis.report, resumeText: item.resume, answers: [{ problemId: question!.problemId, answer: "Не помню" }], personaId: "gleb" });
        expect(noAnswer.replacements).toEqual([]);
        expect(noAnswer.clarificationQuestions.length).toBeGreaterThan(0);
        const improved = await buildImprovedResume({ report: analysis.report, resumeText: item.resume, answers: [{ problemId: question!.problemId, answer: confirmation.answer }], personaId: "gleb" });
        current.confirmation = confirmation.answer;
        current.rewrite = improved.replacements;
        current.improvedText = improved.improvedText;
        current.clarificationWithoutFact = noAnswer.clarificationQuestions;
        expect(improved.replacements.length, `${item.id}: подтверждённая конкретная правка не применена`).toBeGreaterThan(0);
        expect(improved.replacements.every((entry) => item.resume.includes(entry.original) && entry.original !== item.resume && entry.replacement !== entry.original)).toBe(true);
        expect(improved.replacements.every((entry) => entry.grounded && isGroundedImprovementText(entry.replacement, [entry.original, confirmation.answer]))).toBe(true);
        expect(improved.improvedText.startsWith(item.resume.match(/^[^.!?]+[.!?]/u)![0])).toBe(true);
        const vacancy = await assessVacancy(item.vacancy);
        const match = await assessMatch(vacancy, professional);
        const prepared = await buildAdaptedResume({ resumeText: item.resume, vacancy, match, answers: [] });
        const adaptationQuestion = prepared.questions.find((entry) => confirmation.topic.test(entry.resumeQuote));
        const adapted = adaptationQuestion ? await buildAdaptedResume({ resumeText: item.resume, vacancy, match, answers: [{ requirementId: adaptationQuestion.requirementId, answer: confirmation.answer }] }) : prepared;
        current.adaptation = adapted.changes;
        current.adaptationQuestionCount = prepared.questions.length;
        current.adaptationChecked = Boolean(adaptationQuestion);
      } catch (error) {
        current.error = error instanceof Error ? error.message : String(error);
      }
    });
    current.calls = audited.calls;
    appendFileSync(artifact("beta-calibration-run-journal.jsonl"), `${JSON.stringify({ runId, ...provenance, caseId: item.id, scope: "rewrite3", at: new Date().toISOString(), rulesVersion: IMPROVEMENT_RULES_VERSION, status: current.error ? "error" : "success", calls: audited.calls })}\n`, "utf8");
    writeFileSync(artifact("beta-rewrite-calibration-results.json"), `${JSON.stringify({ runId, generatedAt: new Date().toISOString(), cases: results }, null, 2)}\n`, "utf8");
  }
  expect(results.filter((item) => item.error), JSON.stringify(results, null, 2)).toEqual([]);
});
