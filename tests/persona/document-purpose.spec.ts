import { test, expect } from "@playwright/test";
import { classifyDocumentPurpose, storedDocumentPurpose } from "../../src/lib/document-purpose";
import { createAndRunAnalysis, findReusableAnalysis } from "../../src/lib/run-analysis";
import { prisma } from "../../src/lib/prisma";

async function withClassifier(
  decisions: Array<"suitable" | "other" | "uncertain" | "error">,
  run: (calls: () => number) => Promise<void>,
) {
  const previousFetch = globalThis.fetch;
  const previousProvider = process.env.AI_PROVIDER;
  const previousKey = process.env.OPENAI_API_KEY;
  let count = 0;
  process.env.AI_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "test-only";
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { response_format?: { json_schema?: { name?: string } } };
    expect(body.response_format?.json_schema?.name).toBe("document_purpose_v1");
    const next = decisions[count++];
    if (next === "error") return new Response("provider unavailable", { status: 503 });
    if (!next) throw new Error("Unexpected paid-model call");
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ decision: next }) }, finish_reason: "stop" }], usage: { prompt_tokens: 20, completion_tokens: 5 } }), { status: 200 });
  };
  try { await run(() => count); } finally {
    globalThis.fetch = previousFetch;
    if (previousProvider === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = previousProvider;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
  }
}

async function testResume(text: string) {
  return prisma.resume.create({ data: { sanitizedText: text, versions: { create: { versionNumber: 1, structuredContent: {} } } }, include: { versions: true } });
}

async function removeTestResume(id: string) {
  await prisma.analysis.deleteMany({ where: { resumeVersion: { resumeId: id } } });
  await prisma.resumeVersion.deleteMany({ where: { resumeId: id } });
  await prisma.resume.delete({ where: { id } });
}

test("проверка не требует формы резюме и работает по полному тексту", async () => {
  const materials = [
    ["Последние два года веду небольшую команду поддержки. Настроила передачу сложных обращений и обучала новых коллег.", "suitable"],
    ["Я электрик. Монтировал щиты в жилых домах, проверял цепи и сдавал работы заказчику.", "suitable"],
    ["Разработал библиотеку обработки сигналов. Руководил экспериментом и готовил отчёты для исследовательской группы.", "suitable"],
    ["Представляем квартальный план поставок. Подрядчик должен подтвердить сроки и стоимость этапов до подписания.", "other"],
    ["Согласовано проведение ежегодного собрания участников. Повестка и порядок голосования прилагаются.", "other"],
    ["Серебряная рябь за окном. Наступает вечер.", "other"],
    ["Управлял.", "uncertain"],
  ] as const;
  await withClassifier(materials.map(([, d]) => d), async calls => {
    for (const [text, decision] of materials) expect((await classifyDocumentPurpose(text)).decision).toBe(decision);
    expect(calls()).toBe(materials.length);
  });
});

test("прямой запуск не обходит отрицательное решение и не расходует HR-лимит; хеш меняет решение", async () => {
  const resume = await testResume("Текст договора о поставке: предмет соглашения, подписи сторон и порядок исполнения.");
  try {
    await withClassifier(["other", "uncertain"], async calls => {
      await expect(createAndRunAnalysis(resume.id, "lera")).rejects.toThrow("Загрузи резюме");
      expect(await prisma.analysis.count({ where: { resumeVersion: { resumeId: resume.id } } })).toBe(0);
      expect(await findReusableAnalysis(resume.id, "lera")).toBeNull();
      await expect(createAndRunAnalysis(resume.id, "lera")).rejects.toThrow("Загрузи резюме");
      expect(calls()).toBe(1);
      const version = await prisma.resumeVersion.findUniqueOrThrow({ where: { id: resume.versions[0].id } });
      expect(storedDocumentPurpose(version.structuredContent, resume.sanitizedText ?? "")?.decision).toBe("other");
      const changed = "Небольшой текст без понятного назначения.";
      await prisma.resumeVersion.update({ where: { id: version.id }, data: { structuredContent: { text: changed } } });
      await expect(createAndRunAnalysis(resume.id, "lera")).rejects.toThrow("более полное описание");
      expect(calls()).toBe(2);
      expect(await prisma.analysis.count({ where: { resumeVersion: { resumeId: resume.id } } })).toBe(0);
    });
  } finally { await removeTestResume(resume.id); }
});

test("недоступность AI остаётся технической ошибкой и не кэшируется как отказ", async () => {
  const resume = await testResume("Мой опыт — управление закупками и переговоры с поставщиками в сети магазинов.");
  try {
    await withClassifier(["error", "other"], async calls => {
      await expect(createAndRunAnalysis(resume.id, "vadik")).rejects.toThrow();
      let version = await prisma.resumeVersion.findUniqueOrThrow({ where: { id: resume.versions[0].id } });
      expect(storedDocumentPurpose(version.structuredContent, resume.sanitizedText ?? "")).toBeNull();
      expect(await prisma.analysis.count({ where: { resumeVersion: { resumeId: resume.id } } })).toBe(0);
      await expect(createAndRunAnalysis(resume.id, "vadik")).rejects.toThrow("Загрузи резюме");
      version = await prisma.resumeVersion.findUniqueOrThrow({ where: { id: resume.versions[0].id } });
      expect(storedDocumentPurpose(version.structuredContent, resume.sanitizedText ?? "")?.decision).toBe("other");
      expect(calls()).toBe(2);
    });
  } finally { await removeTestResume(resume.id); }
});
