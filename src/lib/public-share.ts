import { randomBytes } from "node:crypto";
import { z } from "zod";
import type {
  AnonymizationSettings,
  ShareFormat,
  ShareMetricKey,
  ShareMode,
} from "@/lib/share-studio";

export const PublicSharePayloadSchema = z.object({
  personaId: z.string(),
  personaName: z.string(),
  personaTitle: z.string(),
  verdictTitle: z.string(),
  quote: z.string(),
  scoreTotal: z.number().min(0).max(100),
  metrics: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        value: z.number(),
      }),
    )
    .max(4),
  roleLabel: z.string().nullable(),
  levelLabel: z.string().nullable(),
  mode: z.enum(["pro", "loud", "progress", "challenge"]),
  format: z.enum(["og", "square", "story"]),
  caption: z.string(),
});

export type PublicSharePayload = z.infer<typeof PublicSharePayloadSchema>;

export const CreatePublicShareSchema = z.object({
  analysisId: z.string().min(1),
  mode: z.enum(["pro", "loud", "progress", "challenge"]),
  format: z.enum(["og", "square", "story"]).default("og"),
  quoteId: z.string().min(1),
  metrics: z
    .array(
      z.enum([
        "total",
        "evidence",
        "positioning",
        "corporateWater",
        "seniorityConsistency",
      ]),
    )
    .min(1)
    .max(4),
  anonymization: z.object({
    showName: z.boolean(),
    showPhoto: z.boolean(),
    showCompanies: z.boolean(),
    showRole: z.boolean(),
    showLevel: z.boolean(),
  }),
});

export type CreatePublicShareInput = z.infer<typeof CreatePublicShareSchema>;

/** Non-sequential, unguessable slug — no PII. */
export function createShareSlug(): string {
  return randomBytes(9).toString("base64url");
}

export function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "http://localhost:3000"
  );
}

export function publicToastPath(slug: string): string {
  return `/toast/${slug}`;
}

export function publicToastUrl(slug: string): string {
  return `${appBaseUrl()}${publicToastPath(slug)}`;
}

export function telegramShareUrl(url: string, text: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
}

export function xShareUrl(url: string, text: string): string {
  return `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
}

export function linkedInShareUrl(url: string): string {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
}

export function facebookShareUrl(url: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
}

export type MetricSelection = ShareMetricKey[];

export function resolveMetricValues(
  score: {
    total: number;
    evidence: number;
    positioning: number;
    seniorityConsistency: number;
  },
  viral: { corporateWater: number },
  keys: MetricSelection,
): { key: string; label: string; value: number }[] {
  const labels: Record<ShareMetricKey, string> = {
    total: "Выживаемость",
    evidence: "Доказанность",
    positioning: "Ясность",
    corporateWater: "Корп. вода",
    seniorityConsistency: "Уровень",
  };
  const map: Record<ShareMetricKey, number> = {
    total: score.total,
    evidence: score.evidence,
    positioning: score.positioning,
    corporateWater: viral.corporateWater,
    seniorityConsistency: score.seniorityConsistency,
  };
  return keys.map((key) => ({
    key,
    label: labels[key],
    value: map[key],
  }));
}

export type { AnonymizationSettings, ShareFormat, ShareMode };
