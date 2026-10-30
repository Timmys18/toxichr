import { expect, test } from "@playwright/test";
import { ProfessionalAssessmentSchema, parseGroundedAssessment, type ProfessionalAssessment } from "../../src/lib/ai/professional-assessment";
import { voiceContext } from "../../src/lib/ai/voice/context";
import { inspectVoiceProse, selectVoiceExamples, voiceCalibration, VOICE_EXAMPLES } from "../../src/lib/ai/voice/runtime";
import corpus from "../../src/lib/ai/voice/corpus.json";
import { PERSONA_BIBLES } from "../../src/lib/ai/prompts/persona-bibles";
import { WRITER_CORE_PROMPT } from "../../src/lib/ai/prompts/writer-core";
import { editorPrompt } from "../../src/lib/ai/prompts/editor-core";
import { PERSONA_DRAFT_JSON_SCHEMA, validatePersonaDraft, type PersonaDraft } from "../../src/lib/ai/writer-validator";
import { runAnalysisPipeline } from "../../src/lib/ai/pipeline";
import { normalizeYandexJsonContent } from "../../src/lib/ai/gateway";
import { resultPresentation } from "../../src/lib/ai/result-presentation";

const interpretations: Record<string, string> = {
  C01: "Управленческие решения не раскрыты в описании работы.",
  C03: "Способ измерения роста конверсии не описан.",
  C05: "Личная роль в общем плане отдела не раскрыта.",
  C06: "Решения в управлении строительством не описаны.",
  C08: "Существенные условия и база сравнения не указаны.",
  C10: "Целевая вакансия и основная роль не указаны.",
  C13: "Вклад рекламы в рост не установлен отдельно от других изменений.",
  C14: "Практика моделирования данных не указана в тексте.",
  C15: "Собственная роль и содержание задач не раскрыты.",
  C16: "Профессиональные задачи и опыт не описаны.",
};
function fixture(caseId = "C05"): { resume: string; assessment: ProfessionalAssessment } {
  const e = corpus.entries.find(e => e.caseId === caseId)!;
  const concern = e.polarity === "concern" || e.polarity === "mixed" || e.polarity === "uncertain";
  const strength = e.polarity === "strength" || e.polarity === "mixed";
  return { resume: e.sourceFragment, assessment: ProfessionalAssessmentSchema.parse({
    candidateContext: { primaryProfession: caseId === "C01" ? "начальник эксплуатации" : caseId === "C06" ? "руководитель строительства" : caseId === "C04" ? "медицинская сестра" : "специалист", secondaryContext: "контекст вымышленного кейса", claimedLevel: e.seniorityContext, inferredLevel: e.seniorityContext, industry: e.industry, careerPattern: "контекст данного учебного случая", confidence: 0.9 },
    professionalAssessment: { overallImpression: "В этом вымышленном кейсе оценка относится только к описанному содержанию работы.", strongestProfessionalSignal: "Профессиональные сведения рассматриваются в границах исходного материала.", mainResumeProblem: interpretations[caseId] ?? "Новый недостаток по данному материалу не установлен.", seniorityConsistency: "Дополнительный уровень по одной строке не определяется.", resumeVsExperienceGap: "Отсутствие подробности не устанавливает отсутствие опыта." },
    findings: concern ? [{ id: "F01", sourceQuote: e.sourceFragment, interpretation: interpretations[caseId], whyItMatters: e.professionalPoint, severity: "medium", confidence: "high", issueType: "содержание описания" }] : [],
    strengths: strength ? [{ id: "S01", sourceQuote: e.sourceFragment, interpretation: "Описание содержит конкретное действие и профессиональную информацию." }] : [],
    questionsCreatedByResume: [], uncertainties: [e.disallowedInference], claimsNotAllowed: ["Нельзя изобретать факты или оценивать личность."],
  }) };
}

test("цитата из резюме с большими пробелами остаётся точной и укладывается в лимит", () => {
  const { resume, assessment } = fixture("C05");
  const spacedResume = resume.replace(/\s+/g, " ".repeat(100));
  const grounded = parseGroundedAssessment(assessment, spacedResume);
  expect(grounded.assessment).not.toBeNull();
  for (const item of [...grounded.assessment!.findings, ...grounded.assessment!.strengths]) {
    expect(item.sourceQuote.length).toBeLessThanOrEqual(500);
    expect(spacedResume).toContain(item.sourceQuote);
  }
});

test("68 эталонов, 17 контекстов, равные голоса; это авторский корпус", () => {
  expect(corpus.entries).toHaveLength(68);
  expect(new Set(corpus.entries.map(e => e.id)).size).toBe(68);
  for (const persona of corpus.personas) expect(corpus.entries.filter(e => e.persona === persona)).toHaveLength(17);
  expect(corpus.entries.every(e => e.notLiveGenerated)).toBe(true);
});

for (const caseId of new Set(corpus.entries.map(e => e.caseId))) test(`${caseId}: маппинг требует исходных условий и выбирает свой голос`, () => {
  const { assessment } = fixture(caseId);
  const original = JSON.stringify(assessment);
  for (const persona of ["tamara", "lera", "gleb", "vadik"] as const) {
    const selected = selectVoiceExamples(voiceContext(assessment, persona));
    expect(selected.examples.map(e => e.id)).toContain(persona[0].toUpperCase() + caseId.slice(1));
    expect(selected.examples.every(e => e.persona === persona)).toBe(true);
  }
  expect(JSON.stringify(assessment)).toBe(original);
});

test("низкая уверенность, недостающие предпосылки и неверные ссылки не подменяются похожей отраслью", () => {
  const { assessment } = fixture();
  const ctx = voiceContext(assessment, "tamara");
  expect(selectVoiceExamples(ctx)).toEqual(selectVoiceExamples(ctx));
  expect(selectVoiceExamples({ ...ctx, confidence: 0.3 }).examples).toHaveLength(0);
  expect(selectVoiceExamples({ ...ctx, evidence: {} }).examples).toHaveLength(0);
  expect(() => selectVoiceExamples({ ...ctx, evidence: { "team-outcome": ["F99"] } })).toThrow();
});

test("написанная личная роль исключает старую претензию; medium finding не считается достаточным", () => {
  const { assessment } = fixture();
  assessment.findings[0].sourceQuote += " Мой участок: подготовка предложений и согласование условий продления.";
  expect(voiceCalibration(assessment, "lera").metadata.selectedIds).toEqual([]);
  const other = fixture().assessment; other.findings[0].confidence = "medium";
  expect(voiceCalibration(other, "vadik").metadata.selectedIds).toEqual([]);
});

test("честный учебный проект не получает претензию к несуществующему росту", () => {
  const { assessment } = fixture("C03");
  assessment.findings = [];
  assessment.strengths = [{ id: "S01", sourceQuote: "Учебный UX-проект. Сравнил два сценария и описал ограничения. Конверсию не измерял.", interpretation: "Честно описана учебная задача и границы результата." }];
  expect(voiceCalibration(assessment, "gleb").metadata.selectedIds).toEqual([]);
});

test("явное отсутствие внедрения не превращается в сильный production-кейс", () => {
  const { assessment } = fixture("C02"); assessment.strengths[0].sourceQuote = "Оптимизировал SQL-запросы. p95 измерял на одинаковом тесте. Изменения не внедрил в production.";
  expect(voiceCalibration(assessment, "tamara").metadata.selectedIds).toEqual([]);
});

test("неизвестная ситуация остаётся без примера; инструкция по голосу есть", () => {
  const { assessment } = fixture("C05"); assessment.findings[0].interpretation = "Профессиональное замечание, которое пока не описано библиотекой.";
  const calibration = voiceCalibration(assessment, "lera");
  expect(calibration.metadata.selectedIds).toEqual([]);
  expect(PERSONA_BIBLES.lera).toContain("Быстрая");
  expect(calibration.fictionalCraftExamplesNotCurrentFindings).toHaveLength(2);
  expect(calibration.editorialLessons.length).toBeGreaterThan(0);
});

test("явное личное действие выбирает релевантный голос и передаёт пример writer; должность и командный итог не подходят", () => {
  const { assessment } = fixture("C17");
  for (const persona of ["tamara", "lera", "gleb", "vadik"] as const) {
    const calibration = voiceCalibration(assessment, persona);
    expect(calibration.metadata.selectedIds).toContain(`${persona[0].toUpperCase()}17`);
    expect(calibration.fictionalStyleExamplesNeverCandidateEvidence[0].fictionalResponse).toBeTruthy();
  }
  assessment.strengths[0].sourceQuote = "Команда подготовила инструкцию для передачи смены.";
  expect(voiceCalibration(assessment, "tamara").metadata.selectedIds).toEqual([]);
  assessment.strengths[0].sourceQuote = "Руководитель смены, ответственный специалист.";
  expect(voiceCalibration(assessment, "tamara").metadata.selectedIds).toEqual([]);
  assessment.strengths[0].sourceQuote = "Не подготовил инструкцию для передачи смены.";
  expect(voiceCalibration(assessment, "tamara").metadata.selectedIds).toEqual([]);
});

test("чужое число, прямое оскорбление и видимый дубль блокируются; копия — warning", () => {
  expect(inspectVoiceProse("У вас 118% плана.", { groundedText: "Работал с клиентами." }).blockers).toContain("цифровой факт отсутствует в исходном материале");
  expect(inspectVoiceProse("Вы идиот.", { groundedText: "" }).blockers).toContain("прямое оскорбление вместо оценки резюме");
  const example = VOICE_EXAMPLES.find(e => e.id === "T05")!;
  const inspection = inspectVoiceProse(example.outputExample, { groundedText: example.sourceFragment, displayedBlocks: [example.outputExample, example.outputExample] });
  expect(inspection.blockers).toContain("одинаковый текст в разных видимых блоках");
  expect(inspection.warnings).toContain("возможное дословное копирование стилевого примера");
});

test("грубая фраза о кандидате не проходит как допустимый голос", () => {
  const value = draft();
  value.contentBlocks[0].content = "Изоляция очередей — реальная задача. Видно, что руки не из жопы.";
  expect(validatePersonaDraft(value, new Set(["F01"]), { groundedText: fixture().resume }).errors)
    .toContain("мат и грубая лексика в готовом ответе");
});

function draft(): PersonaDraft {
  return {
    verdict: { title: "Общий итог и личная роль", comment: "Командный процент заметен, но собственный участок переговоров в описании не раскрыт." },
    contentBlocks: [
      { type: "finding", findingIds: ["F01"], content: "В общей цифре нет сведений о том, что входило в вашу работу. Сохраните результат отдела и рядом опишите свой участок переговоров по реальному опыту." },
      { type: "summary", findingIds: [], content: "Достаточно раскрыть собственную часть работы; новый индивидуальный процент придумывать не нужно." },
    ],
    priorities: [{ findingIds: ["F01"], action: "Уточните свой участок работы с клиентами и роль в переговорах." }],
    shareLines: ["Общий результат становится понятнее рядом с конкретной ролью."],
  };
}

test("короткий голос без слов-маркеров и панча не отвергается литературным псевдометром", () => {
  const value = draft();
  value.verdict.comment = "Здесь нужен собственный участок переговоров рядом с общим итогом отдела.";
  expect(validatePersonaDraft(value, new Set(["F01"]), { personaId: "lera", enforceVoice: true }).errors).toEqual([]);
});

test("новый цифровой факт в следующем действии тоже блокируется", () => {
  const value = draft();
  value.priorities[0].action = "Запишите, что ваш личный план составил 777%, рядом с общим итогом.";
  expect(validatePersonaDraft(value, new Set(["F01"]), { groundedText: fixture().resume }).errors).toContain("цифровой факт отсутствует в исходном материале");
});

test("repair сохраняет голос, а существующий технический контейнер не меняется", () => {
  expect(editorPrompt(["неверная ссылка"])).toContain("Сохрани характер");
  expect(WRITER_CORE_PROMPT).toContain("Композиц");
  expect(PERSONA_DRAFT_JSON_SCHEMA.required).toEqual(["verdict", "contentBlocks", "priorities", "shareLines"]);
});

async function withStubbedYandex(outputs: Array<PersonaDraft | string>, run: (requests: Array<Record<string, unknown>>) => Promise<void>) {
  const keys = ["AI_PROVIDER", "YANDEX_AI_API_KEY", "YANDEX_AI_FOLDER_ID"];
  const saved = keys.map(k => process.env[k]); const originalFetch = globalThis.fetch;
  const requests: Array<Record<string, unknown>> = [];
  // Never forward a request, even on an unexpected path. Entire transport is local.
  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const output = outputs[Math.min(requests.length - 1, outputs.length - 1)];
    return new Response(JSON.stringify({ choices: [{ message: { content: typeof output === "string" ? output : JSON.stringify(output) }, finish_reason: "stop" }], usage: { prompt_tokens: 20, completion_tokens: 20 } }), { status: 200 });
  };
  process.env.AI_PROVIDER = "yandex"; process.env.YANDEX_AI_API_KEY = "synthetic-test-key"; process.env.YANDEX_AI_FOLDER_ID = "synthetic-folder";
  try { await run(requests); } finally { globalThis.fetch = originalFetch; keys.forEach((k, i) => { if (saved[i] === undefined) delete process.env[k]; else process.env[k] = saved[i]; }); }
}

test("invalid analyst JSON twice fails instead of saving a fake completed review", async () => {
  await withStubbedYandex(['{"unfinished":', '{"unfinished":'], async requests => {
    await expect(runAnalysisPipeline({ resumeText: fixture().resume, personaId: "tamara" }))
      .rejects.toThrow("AI не завершил разбор");
    expect(requests).toHaveLength(2);
    expect(requests.every((request) => (request.response_format as { json_schema?: { strict?: boolean } }).json_schema?.strict === true)).toBe(true);
  });
});

test("Yandex JSON control characters are repaired without accepting unrelated broken JSON", () => {
  expect(JSON.parse(normalizeYandexJsonContent('{"note":"первая строка\nвторая строка"}')))
    .toEqual({ note: "первая строка\nвторая строка" });
  expect(() => normalizeYandexJsonContent('{"note":"unfinished"')).toThrow();
});

test("pipeline передаёт корпус writer, сохраняет выбор и общую аналитику без внешнего запроса", async () => {
  const { resume, assessment } = fixture();
  const authored = draft();
  authored.verdict.findingIds = ["F01"];
  await withStubbedYandex([authored], async requests => {
    const result = await runAnalysisPipeline({ resumeText: resume, professionalAssessment: assessment, personaId: "tamara" });
    expect(requests).toHaveLength(1);
    const messages = requests[0].messages as Array<{ content: string }>;
    const input = JSON.parse(messages[1].content);
    expect(input.voiceCalibration.metadata.selectedIds).toEqual(["T05"]);
    expect(input.assessment).toEqual(assessment);
    expect(input.sourceContext[0].excerpt).toContain(assessment.findings[0].sourceQuote);
    expect(result.report.generationMeta?.voice?.status).toBe("generated");
    expect(result.report.generationMeta?.voice?.selectedIds).toEqual(["T05"]);
    expect(result.report.professionalAssessment).toEqual(assessment);
    expect(result.report.hrReview.deepDive).not.toContain(draft().contentBlocks[1].content);
    expect(result.report.topProblems[0].roast).toBe(assessment.findings[0].interpretation);
    expect(resultPresentation(result.report).quotes).toEqual([assessment.findings[0].sourceQuote]);
    expect(result.report.verdict.comment).toBe(authored.verdict.comment);
  });
});

test("independent perspective reads full resume and does not reuse shared assessment", async () => {
  const { resume, assessment } = fixture();
  const authored = draft();
  authored.verdict.findingIds = ["F01"];
  const previous = process.env.AI_INDEPENDENT_PERSPECTIVE;
  process.env.AI_INDEPENDENT_PERSPECTIVE = "true";
  try {
    await withStubbedYandex([JSON.stringify(assessment), authored], async requests => {
      await runAnalysisPipeline({ resumeText: resume, professionalAssessment: assessment, personaId: "lera" });
      expect(requests).toHaveLength(2);
      const analyst = requests[0].messages as Array<{ content: string }>;
      expect(analyst[0].content).toContain("МИРОВОЗЗРЕНИЕ ЛЕРЫ");
      expect(analyst[1].content).toBe(resume.trim());
      const writer = requests[1].messages as Array<{ content: string }>;
      expect(JSON.parse(writer[1].content).fullResume).toBe(resume);
      expect(JSON.parse(writer[1].content).voiceCalibration.fictionalStyleExamplesNeverCandidateEvidence).toBeUndefined();
      expect(JSON.parse(writer[1].content).voiceCalibration.metadata.selectedIds).toEqual([]);
      expect(writer[0].content).not.toContain("Исходное резюме целиком не передаётся");
    });
  } finally {
    if (previous === undefined) delete process.env.AI_INDEPENDENT_PERSPECTIVE;
    else process.env.AI_INDEPENDENT_PERSPECTIVE = previous;
  }
});

test("final factual review refuses unsupported output rather than saving it", async () => {
  const { resume, assessment } = fixture();
  const authored = draft(); authored.verdict.findingIds = ["F01"];
  const previous = process.env.AI_FINAL_REVIEW;
  process.env.AI_FINAL_REVIEW = "true";
  try {
    await withStubbedYandex([authored, JSON.stringify({ supported: false, reason: "нет подтверждения" })], async requests => {
      await expect(runAnalysisPipeline({ resumeText: resume, professionalAssessment: assessment, personaId: "tamara" })).rejects.toThrow("результат не сохранён");
      expect(requests).toHaveLength(2);
    });
  } finally {
    if (previous === undefined) delete process.env.AI_FINAL_REVIEW;
    else process.env.AI_FINAL_REVIEW = previous;
  }
});

test("factual repair must pass a second review before the result is saved", async () => {
  const { resume, assessment } = fixture();
  const authored = draft(); authored.verdict.findingIds = ["F01"];
  const corrected = draft(); corrected.verdict.findingIds = ["F01"];
  corrected.verdict.comment = "Рядом с командным итогом стоит уточнить собственный участок переговоров.";
  const review = process.env.AI_FINAL_REVIEW, repair = process.env.AI_FINAL_REPAIR;
  process.env.AI_FINAL_REVIEW = "true"; process.env.AI_FINAL_REPAIR = "true";
  try {
    await withStubbedYandex([authored, JSON.stringify({ supported: false, reason: "Нет опоры" }), corrected, JSON.stringify({ supported: true, reason: "" })], async requests => {
      const result = await runAnalysisPipeline({ resumeText: resume, professionalAssessment: assessment, personaId: "tamara" });
      expect(requests).toHaveLength(4);
      expect(result.report.verdict.comment).toBe(corrected.verdict.comment);
      expect(result.report.generationMeta?.stages.map(s => s.name)).toContain("persona-factual-review-retry");
    });
    await withStubbedYandex([authored, JSON.stringify({ supported: false, reason: "Нет опоры" }), corrected, JSON.stringify({ supported: false, reason: "Осталась ошибка" })], async () => {
      await expect(runAnalysisPipeline({ resumeText: resume, professionalAssessment: assessment, personaId: "tamara" })).rejects.toThrow("результат не сохранён");
    });
  } finally {
    if (review === undefined) delete process.env.AI_FINAL_REVIEW; else process.env.AI_FINAL_REVIEW = review;
    if (repair === undefined) delete process.env.AI_FINAL_REPAIR; else process.env.AI_FINAL_REPAIR = repair;
  }
});

test("independent editorial selection is grounded, passed to writer and accounted for", async () => {
  const { resume, assessment } = fixture();
  const authored = draft(); authored.verdict.findingIds = ["F01"];
  const previousPerspective = process.env.AI_INDEPENDENT_PERSPECTIVE;
  const previousSelection = process.env.AI_EDITORIAL_SELECTION;
  process.env.AI_INDEPENDENT_PERSPECTIVE = "true"; process.env.AI_EDITORIAL_SELECTION = "true";
  try {
    await withStubbedYandex([JSON.stringify(assessment), JSON.stringify({ tamara: "F01", lera: "F01", gleb: "F01", vadik: "F01" }), authored], async requests => {
      const result = await runAnalysisPipeline({ resumeText: resume, personaId: "lera" });
      expect(requests).toHaveLength(3);
      const writer = requests[2].messages as Array<{ content: string }>;
      expect(JSON.parse(writer[1].content).selectedAnchor.item.id).toBe("F01");
      expect(result.report.generationMeta?.stages.map(s => s.name)).toContain("persona-editorial-selection");
      expect(result.report.verdict.findingIds).toContain("F01");
    });
  } finally {
    if (previousPerspective === undefined) delete process.env.AI_INDEPENDENT_PERSPECTIVE; else process.env.AI_INDEPENDENT_PERSPECTIVE = previousPerspective;
    if (previousSelection === undefined) delete process.env.AI_EDITORIAL_SELECTION; else process.env.AI_EDITORIAL_SELECTION = previousSelection;
  }
});

test("OpenAI defaults use the independent editorial path and configured writer", async () => {
  const { resume, assessment } = fixture();
  const authored = draft(); authored.verdict.findingIds = ["F01"];
  const keys = ["AI_PROVIDER", "OPENAI_API_KEY", "AI_INDEPENDENT_PERSPECTIVE", "AI_EDITORIAL_SELECTION", "OPENAI_WRITER_MODEL"];
  const saved = keys.map(key => process.env[key]);
  const originalFetch = globalThis.fetch;
  const requests: Array<Record<string, unknown>> = [];
  const outputs = [assessment, { tamara: "F01", lera: "F01", gleb: "F01", vadik: "F01" }, authored];
  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(outputs[requests.length - 1]) }, finish_reason: "stop" }], usage: { prompt_tokens: 20, completion_tokens: 20 } }), { status: 200 });
  };
  process.env.AI_PROVIDER = "openai"; process.env.OPENAI_API_KEY = "synthetic-test-key";
  delete process.env.AI_INDEPENDENT_PERSPECTIVE; delete process.env.AI_EDITORIAL_SELECTION; delete process.env.OPENAI_WRITER_MODEL;
  try {
    const result = await runAnalysisPipeline({ resumeText: resume, professionalAssessment: assessment, personaId: "lera" });
    expect(requests).toHaveLength(3);
    expect(requests[2].model).toBe("gpt-6.1-sol");
    expect(result.report.generationMeta?.stages.map(s => s.name)).toContain("persona-editorial-selection");
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; });
  }
});

test("editorial selection cannot introduce an unknown observation", async () => {
  const { resume, assessment } = fixture();
  const previousPerspective = process.env.AI_INDEPENDENT_PERSPECTIVE;
  const previousSelection = process.env.AI_EDITORIAL_SELECTION;
  process.env.AI_INDEPENDENT_PERSPECTIVE = "true"; process.env.AI_EDITORIAL_SELECTION = "true";
  try {
    await withStubbedYandex([JSON.stringify(assessment), JSON.stringify({ tamara: "F01", lera: "F999", gleb: "F01", vadik: "F01" })], async requests => {
      await expect(runAnalysisPipeline({ resumeText: resume, personaId: "lera" })).rejects.toThrow("выбор наблюдения");
      expect(requests).toHaveLength(2);
    });
  } finally {
    if (previousPerspective === undefined) delete process.env.AI_INDEPENDENT_PERSPECTIVE; else process.env.AI_INDEPENDENT_PERSPECTIVE = previousPerspective;
    if (previousSelection === undefined) delete process.env.AI_EDITORIAL_SELECTION; else process.env.AI_EDITORIAL_SELECTION = previousSelection;
  }
});

test("writer and repair cannot ignore the selected leading observation", async () => {
  const { resume, assessment } = fixture();
  const authored = draft(); authored.verdict.findingIds = [];
  const previousPerspective = process.env.AI_INDEPENDENT_PERSPECTIVE;
  const previousSelection = process.env.AI_EDITORIAL_SELECTION;
  process.env.AI_INDEPENDENT_PERSPECTIVE = "true"; process.env.AI_EDITORIAL_SELECTION = "true";
  try {
    await withStubbedYandex([JSON.stringify(assessment), JSON.stringify({ tamara: "F01", lera: "F01", gleb: "F01", vadik: "F01" }), authored, authored], async requests => {
      const result = await runAnalysisPipeline({ resumeText: resume, personaId: "lera" });
      expect(requests).toHaveLength(4);
      expect(result.report.generationMeta?.voice?.status).toBe("limited");
    });
  } finally {
    if (previousPerspective === undefined) delete process.env.AI_INDEPENDENT_PERSPECTIVE; else process.env.AI_INDEPENDENT_PERSPECTIVE = previousPerspective;
    if (previousSelection === undefined) delete process.env.AI_EDITORIAL_SELECTION; else process.env.AI_EDITORIAL_SELECTION = previousSelection;
  }
});

test("repair получает те же примеры; повторно неверный результат честно ограничивается", async () => {
  const { resume, assessment } = fixture(); const invalid = draft(); invalid.verdict.comment = "У вас 777% личного плана, которые не указаны в исходном материале.";
  await withStubbedYandex([invalid, invalid], async requests => {
    const result = await runAnalysisPipeline({ resumeText: resume, professionalAssessment: assessment, personaId: "tamara" });
    expect(requests).toHaveLength(2);
    const read = (i: number) => JSON.parse((requests[i].messages as Array<{ content: string }>)[1].content);
    expect(read(0).voiceCalibration).toEqual(read(1).voiceCalibration);
    expect(result.report.generationMeta?.voice?.status).toBe("limited");
    expect(result.report.verdict.comment).not.toContain("777");
    expect(new Set(result.report.contentBlocks.map(b => b.content)).size).toBe(result.report.contentBlocks.length);
    expect(result.report.hrReview.deepDive).not.toContain(result.report.hrReview.hiringTake);
  });
});

test("литературная редактура меняет только подтверждённую реплику и учитывается отдельно", async () => {
  const before = process.env.AI_VOICE_POLISH;
  process.env.AI_VOICE_POLISH = "true";
  const { resume, assessment } = fixture();
  const polished = "Общий итог не обязан один рассказывать о ваших переговорах. Покажите рядом собственный участок работы.";
  try {
    await withStubbedYandex([draft(), JSON.stringify({ comment: polished })], async () => {
      const result = await runAnalysisPipeline({ resumeText: resume, professionalAssessment: assessment, personaId: "tamara" });
      expect(result.report.verdict.comment).toBe(polished);
      expect(result.report.contentBlocks).toEqual(draft().contentBlocks);
      expect(result.report.generationMeta?.stages.map(stage => stage.name)).toContain("persona-voice-polish");
    });
  } finally { if (before === undefined) delete process.env.AI_VOICE_POLISH; else process.env.AI_VOICE_POLISH = before; }
});

test("редактура с выдуманным числом отклоняется и исходный ответ сохраняется", async () => {
  const before = process.env.AI_VOICE_POLISH;
  process.env.AI_VOICE_POLISH = "true";
  const { resume, assessment } = fixture();
  try {
    await withStubbedYandex([draft(), JSON.stringify({ comment: "Ваш личный результат — 777%, и это видно в тексте." })], async () => {
      const result = await runAnalysisPipeline({ resumeText: resume, professionalAssessment: assessment, personaId: "tamara" });
      expect(result.report.verdict.comment).toBe(draft().verdict.comment);
      expect(result.report.generationMeta?.stages.map(stage => stage.name)).toContain("persona-voice-polish-rejected");
    });
  } finally { if (before === undefined) delete process.env.AI_VOICE_POLISH; else process.env.AI_VOICE_POLISH = before; }
});
