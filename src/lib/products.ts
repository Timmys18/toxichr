export const PRODUCT_FULL_REPORT = "full_report";

export function fullReportPriceCents(): number {
  const raw = Number(process.env.STRIPE_PRICE_FULL_REPORT ?? "990");
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 990;
}

export function stripeEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.startsWith("sk_"));
}

/**
 * Оплата включена только явно: PAYWALL_ENABLED=true.
 * Пока false — полный отчёт открыт всем (закрытый тест).
 */
export function paywallEnabled(): boolean {
  return process.env.PAYWALL_ENABLED === "true";
}

/** Mock-оплата только если пейвол включён и это не боевой Stripe. */
export function allowMockCheckout(): boolean {
  if (!paywallEnabled()) return false;
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.ALLOW_MOCK_CHECKOUT === "false") return false;
  return !stripeEnabled();
}
