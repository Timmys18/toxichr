import type { AnalysisReport } from "@/lib/ai/schemas";

/** Free tier: short letter + 2 punches; full letter / rewrites / plan locked. */
export function redactReportForFree(report: AnalysisReport): AnalysisReport {
  const review = report.hrReview;
  return {
    ...report,
    hrReview: {
      firstImpression: review.firstImpression,
      deepDive: `${review.deepDive.slice(0, 420)}…`,
      hiringTake: review.hiringTake,
      fixPriority: "Открой полный разбор — там приоритет правок целиком.",
    },
    topProblems: report.topProblems.slice(0, 2).map((p) => ({
      id: p.id,
      severity: p.severity,
      title: p.title,
      quote: p.quote,
      roast: p.roast,
      diagnosis: p.diagnosis,
      recommendation: p.recommendation,
    })),
    strengths: [],
    theatreFindings: report.theatreFindings.slice(0, 3),
    shareQuotes: report.shareQuotes.slice(0, 2),
    improvementPlan: [],
  };
}
