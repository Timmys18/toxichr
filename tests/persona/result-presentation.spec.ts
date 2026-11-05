import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { prioritizeFindings, resultPresentation, selectReportFindings } from "../../src/lib/ai/result-presentation";
import { unsupportedAssessmentClaimReasons } from "../../src/lib/ai/assessment-review";
import { ProfessionalAssessmentSchema } from "../../src/lib/ai/professional-assessment";
import { runHeuristicAnalysis } from "../../src/lib/ai/heuristics";
import { validatePersonaDraft, validateUserFacingLanguage } from "../../src/lib/ai/writer-validator";

test("professional reception terminology does not reject a medical review", () => {
  expect(validateUserFacingLanguage("В резюме описан приём пациентов по записи и порядок переноса визитов.")).toEqual([]);
});

const resume = "Руководитель отдела. Организовывал работу команды и контролировал выполнение задач.";

test("legacy report does not attach the analyst's first quote to an unrelated lead", () => {
  const report = runHeuristicAnalysis(resume, "lera");
  report.verdict.comment = "Это самостоятельная авторская реплика про содержание резюме.";
  report.hrReview.firstImpression = `${report.verdict.comment} Отдельное наблюдение.`;
  report.contentBlocks = [];
  const result = resultPresentation(report);
  expect(result.quotes).toEqual([]);
  expect(result.paragraphs).toContain("Отдельное наблюдение.");
  expect(result.paragraphs.join(" ")).not.toContain(report.verdict.comment);
});

test("authored blocks preserve content and remove lead duplication", () => {
  const report = runHeuristicAnalysis(resume, "tamara");
  report.contentBlocks = [
    { type: "summary", findingIds: [], content: report.verdict.comment },
    { type: "observation", findingIds: [], content: "Содержательное отдельное наблюдение." },
    { type: "summary", findingIds: [], content: "Содержательное отдельное наблюдение." },
  ];
  expect(resultPresentation(report).paragraphs).toEqual(["Содержательное отдельное наблюдение."]);
});

test("unknown lead reference cannot pass validation", () => {
  const draft = {
    verdict: { title: "Описанная работа", comment: "В тексте описана работа, но результат требует уточнения.", findingIds: ["F99"] },
    contentBlocks: [
      { type: "finding", findingIds: ["F01"], content: "Уточните содержание описанной задачи по своему опыту." },
      { type: "summary", findingIds: [], content: "Добавлять выдуманные результаты не требуется." },
    ],
    priorities: [{ findingIds: ["F01"], action: "Уточните содержание задачи." }], shareLines: ["Формулировка должна показывать работу."],
  };
  expect(validatePersonaDraft(draft, new Set(["F01"])).errors).toContain("главная реплика ссылается на несуществующий findingId");
});

test("visible issues start with the HR's lead even when the analyst listed it last", () => {
  const findings = [{ id: "F01" }, { id: "F02" }, { id: "F03" }, { id: "F04" }];
  const shown = prioritizeFindings(findings, ["F03"], ["F01", "F03", "F02"]);
  expect(shown.map(item => item.id)).toEqual(["F03", "F01", "F02", "F04"]);
  expect(findings.map(item => item.id)).toEqual(["F01", "F02", "F03", "F04"]);
});

test("a critical finding cannot be displaced by the eight-item presentation limit", () => {
  const findings = Array.from({ length: 10 }, (_, index) => ({ id: `F${index + 1}`, severity: index === 9 ? "critical" : "medium" }));
  const shown = selectReportFindings(findings, ["F1"], ["F2", "F3"]);
  expect(shown).toHaveLength(8);
  expect(shown[0].id).toBe("F1");
  expect(shown.some(item => item.id === "F10")).toBe(true);
  expect(shown.some(item => item.id === "F9")).toBe(false);
});

test("all critical findings survive even when there are more than the usual limit", () => {
  const findings = Array.from({ length: 10 }, (_, index) => ({ id: `F${index + 1}`, severity: "critical" }));
  expect(selectReportFindings(findings, ["F1"], [])).toHaveLength(10);
});

test("the saved H10 report flags invented time savings and hidden proof", () => {
  const text = readFileSync("artifacts/auditor-live-repair-08/H10-resume.txt", "utf8");
  const saved = JSON.parse(readFileSync("artifacts/auditor-live-repair-08/H10-lera.json", "utf8"));
  const assessment = ProfessionalAssessmentSchema.parse(saved.report.professionalAssessment);
  const rejected = unsupportedAssessmentClaimReasons(text, assessment);
  expect([...rejected.keys()].sort()).toEqual(["F21", "S21"]);
  assessment.strengths[0].interpretation = "Сэкономила время команды благодаря списку вопросов.";
  expect(unsupportedAssessmentClaimReasons(text, assessment).has("S21")).toBe(true);
  expect(unsupportedAssessmentClaimReasons(`${text} Сократила время встречи на 20 минут.`, assessment).has("S21")).toBe(false);
});

test("regular documented use is not a resume defect just because time savings were not measured", () => {
  const saved = JSON.parse(readFileSync("artifacts/auditor-live-repair-08/H10-lera.json", "utf8"));
  const assessment = ProfessionalAssessmentSchema.parse(saved.report.professionalAssessment);
  const finding = assessment.findings[0];
  finding.sourceQuote = "В 2024 году лично составила список вопросов. Менеджеры используют его на еженедельных встречах. Экономию времени от списка не измеряли.";
  finding.interpretation = "Полезный рабочий инструмент есть, но его эффект оставлен без доказательства.";
  expect(unsupportedAssessmentClaimReasons(finding.sourceQuote, assessment).has(finding.id)).toBe(true);
  finding.interpretation = "Полезный инструмент описан без измерения эффекта.";
  expect(unsupportedAssessmentClaimReasons(finding.sourceQuote, assessment).has(finding.id)).toBe(true);
  finding.interpretation = "Неясно, кто отвечает за внедрение списка вопросов.";
  expect(unsupportedAssessmentClaimReasons(finding.sourceQuote, assessment).has(finding.id)).toBe(false);
});
