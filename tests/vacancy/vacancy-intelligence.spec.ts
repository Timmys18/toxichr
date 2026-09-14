import { expect, test } from "@playwright/test";
import {
  MATCH_ASSESSMENT_VERSION,
  MatchAssessmentSchema,
  reviewVacancy,
  isCurrentVacancyReview,
  StructuredVacancyAssessmentSchema,
  validateMatchAssessment,
  VACANCY_ASSESSMENT_JSON_SCHEMA,
  VACANCY_ASSESSMENT_VERSION,
  MATCH_ASSESSMENT_JSON_SCHEMA,
  vacancyFingerprint,
  writeVacancyPersona,
  writeVacancyWriter,
  cleanAssessment,
} from "../../src/lib/vacancy";
import type { ProfessionalAssessment } from "../../src/lib/ai/professional-assessment";
import { vacancyResultUrl } from "../../src/lib/navigation";

const vacancy = {
  schemaVersion: VACANCY_ASSESSMENT_VERSION,
  vacancyFingerprint: "0123456789abcdef",
  title: "Руководитель продукта",
  roleReality: "Роль отвечает за продуктовую стратегию и результаты запуска.",
  whoTheySeek: "Нужен руководитель с опытом запуска и управления продуктом.",
  mainTask: "Запустить и развивать продукт вместе с командой.",
  requirements: [
    { id: "VR01", text: "Запускать продукты", sourceQuote: "Запускать продукты", priority: "critical", kind: "fact", interpretation: "Ключевая задача роли." },
    { id: "VR02", text: "Управлять командой", sourceQuote: "Управлять командой", priority: "critical", kind: "fact", interpretation: "Нужен управленческий опыт." },
    { id: "VR03", text: "Работать с зарубежными поставщиками", sourceQuote: "Работать с зарубежными поставщиками", priority: "secondary", kind: "fact", interpretation: "Вторичный профессиональный контекст." },
  ],
  contradictions: [], risks: [], clarificationPoints: [], employerQuestions: ["Как измеряется результат роли?"],
};

const baseMatch = {
  schemaVersion: MATCH_ASSESSMENT_VERSION,
  decision: { code: "apply" as const, headline: "Откликайся", reasoning: "Есть прямой опыт запуска продукта и управления командой." },
  matches: [
    { requirementId: "VR01", status: "strong_match" as const, resumeEvidenceIds: ["S01"], resumeQuotes: ["Запустил новый сервис для клиентов."], explanation: "Прямое подтверждение запуска." },
    { requirementId: "VR02", status: "hidden_match" as const, resumeEvidenceIds: ["F01"], resumeQuotes: ["Координировал работу команды из пяти человек."], explanation: "Опыт есть, но его нужно подать как управление." },
    { requirementId: "VR03", status: "unknown" as const, resumeEvidenceIds: [], resumeQuotes: [], explanation: "Резюме этого не показывает; это не вывод о возможностях человека." },
  ],
  whyInviteRequirementIds: ["VR01"], whyRejectRequirementIds: [], preApplyFixes: [{ requirementIds: ["VR02"], action: "Назови свою управленческую роль рядом с координацией команды.", boundary: "Не добавляй полномочия, которых не было." }], unknownRequirementIds: ["VR03"], candidateQuestions: ["Какой ваш личный вклад в запуске?"], employerQuestions: ["Как измеряется результат роли?"], limits: ["Зарубежные поставщики не подтверждены резюме."],
};
const vacancyAssessment = StructuredVacancyAssessmentSchema.parse(vacancy);
const matchAssessment = MatchAssessmentSchema.parse(baseMatch);
const resumeAssessment: ProfessionalAssessment = {
  candidateContext: { primaryProfession: "продуктовый менеджер", secondaryContext: "B2B", claimedLevel: "руководитель", inferredLevel: "руководитель", industry: "технологии", careerPattern: "продуктовый рост", confidence: 0.8 },
  professionalAssessment: { overallImpression: "Опыт запуска и развития продукта отражён в тексте.", strongestProfessionalSignal: "Запуск сервиса и координация команды.", mainResumeProblem: "Нужно точнее показать полномочия.", seniorityConsistency: "Уровень нужно связать с масштабом роли.", resumeVsExperienceGap: "Часть фактов не вынесена в позиционирование." },
  findings: [{ id: "F01", sourceQuote: "Координировал работу команды из пяти человек.", interpretation: "Есть опыт координации команды.", whyItMatters: "Это связано с управленческим требованием.", severity: "medium", confidence: "high", issueType: "управление" }],
  strengths: [{ id: "S01", sourceQuote: "Запустил новый сервис для клиентов.", interpretation: "Есть прямой факт запуска продукта." }],
  questionsCreatedByResume: [], uncertainties: [], claimsNotAllowed: [],
};

test("извлечение не теряет Kafka, а match не пропускает requirementId", () => {
  const source = "Требуются Go, Kafka и Kubernetes.";
  const raw = { ...vacancyAssessment, vacancyFingerprint: vacancyFingerprint(source), requirements: [
    { ...vacancyAssessment.requirements[0], id: "VR01", text: "Опыт работы с Go", sourceQuote: source },
    { ...vacancyAssessment.requirements[0], id: "VR02", text: "Опыт работы с Kubernetes", sourceQuote: source },
  ] };
  expect(cleanAssessment(raw, source)).toBeNull();
  raw.requirements.push({ ...raw.requirements[0], id: "VR03", text: "Опыт работы с Kafka" });
  expect(cleanAssessment(raw, source)?.requirements).toHaveLength(3);
  expect(cleanAssessment({ ...raw, requirements: raw.requirements.map((item) => ({ ...item, sourceQuote: `«${source}»` })) }, source)?.requirements).toHaveLength(3);
  expect(validateMatchAssessment({ ...matchAssessment, matches: matchAssessment.matches.slice(0, 2) }, vacancyAssessment, resumeAssessment)).toBeNull();
});

test("извлечение сохраняет каждую явно перечисленную обязанность", () => {
  const source = "Нужно брать кровь, вести журнал температур и контролировать укладки. Требуется сертификат.";
  const raw = { ...vacancyAssessment, vacancyFingerprint: vacancyFingerprint(source), requirements: [
    { ...vacancyAssessment.requirements[0], id: "VR01", text: "Брать кровь", sourceQuote: "брать кровь" },
    { ...vacancyAssessment.requirements[0], id: "VR02", text: "Сертификат", sourceQuote: "Требуется сертификат" },
  ] };
  expect(cleanAssessment(raw, source)).toBeNull();
  const complete = { ...raw, requirements: [
    ...raw.requirements,
    { ...raw.requirements[0], id: "VR03", text: "Вести журнал температур", sourceQuote: "вести журнал температур" },
    { ...raw.requirements[0], id: "VR04", text: "Контролировать укладки", sourceQuote: "контролировать укладки" },
  ] };
  expect(cleanAssessment(complete, source)?.requirements).toHaveLength(4);
});

test("косвенная финансовая метрика не подтверждает P&L", () => {
  const pnlVacancy = { ...vacancyAssessment, requirements: [{ ...vacancyAssessment.requirements[0], text: "Отвечать за P&L" }] };
  const pnlMatch = { ...matchAssessment, matches: [{ ...matchAssessment.matches[0], status: "hidden_match", requirementId: "VR01" }], whyInviteRequirementIds: ["VR01"], preApplyFixes: [], unknownRequirementIds: [] };
  expect(validateMatchAssessment(pnlMatch, pnlVacancy, resumeAssessment)).toBeNull();
  const financialMetric = { ...resumeAssessment, strengths: [{ ...resumeAssessment.strengths[0], sourceQuote: "Финансовый результат проекта вырос на 10%." }] };
  expect(validateMatchAssessment(pnlMatch, pnlVacancy, financialMetric)).toBeNull();
  const unknown = { ...pnlMatch, matches: [{ ...pnlMatch.matches[0], status: "unknown", resumeEvidenceIds: [], resumeQuotes: [], explanation: "Резюме этого не показывает." }], whyInviteRequirementIds: [], unknownRequirementIds: ["VR01"] };
  expect(validateMatchAssessment(unknown, pnlVacancy, resumeAssessment)?.matches[0].status).toBe("unknown");
});

test("unknown не привязывает соседний факт как подтверждение требования", () => {
  const wrong = { ...matchAssessment, matches: matchAssessment.matches.map((item) => item.requirementId === "VR03"
    ? { ...item, resumeEvidenceIds: ["S01"], resumeQuotes: ["Запустил новый сервис для клиентов."] }
    : item) };
  expect(validateMatchAssessment(wrong, vacancyAssessment, resumeAssessment)).toBeNull();
  expect(validateMatchAssessment(matchAssessment, vacancyAssessment, resumeAssessment)?.matches[2].status).toBe("unknown");
});

test("отсутствие допуска к МРТ не становится gap для КТ", () => {
  const medicalResume = { ...resumeAssessment, strengths: [{ ...resumeAssessment.strengths[0], sourceQuote: "Самостоятельного допуска к ремонту МРТ нет." }] };
  const item = { ...matchAssessment.matches[0], status: "gap" as const, resumeEvidenceIds: ["S01"], resumeQuotes: ["Самостоятельного допуска к ремонту МРТ нет."], explanation: "Нет подтверждённого допуска." };
  const medicalMatch = { ...matchAssessment, decision: { ...matchAssessment.decision, code: "skip" as const }, matches: [item], whyInviteRequirementIds: [], whyRejectRequirementIds: ["VR01"], unknownRequirementIds: [], preApplyFixes: [] };
  const requirement = { ...vacancyAssessment.requirements[0], text: "Самостоятельно ремонтировать КТ", sourceQuote: "Самостоятельно ремонтировать КТ" };
  expect(validateMatchAssessment(medicalMatch, { ...vacancyAssessment, requirements: [requirement] }, medicalResume)).toBeNull();
  expect(validateMatchAssessment(medicalMatch, { ...vacancyAssessment, requirements: [{ ...requirement, text: "Самостоятельно ремонтировать МРТ" }] }, medicalResume)?.matches[0].status).toBe("gap");
});

test("структурированная оценка вакансии и match используют только связные идентификаторы", () => {
  expect(StructuredVacancyAssessmentSchema.safeParse(vacancyAssessment).success).toBe(true);
  expect(MatchAssessmentSchema.safeParse(matchAssessment).success).toBe(true);
  expect(matchAssessment.matches.find((item) => item.status === "unknown")?.explanation).toContain("Резюме этого не показывает");
});

test("strict JSON Schema у обоих AI-этапов объявляет тип версии", () => {
  const vacancyProperties = VACANCY_ASSESSMENT_JSON_SCHEMA.properties as Record<string, { type?: string }>;
  const matchProperties = MATCH_ASSESSMENT_JSON_SCHEMA.properties as Record<string, { type?: string }>;
  expect(vacancyProperties.schemaVersion.type).toBe("string");
  expect(matchProperties.schemaVersion.type).toBe("string");
});

test("ссылка повторной проверки всегда сохраняет разбор и вакансию", () => {
  const target = new URL(vacancyResultUrl("analysis with space", "vacancy/42"), "http://localhost");
  expect(target.pathname).toBe("/vacancy");
  expect(target.searchParams.get("analysisId")).toBe("analysis with space");
  expect(target.searchParams.get("vacancyId")).toBe("vacancy/42");
});

test("изменённый текст вакансии делает сохранённый результат устаревшим", () => {
  const sourceText = vacancy.requirements.map((item) => item.sourceQuote).join("\n");
  const result = {
    schemaVersion: VACANCY_ASSESSMENT_VERSION,
    vacancyAssessment: { ...vacancyAssessment, vacancyFingerprint: vacancyFingerprint(sourceText) },
    matchAssessment,
    persona: { id: "lera" as const, comment: "Короткий комментарий.", contentBlocks: [{ type: "summary" as const, requirementIds: [], content: "Сопоставление по фактам резюме." }] },
  };
  expect(isCurrentVacancyReview(result, sourceText)).toBe(true);
  expect(isCurrentVacancyReview(result, `${sourceText}\nНовое обязательное требование.`)).toBe(false);
});

test("решения об отклике представлены всеми четырьмя исходами без процентов", () => {
  const codes = ["apply", "revise", "explain_gap", "skip"] as const;
  for (const code of codes) {
    const value = { ...matchAssessment, decision: { ...matchAssessment.decision, code } };
    expect(MatchAssessmentSchema.safeParse(value).success).toBe(true);
  }
});

test("skip возможен только при критичном разрыве, а unknown сам по себе его не создаёт", () => {
  const onlyUnknown = {
    ...matchAssessment,
    decision: { ...matchAssessment.decision, code: "skip" as const },
    matches: matchAssessment.matches.map((item) => ({ ...item, status: "unknown" as const, resumeEvidenceIds: [], resumeQuotes: [] })),
  };
  expect(validateMatchAssessment(onlyUnknown, vacancyAssessment, resumeAssessment)).toBeNull();

  const withCriticalGap = {
    ...onlyUnknown,
    matches: onlyUnknown.matches.map((item) => item.requirementId === "VR01" ? { ...item, status: "gap" as const } : item),
  };
  expect(validateMatchAssessment(withCriticalGap, vacancyAssessment, resumeAssessment)?.decision.code).toBe("skip");
});

test("динамический match целиком проходит общий lexical gate", () => {
  const bannedCopy = {
    ...matchAssessment,
    decision: { ...matchAssessment.decision, reasoning: `Это ${"док" + "азательство"} не нужно.` },
  };
  expect(validateMatchAssessment(bannedCopy, vacancyAssessment, resumeAssessment)).toBeNull();
});

test("match восстанавливает точные цитаты по выбранным evidenceId", () => {
  const paraphrased = {
    ...matchAssessment,
    matches: matchAssessment.matches.map((item) => item.requirementId === "VR01"
      ? { ...item, resumeQuotes: ["Запускал сервис для пользователей."] }
      : item),
  };
  const validated = validateMatchAssessment(paraphrased, vacancyAssessment, resumeAssessment);
  expect(validated?.matches[0].resumeQuotes).toEqual(["Запустил новый сервис для клиентов."]);
});

test("общий автор вакансии не подменяется персоной и проходит общий lexical gate", async () => {
  const before = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = "mock";
  try {
    const writer = await writeVacancyWriter(vacancyAssessment);
    const review = await reviewVacancy({ vacancyText: "Руководитель продукта\nЗапускать продукты и управлять командой. Важно объяснить результат работы." });
    expect(writer.comment).not.toContain("Лера");
    expect(review.persona.id).toBe("vacancy");
  } finally {
    process.env.AI_PROVIDER = before;
  }
});

test("один match даёт одинаковые факты и разные голоса четырёх HR", async () => {
  const before = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = "mock";
  try {
    const outputs = await Promise.all((["tamara", "lera", "gleb", "vadik"] as const).map((persona) => writeVacancyPersona(persona, vacancyAssessment, matchAssessment)));
    expect(new Set(outputs.map((item) => item.comment)).size).toBe(4);
    expect(matchAssessment.decision.code).toBe("apply");
    expect(matchAssessment.matches.map((item) => item.requirementId)).toEqual(["VR01", "VR02", "VR03"]);
  } finally {
    process.env.AI_PROVIDER = before;
  }
});
