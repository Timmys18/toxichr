const EMAIL_RE =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE =
  /(?:\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g;
const TELEGRAM_RE = /@[a-zA-Z0-9_]{4,}/g;
const URL_RE = /https?:\/\/[^\s]+/gi;

export type RedactionResult = {
  sanitizedText: string;
  redactedCount: number;
};

export function redactPii(text: string): RedactionResult {
  let sanitized = text;
  let redactedCount = 0;

  for (const re of [EMAIL_RE, PHONE_RE, TELEGRAM_RE, URL_RE]) {
    const matches = sanitized.match(re);
    if (matches) {
      redactedCount += matches.length;
      sanitized = sanitized.replace(re, "[скрыто]");
    }
  }

  return { sanitizedText: sanitized.trim(), redactedCount };
}
