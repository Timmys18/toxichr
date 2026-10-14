import { expect, test } from "@playwright/test";
import { parseGroundedAssessment } from "../../src/lib/ai/professional-assessment";
import { personaFocus } from "../../src/lib/ai/persona-focus";
import { runAnalysisPipeline } from "../../src/lib/ai/pipeline";
import { buildImprovedResume, buildImprovementQuestions } from "../../src/lib/improvement";
import { buildAdaptationQuestions, buildAdaptedResume } from "../../src/lib/adaptation";
import { MatchAssessmentSchema, StructuredVacancyAssessmentSchema, VACANCY_ASSESSMENT_VERSION, MATCH_ASSESSMENT_VERSION } from "../../src/lib/vacancy";

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

test("unknown без цитаты из резюме всё равно создаёт вопрос без выдуманной цитаты", async () => {
  const vacancy = StructuredVacancyAssessmentSchema.parse({ schemaVersion: VACANCY_ASSESSMENT_VERSION, vacancyFingerprint: "0123456789abcdef", title: "Менеджер", roleReality: "Роль требует подтверждённого английского языка.", whoTheySeek: "Нужен менеджер с подтверждённым английским языком.", mainTask: "Вести работу в международной команде.", requirements: [{ id: "VR01", text: "Английский язык не ниже B2", sourceQuote: "Английский язык не ниже B2", priority: "critical", kind: "fact", interpretation: "Работодатель прямо указывает языковое требование." }], contradictions: [], risks: [], clarificationPoints: [], employerQuestions: [] });
  const match = MatchAssessmentSchema.parse({ schemaVersion: MATCH_ASSESSMENT_VERSION, decision: { code: "explain_gap", headline: "Нужно уточнить требование", reasoning: "В тексте резюме нет прямого подтверждения уровня английского языка." }, matches: [{ requirementId: "VR01", status: "unknown", resumeEvidenceIds: [], resumeQuotes: [], explanation: "Резюме этого не показывает; нужен ответ кандидата." }], whyInviteRequirementIds: [], whyRejectRequirementIds: [], preApplyFixes: [], unknownRequirementIds: ["VR01"], candidateQuestions: ["Какой у тебя уровень английского языка?"], employerQuestions: [], limits: [] });
  const questions = buildAdaptationQuestions(vacancy, match);
  expect(questions).toHaveLength(1);
  expect(questions[0]).toMatchObject({ requirementId: "VR01", resumeQuote: "" });
  expect(questions[0].question).toMatch(/есть ли|уточни|укажи/i);
  const previous = { provider: process.env.AI_PROVIDER, key: process.env.YANDEX_AI_API_KEY, folder: process.env.YANDEX_AI_FOLDER_ID };
  const originalFetch = global.fetch;
  let requests = 0;
  try {
    process.env.AI_PROVIDER = "yandex";
    process.env.YANDEX_AI_API_KEY = "synthetic-test-key";
    process.env.YANDEX_AI_FOLDER_ID = "synthetic-test-folder";
    global.fetch = async () => { requests += 1; throw new Error("No AI call expected without an answer"); };
    const prepared = await buildAdaptedResume({ resumeText: "Менеджер по работе с подрядчиками.", vacancy, match, answers: [] });
    expect(prepared.questions).toHaveLength(1);
    expect(prepared.changes).toEqual([]);
    expect(requests).toBe(0);
  } finally {
    global.fetch = originalFetch;
    for (const [name, value] of [["AI_PROVIDER", previous.provider], ["YANDEX_AI_API_KEY", previous.key], ["YANDEX_AI_FOLDER_ID", previous.folder]] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("пустая замена для неотвеченного требования не ломает подтверждённую адаптацию", async () => {
  const resumeText = "Провёл интервью с пользователями и описал выявленные проблемы.";
  const vacancy = StructuredVacancyAssessmentSchema.parse({
    schemaVersion: VACANCY_ASSESSMENT_VERSION, vacancyFingerprint: "0123456789abcdef", title: "UX-исследователь",
    roleReality: "Роль включает интервью и самостоятельный выбор методологии.",
    whoTheySeek: "Нужен исследователь с подтверждённым опытом интервью.", mainTask: "Проводить интервью с пользователями.",
    requirements: [
      { id: "VR01", text: "Проводить интервью", sourceQuote: "Проводить интервью с пользователями", priority: "critical", kind: "fact", interpretation: "Работодатель требует опыт интервью." },
      { id: "VR02", text: "Выбирать методологию", sourceQuote: "самостоятельный выбор методологии", priority: "critical", kind: "fact", interpretation: "Работодатель требует самостоятельных решений." },
    ], contradictions: [], risks: [], clarificationPoints: [], employerQuestions: [],
  });
  const match = MatchAssessmentSchema.parse({
    schemaVersion: MATCH_ASSESSMENT_VERSION,
    decision: { code: "revise", headline: "Уточни личный вклад", reasoning: "Интервью отражены в резюме, но методология не подтверждена." },
    matches: [
      { requirementId: "VR01", status: "partial_match", resumeEvidenceIds: ["S01"], resumeQuotes: [resumeText], explanation: "Есть опыт интервью, но детали личного вклада неясны." },
      { requirementId: "VR02", status: "unknown", resumeEvidenceIds: [], resumeQuotes: [], explanation: "Резюме этого не показывает; требуется уточнение." },
    ], whyInviteRequirementIds: [], whyRejectRequirementIds: [], preApplyFixes: [], unknownRequirementIds: ["VR02"], candidateQuestions: [], employerQuestions: [], limits: [],
  });
  const previous = { provider: process.env.AI_PROVIDER, key: process.env.YANDEX_AI_API_KEY, folder: process.env.YANDEX_AI_FOLDER_ID };
  const originalFetch = global.fetch;
  let requests = 0;
  try {
    process.env.AI_PROVIDER = "yandex";
    process.env.YANDEX_AI_API_KEY = "synthetic-test-key";
    process.env.YANDEX_AI_FOLDER_ID = "synthetic-test-folder";
    global.fetch = async () => {
      requests += 1;
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ replacements: [
        { requirementId: "VR01", text: "Провёл интервью с пользователями и описал выявленные проблемы. Лично подготовил сводку интервью." },
        { requirementId: "VR02", text: "" },
      ] }) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200 });
    };
    const result = await buildAdaptedResume({ resumeText, vacancy, match, answers: [{ requirementId: "VR01", answer: "Лично подготовил сводку интервью." }] });
    expect(requests).toBe(1);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].requirementId).toBe("VR01");
  } finally {
    global.fetch = originalFetch;
    for (const [name, value] of [["AI_PROVIDER", previous.provider], ["YANDEX_AI_API_KEY", previous.key], ["YANDEX_AI_FOLDER_ID", previous.folder]] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
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
