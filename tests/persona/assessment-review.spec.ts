import { expect, test } from "@playwright/test";
import { applyAssessmentReview } from "../../src/lib/ai/assessment-review";
import { ProfessionalAssessmentSchema } from "../../src/lib/ai/professional-assessment";

const assessment = ProfessionalAssessmentSchema.parse({
  candidateContext: { primaryProfession: "координатор", secondaryContext: "смена", claimedLevel: "координатор", inferredLevel: "не указан", industry: "не указан", careerPattern: "неясен", confidence: 0.8 },
  professionalAssessment: { overallImpression: "Автор подготовила общий журнал заявок для передачи смены.", strongestProfessionalSignal: "Подготовлен общий журнал заявок.", mainResumeProblem: "Неизвестно кто подготовил журнал.", seniorityConsistency: "Уровень не установлен.", resumeVsExperienceGap: "Неописанное не означает отсутствия." },
  findings: [{ id: "F01", sourceQuote: "Подготовила единый журнал.", interpretation: "Неизвестно кто подготовил журнал.", whyItMatters: "Не видна авторская роль в подготовке документа.", severity: "medium", confidence: "high", issueType: "роль" }],
  strengths: [{ id: "S01", sourceQuote: "Подготовила единый журнал.", interpretation: "Подготовлен общий журнал для смены." }], questionsCreatedByResume: ["Кто готовил журнал?"], uncertainties: [], claimsNotAllowed: [],
});

test("semantic rejection removes stale finding and derived summaries", () => {
  const result = applyAssessmentReview(assessment, { decisions: [{ id: "F01", supported: false, reason: "действие прямо указано" }, { id: "S01", supported: true, reason: "цитата подтверждает" }] });
  expect(result.findings).toHaveLength(0);
  expect(JSON.stringify(result.professionalAssessment)).not.toContain("Неизвестно кто подготовил");
  expect(result.questionsCreatedByResume).toEqual([]);
  expect(result.strengths).toEqual(assessment.strengths);
});
test("review cannot omit, duplicate or invent observation IDs", () => {
  expect(() => applyAssessmentReview(assessment, { decisions: [{ id: "F01", supported: true, reason: "ok" }] })).toThrow();
  expect(() => applyAssessmentReview(assessment, { decisions: [{ id: "F01", supported: true, reason: "ok" }, { id: "F99", supported: true, reason: "ok" }] })).toThrow();
});
