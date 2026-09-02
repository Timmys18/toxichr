import { expect, test } from "@playwright/test";
import { stripSensitiveShareText, validatePersonaDraft } from "../../src/lib/ai/writer-validator";

const findingIds = new Set(["F01", "F02"]);

test("персона может писать свободно, но только по существующим находкам", () => {
  const result = validatePersonaDraft({
    verdict: { title: "Тексту не хватает опоры", comment: "Роль читается, но личный вклад в двух ключевых строках остаётся за кадром." },
    contentBlocks: [
      { type: "finding", findingIds: ["F01", "F02"], content: "Две формулировки обещают много, но текст не показывает, что именно сделал кандидат лично." },
      { type: "summary", findingIds: [], content: "Сначала верните действие и итог в эти строки, потом добавляйте любые украшения." },
    ],
    priorities: [{ findingIds: ["F01"], action: "Назовите личное действие и реальный итог в рамках этого пункта." }],
    shareLines: ["Сильная роль читается лучше, когда действие не прячется за общими словами."],
  }, findingIds);
  expect(result.ok).toBe(true);
});

test("валидатор отсекает выдуманную способность, чужой finding и чувствительную share-строку", () => {
  const result = validatePersonaDraft({
    verdict: { title: "Слишком смелый вывод", comment: "Кандидат не умеет управлять командой, а текст ничего не подтверждает." },
    contentBlocks: [
      { type: "finding", findingIds: ["F99"], content: "Этот текст не показывает реальный масштаб работы." },
      { type: "summary", findingIds: [], content: "Сначала уточните факты, потом делайте вывод." },
    ],
    priorities: [{ findingIds: ["F01"], action: "Уточните контекст и итог только реальными данными." }],
    shareLines: ["Напишите мне: name@example.com"],
  }, findingIds);
  expect(result.ok).toBe(false);
  expect(result.errors.join(" ")).toContain("способности");
  expect(result.errors.join(" ")).toContain("несуществующий");
  expect(stripSensitiveShareText("ООО Ромашка, +7 999 123-45-67")).toBeNull();
});
