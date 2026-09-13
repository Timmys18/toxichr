import { expect, test } from "@playwright/test";
import { parseGroundedAssessment } from "../../src/lib/ai/professional-assessment";
import { personaFocus } from "../../src/lib/ai/persona-focus";
import { runAnalysisPipeline } from "../../src/lib/ai/pipeline";
import { buildImprovedResume, buildImprovementQuestions } from "../../src/lib/improvement";

test("уточнение и четыре профессиональные оптики работают с конкретными цитатами", async () => {
  const before = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = "mock";
  try {
    const source = "Backend-инженер. Руководил командой из 5 инженеров. Разработал платёжный сервис. Сократил время восстановления с 40 до 10 минут. Лично провёл миграцию без простоя.";
    const { report } = await runAnalysisPipeline({ resumeText: source, personaId: "gleb" });
    const assessment = structuredClone(report.professionalAssessment!);
    assessment.strengths = [
      { id: "S01", sourceQuote: "Руководил командой из 5 инженеров.", interpretation: "Показан управленческий масштаб." },
      { id: "S02", sourceQuote: "Разработал платёжный сервис.", interpretation: "Показана платёжная специализация." },
      { id: "S03", sourceQuote: "Сократил время восстановления с 40 до 10 минут.", interpretation: "Есть измеримый операционный эффект." },
      { id: "S04", sourceQuote: "Лично провёл миграцию без простоя.", interpretation: "Есть личное техническое действие." },
    ];
    assessment.findings = [];
    const grounded = parseGroundedAssessment(assessment, source).assessment!;
    expect(grounded.strengths[0].sourceQuote).toBe(assessment.strengths[0].sourceQuote);
    const quoted = structuredClone(assessment);
    quoted.strengths[0].sourceQuote = `«${quoted.strengths[0].sourceQuote}»`;
    expect(parseGroundedAssessment(quoted, source).assessment?.strengths[0].sourceQuote).toBe(assessment.strengths[0].sourceQuote);
    expect(new Set((["tamara", "lera", "gleb", "vadik"] as const).map((id) => personaFocus(grounded, id).angle)).size).toBe(4);
    expect(new Set((["tamara", "lera", "gleb", "vadik"] as const).map((id) => personaFocus(grounded, id).evidence[0].id)).size).toBe(4);
    const updated = { ...report, topProblems: [], strengths: [{ id: "s1", title: "Миграция", quote: assessment.strengths[3].sourceQuote, comment: "Подтверждённое личное действие." }] };
    const question = buildImprovementQuestions(updated)[0];
    expect(question.quote).toBe(assessment.strengths[3].sourceQuote);
    const empty = await buildImprovedResume({ report: updated, resumeText: source, answers: [{ problemId: question.problemId, answer: "Не помню" }], personaId: "gleb" });
    expect(empty.replacements).toEqual([]);
    expect(empty.clarificationQuestions[0].quote).toBe(question.quote);
    const result = await buildImprovedResume({ report: updated, resumeText: source, answers: [{ problemId: question.problemId, answer: "Подготовил план отката и согласовал окно переключения." }], personaId: "gleb" });
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0].original).toBe(question.quote);
    expect(result.improvedText.startsWith("Backend-инженер.")).toBe(true);
  } finally {
    if (before === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = before;
  }
});
