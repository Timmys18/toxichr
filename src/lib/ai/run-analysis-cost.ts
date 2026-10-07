import type { AiResponse } from "./gateway";

export type AnalysisCost = NonNullable<AiResponse["cost"]>;

export function aggregateAnalysisCost(costs: Array<AnalysisCost | undefined>): AnalysisCost | undefined {
  const present = costs.filter((cost): cost is AnalysisCost => Boolean(cost && Number.isFinite(cost.amount) && cost.amount >= 0));
  if (!present.length) return undefined;
  const currency = present[0].currency;
  if (present.some((cost) => cost.currency !== currency)) return undefined;
  return { amount: present.reduce((total, cost) => total + cost.amount, 0), currency };
}

/** Keep the historical numeric columns populated while persisting exact provider currency. */
export function analysisCostFields(cost?: AnalysisCost, legacyCostUsd = 0) {
  const normalized = cost ?? { amount: legacyCostUsd, currency: "USD" as const };
  return {
    cost: legacyCostUsd,
    costAmount: normalized.amount,
    costCurrency: normalized.currency,
  };
}
