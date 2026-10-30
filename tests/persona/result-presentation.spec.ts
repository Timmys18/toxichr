import { test, expect } from "@playwright/test";
import { resultPresentation } from "../../src/lib/ai/result-presentation";
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
