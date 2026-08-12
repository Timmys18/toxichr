import { getOrCreateVisitorId } from "@/lib/referral-client";

export const ANALYTICS_EVENTS = [
  "landing_viewed",
  "resume_upload_started",
  "resume_uploaded",
  "resume_parse_failed",
  "persona_recommended",
  "persona_selected",
  "analysis_started",
  "analysis_completed",
  "verdict_viewed",
  "report_opened",
  "annotation_feedback",
  "share_studio_opened",
  "share_variant_selected",
  "share_text_copied",
  "share_platform_opened",
  "share_created",
  "public_share_created",
  "public_share_revoked",
  "public_share_viewed",
  "public_cta_clicked",
  "challenge_created",
  "challenge_joined",
  "referral_converted",
  "resume_fix_opened",
  "vacancy_review_opened",
  "auth_registered",
  "analysis_claimed",
  "account_deleted",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

type EventProps = Record<string, string | number | boolean | null | undefined>;

export function track(event: AnalyticsEvent, props?: EventProps) {
  if (typeof window === "undefined") return;

  void fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event,
      visitorId: getOrCreateVisitorId(),
      props: props ?? {},
    }),
    keepalive: true,
  }).catch(() => undefined);
}
