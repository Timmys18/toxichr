import { z } from "zod";

export const CandidateProfileSchema = z.object({
  primaryRole: z.string(),
  professionalFamily: z.string(),
  inferredLevel: z.string(),
  claimedLevel: z.string(),
  industry: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

export const ScoreSchema = z.object({
  total: z.number().min(0).max(100),
  positioning: z.number().min(0).max(100),
  evidence: z.number().min(0).max(100),
  personalContribution: z.number().min(0).max(100),
  scale: z.number().min(0).max(100),
  seniorityConsistency: z.number().min(0).max(100),
  careerLogic: z.number().min(0).max(100),
  structure: z.number().min(0).max(100),
  language: z.number().min(0).max(100),
});

export const ViralMetricsSchema = z.object({
  corporateWater: z.number().min(0).max(100),
  careerPathos: z.number().min(0).max(100),
  aiLanguageProbability: z.number().min(0).max(100),
  responsibilitiesCount: z.number().int().min(0),
  achievementsCount: z.number().int().min(0),
  unprovenClaimsCount: z.number().int().min(0),
  participialCoefficient: z.number().min(0).max(100),
});

export const VerdictSchema = z.object({
  title: z.string().min(3),
  comment: z.string().min(10),
});

/** Развёрнутый разбор HR — главный продукт, не набор карточек. */
export const HrReviewSchema = z.object({
  firstImpression: z.string().min(80),
  deepDive: z.string().min(200),
  hiringTake: z.string().min(60),
  fixPriority: z.string().min(60),
});

export const ProblemSchema = z.object({
  id: z.string(),
  severity: z.enum(["critical", "high", "medium", "low"]),
  title: z.string(),
  quote: z.string(),
  roast: z.string(),
  diagnosis: z.string(),
  recommendation: z.string(),
  suggestedRewrite: z.string().optional(),
});

export const StrengthSchema = z.object({
  id: z.string(),
  title: z.string(),
  quote: z.string().optional(),
  comment: z.string(),
});

export const TheatreFindingSchema = z.object({
  id: z.string(),
  stage: z.string(),
  message: z.string(),
});

export const ShareQuoteSchema = z.object({
  id: z.string(),
  kind: z.enum(["precise", "funny", "safe"]),
  text: z.string(),
});

export const ImprovementStepSchema = z.object({
  id: z.string(),
  horizon: z.enum(["10m", "30m", "recall"]),
  action: z.string().min(8),
  problemIds: z.array(z.string()).optional(),
});

export const AnalysisReportSchema = z.object({
  candidateProfile: CandidateProfileSchema,
  score: ScoreSchema,
  viralMetrics: ViralMetricsSchema,
  verdict: VerdictSchema,
  hrReview: HrReviewSchema,
  topProblems: z.array(ProblemSchema).min(1).max(12),
  strengths: z.array(StrengthSchema).max(6),
  theatreFindings: z.array(TheatreFindingSchema).min(3),
  shareQuotes: z.array(ShareQuoteSchema).min(1).max(5),
  improvementPlan: z.array(ImprovementStepSchema).max(9).default([]),
  recommendedPersonaId: z.enum(["tamara", "lera", "gleb", "vadik"]),
  recommendationReason: z.string(),
});

export type Strength = z.infer<typeof StrengthSchema>;
export type Problem = z.infer<typeof ProblemSchema>;
export type TheatreFinding = z.infer<typeof TheatreFindingSchema>;
export type ImprovementStep = z.infer<typeof ImprovementStepSchema>;
export type HrReview = z.infer<typeof HrReviewSchema>;
export type AnalysisReport = z.infer<typeof AnalysisReportSchema>;
