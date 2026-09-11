import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { buildAdaptedResume } from "../../src/lib/adaptation";
import { aiLiveEnabled } from "../../src/lib/ai/gateway";
import { runAnalysisPipeline } from "../../src/lib/ai/pipeline";
import type { ProfessionalAssessment } from "../../src/lib/ai/professional-assessment";
import { buildImprovedResume, isGroundedImprovementText } from "../../src/lib/improvement";
import { assessMatch, assessVacancy } from "../../src/lib/vacancy";

type CalibrationCase = { id: string; resume: string; vacancy: string };
const artifact = (name: string) => resolve(process.cwd(), "tests", "artifacts", "ai", name);
const selected = new Set(["junior-ux", "senior-backend", "support-manager"]);
const confirmedAnswers: Record<string, string> = {
  "junior-ux": "Лично проводила интервью и подготовила итоговый отчёт для продуктовой команды.",
  "senior-backend": "Лично отвечал за план миграции и координировал трёх инженеров.",
  "support-manager": "Лично руководила 18 специалистами и проводила еженедельный разбор показателей.",
};
const cases = (JSON.parse(readFileSync(artifact("beta-calibration-cases.json"), "utf8")) as CalibrationCase[])
  .filter((item) => selected.has(item.id));

test.skip(process.env.RUN_LIVE_AI_ACCEPTANCE !== "1" || !aiLiveEnabled(), "Живая rewrite-калибровка запускается только явно.");
test("generic и vacancy-aware rewrite не добавляют факты в трёх сегментах", async () => {
  test.setTimeout(20 * 60_000);
  const previous = process.env.CALIBRATION_RESUME === "1"
    ? JSON.parse(readFileSync(artifact("beta-rewrite-calibration-results.json"), "utf8")) as { cases: Array<Record<string, unknown>> }
    : { cases: [] };
  const results = [...previous.cases];

  for (const item of cases) {
    if (results.some((entry) => entry.id === item.id)) continue;
    const analysis = await runAnalysisPipeline({ resumeText: item.resume, personaId: "gleb" });
    const professional = analysis.report.professionalAssessment as ProfessionalAssessment | undefined;
    expect(professional).toBeTruthy();

    const groundedProblem = analysis.report.topProblems.find((entry) => item.resume.includes(entry.quote));
    const sourceSentence = item.resume.match(/^[^.!?]+[.!?]/u)?.[0] ?? item.resume;
    const problem = groundedProblem ?? {
      id: "calibration-rewrite",
      severity: "medium" as const,
      title: "Проверить редактуру выбранной строки",
      quote: sourceSentence,
      roast: "Строка выбрана для калибровки редактора.",
      diagnosis: "Калибровка не подменяет профессиональный вывод.",
      recommendation: "Переписать только по подтверждённому ответу.",
    };
    const report = groundedProblem ? analysis.report : { ...analysis.report, topProblems: [problem] };
    const improvementAnswer = confirmedAnswers[item.id];
    const improved = await buildImprovedResume({
      report,
      resumeText: item.resume,
      answers: [{ problemId: problem.id, answer: improvementAnswer }],
      personaId: "gleb",
    });
    if (improved.replacements.length === 0) expect(improved.improvedText, `${item.id}: безопасный no-op изменил резюме`).toBe(item.resume);
    expect(improved.replacements.every((entry) => isGroundedImprovementText(entry.replacement, [entry.original, improvementAnswer]))).toBe(true);

    const vacancy = await assessVacancy(item.vacancy);
    const match = await assessMatch(vacancy, professional!);
    const prepared = await buildAdaptedResume({ resumeText: item.resume, vacancy, match, answers: [] });
    expect(prepared.questions.length, `${item.id}: match не создал связанного уточнения`).toBeGreaterThan(0);
    const question = prepared.questions[0];
    const adaptationAnswer = confirmedAnswers[item.id];
    const adapted = await buildAdaptedResume({
      resumeText: item.resume,
      vacancy,
      match,
      answers: [{ requirementId: question.requirementId, answer: adaptationAnswer }],
    });
    expect(adapted.changes.length, `${item.id}: adaptation не применила подтверждённый факт`).toBeGreaterThan(0);
    expect(adapted.changes[0].replacement).toContain(question.resumeQuote.replace(/[.!?;:]+$/, ""));

    results.push({
      id: item.id,
      rewrite: improved.replacements.map(({ problemId, original, replacement, grounded }) => ({ problemId, original, replacement, grounded })),
      adaptation: adapted.changes,
      issues: [],
    });
    writeFileSync(artifact("beta-rewrite-calibration-results.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), cases: results }, null, 2)}\n`, "utf8");
  }
});
