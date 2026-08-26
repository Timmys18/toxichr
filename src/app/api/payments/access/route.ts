import { NextResponse } from "next/server";
import { hasRevengeAccess, isBetaPaywallEnabled, REVENGE_PRICE_RUB } from "@/lib/payments";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const analysisId = url.searchParams.get("analysisId");
  if (!analysisId) {
    return NextResponse.json({ error: "analysisId required" }, { status: 400 });
  }

  return NextResponse.json({
    paywallEnabled: isBetaPaywallEnabled(),
    hasAccess: await hasRevengeAccess(analysisId),
    priceRub: REVENGE_PRICE_RUB,
  });
}
