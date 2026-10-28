import type { VacancyReview } from "@/lib/vacancy";

export type VacancyEvaluationState = "assessed" | "insufficient" | "unavailable";

export function vacancyEvaluationState(review: VacancyReview, comparing: boolean): VacancyEvaluationState {
  if (review.resultMode !== "live") return "unavailable";
  if (!review.vacancyAssessment.requirements.some((requirement) => requirement.kind === "fact")) return "insufficient";
  if (!comparing) return "assessed";
  if (!review.matchAssessment) return "insufficient";
  return review.matchAssessment.matches.some((item) => item.status !== "unknown") ? "assessed" : "insufficient";
}
