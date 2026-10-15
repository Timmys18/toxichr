import { expect, test } from "@playwright/test";
import { parseGroundedAssessment, PROFESSIONAL_ASSESSMENT_JSON_SCHEMA, ProfessionalAssessmentSchema } from "../../src/lib/ai/professional-assessment";
import { personaFocus } from "../../src/lib/ai/persona-focus";
import { MATCH_ASSESSMENT_JSON_SCHEMA, MatchAssessmentSchema, VACANCY_ASSESSMENT_JSON_SCHEMA, VACANCY_PERSONA_JSON_SCHEMA } from "../../src/lib/vacancy";

const source = "Руководил командой из пяти инженеров. Лично подготовил план миграции. Сократил время восстановления сервиса. Не утверждал бюджет.";
function assessment() {
  return ProfessionalAssessmentSchema.parse({
    candidateContext: { primaryProfession: "инженер", secondaryContext: "", claimedLevel: "", inferredLevel: "", industry: "", careerPattern: "", confidence: 0.9 },
    professionalAssessment: { overallImpression: "В резюме описаны руководство и собственное техническое действие.", strongestProfessionalSignal: "Личная подготовка плана миграции описана прямо.", mainResumeProblem: "Не определено, что именно требуется уточнить.", seniorityConsistency: "Уровень по этому фрагменту не устанавливается.", resumeVsExperienceGap: "Неуказанные сведения не означают отсутствие опыта." },
    findings: [{ id: "F01", sourceQuote: "Руководил командой из пяти инженеров.", interpretation: "Недостаточно информации о теоретических знаниях и владении инструментами.", whyItMatters: "Иначе нельзя судить о навыках специалиста.", severity: "medium", confidence: "high", issueType: "неизвестные навыки" }],
    strengths: [
      { id: "S01", sourceQuote: "Руководил командой из пяти инженеров.", interpretation: "Указан масштаб руководства командой." },
      { id: "S02", sourceQuote: "Лично подготовил план миграции.", interpretation: "Показано личное действие." },
      { id: "S03", sourceQuote: "Сократил время восстановления сервиса.", interpretation: "Описан эффект и связь действий с результатом." },
    ],
    questionsCreatedByResume: [], uncertainties: [], claimsNotAllowed: [],
  });
}

test("отсутствие посторонних сведений не превращается в подтверждённый недостаток", () => {
  const result = parseGroundedAssessment(assessment(), source);
  expect(result.assessment?.findings).toEqual([]);
  expect(result.assessment?.uncertainties.join(" ")).toContain("теоретических знаниях");
  expect(result.assessment?.professionalAssessment.mainResumeProblem).toContain("не установлен");
  expect(result.assessment?.strengths).toHaveLength(3);
});

test("оптики выбирают разные подтверждённые сигналы, а не первый по порядку", () => {
  const item = assessment(); item.findings = [];
  const selected = (["tamara", "gleb", "vadik"] as const).map(persona => personaFocus(item, persona).evidence[0]?.id);
  expect(selected).toEqual(["S01", "S03", "S02"]);
});

test("передаваемые модели JSON-схемы не разрешают строки длиннее локального контракта", () => {
  type Node = { properties?: Record<string, Node>; items?: Node; maxLength?: number };
  const professional = PROFESSIONAL_ASSESSMENT_JSON_SCHEMA as Node;
  expect(professional.properties?.findings.items?.properties?.sourceQuote.maxLength).toBe(500);
  expect(professional.properties?.findings.items?.properties?.interpretation.maxLength).toBe(900);
  const match = MATCH_ASSESSMENT_JSON_SCHEMA as Node;
  expect(match.properties?.decision.properties?.headline.maxLength).toBe(180);
  expect(match.properties?.matches.items?.properties?.resumeQuotes.items?.maxLength).toBe(700);
  const vacancy = VACANCY_ASSESSMENT_JSON_SCHEMA as Node;
  expect(vacancy.properties?.requirements.items?.properties?.sourceQuote.maxLength).toBe(700);
  const writer = VACANCY_PERSONA_JSON_SCHEMA as Node;
  expect(writer.properties?.contentBlocks.items?.properties?.content.maxLength).toBe(1_000);
  expect(MatchAssessmentSchema.shape.decision.safeParse({ code: "apply", headline: "а".repeat(181), reasoning: "Сопоставление подтверждается данными резюме." }).success).toBe(false);
});
