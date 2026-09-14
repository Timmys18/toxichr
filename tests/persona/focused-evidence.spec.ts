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

test("rewrite не предлагает редактировать должность, отрицание или чужое действие", async () => {
  const before = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = "mock";
  try {
    const source = "Главный бухгалтер компании, штат семь человек. Проекты по МСФО вела внешняя консультационная команда. Организовала закрытие РСБУ для трёх юридических лиц.";
    const { report } = await runAnalysisPipeline({ resumeText: source, personaId: "tamara" });
    const updated = { ...report, candidateProfile: { ...report.candidateProfile, primaryRole: "Главный бухгалтер" }, topProblems: [], strengths: [
      { id: "s1", title: "Должность", quote: "Главный бухгалтер компании, штат семь человек.", comment: "Роль." },
      { id: "s2", title: "Чужая работа", quote: "Проекты по МСФО вела внешняя консультационная команда.", comment: "Ограничение." },
      { id: "s3", title: "Личная работа", quote: "Организовала закрытие РСБУ для трёх юридических лиц.", comment: "Подтверждённая задача." },
    ] };
    const questions = buildImprovementQuestions(updated, source);
    expect(questions.map((item) => item.quote)).toEqual(["Организовала закрытие РСБУ для трёх юридических лиц."]);
    expect(questions[0].question).toContain("какой конкретный итог");
    const chef = { ...updated, candidateProfile: { ...updated.candidateProfile, primaryRole: "Шеф-повар" }, strengths: [
      { id: "s4", title: "Ограничение", quote: "Открытие ресторана с нуля не вёл.", comment: "Честная граница." },
      { id: "s5", title: "Действие", quote: "Обновил сезонное меню и стандартизировал карты приготовления.", comment: "Личная работа." },
    ] };
    expect(buildImprovementQuestions(chef).map((item) => item.quote)).toEqual(["Обновил сезонное меню и стандартизировал карты приготовления."]);
    const construction = { ...updated, strengths: [
      { id: "s6", title: "Граница полномочий", quote: "Бюджет проекта контролировал совместно с финансовым контролёром, договоры не подписывал.", comment: "Честная граница." },
      { id: "s8", title: "Не участвовал", quote: "В согласовании договоров не участвовал.", comment: "Честная граница." },
      { id: "s9", title: "Не отвечал", quote: "За P&L подразделения не отвечал.", comment: "Честная граница." },
      { id: "s7", title: "Решение", quote: "Перенёс критические работы между очередями и сократил отставание с девяти до трёх недель.", comment: "Подтверждённый результат." },
    ] };
    expect(buildImprovementQuestions(construction).map((item) => item.quote)).toEqual(["Перенёс критические работы между очередями и сократил отставание с девяти до трёх недель."]);
  } finally {
    if (before === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = before;
  }
});
