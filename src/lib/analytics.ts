export type AnalyticsEvent =
  | "landing_viewed"
  | "resume_upload_started"
  | "resume_uploaded"
  | "resume_parse_failed"
  | "persona_recommended"
  | "persona_selected"
  | "analysis_started"
  | "analysis_completed"
  | "verdict_viewed"
  | "report_opened"
  | "annotation_feedback"
  | "share_studio_opened"
  | "share_variant_selected"
  | "share_text_copied"
  | "share_platform_opened"
  | "share_created"
  | "public_share_created"
  | "public_share_revoked"
  | "public_share_viewed"
  | "public_cta_clicked"
  | "challenge_created"
  | "challenge_joined"
  | "referral_converted"
  | "auth_registered"
  | "analysis_claimed"
  | "account_deleted"
  | "checkout_started"
  | "payment_completed";

type EventProps = Record<string, string | number | boolean | null | undefined>;

/** Client/server stub — no PII. Wire to PostHog/Amplitude later. */
export function track(event: AnalyticsEvent, props?: EventProps) {
  if (process.env.NODE_ENV === "development") {
    console.info("[analytics]", event, props ?? {});
  }
  // TODO: send to analytics provider
}

export const trackServer = track;
