import { NextResponse } from "next/server";
import {
  hasProductAccess,
  isBetaPaywallEnabled,
  PAID_ACTION_PRICE_RUB,
  productCodeFor,
  type PaidProduct,
} from "@/lib/payments";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const analysisId = url.searchParams.get("analysisId");
  const product = url.searchParams.get("product") as PaidProduct | null;
  const vacancyId = url.searchParams.get("vacancyId");
  if (!analysisId) {
    return NextResponse.json({ error: "analysisId required" }, { status: 400 });
  }
  if (product !== "resume_rewrite" && product !== "vacancy_match") {
    return NextResponse.json({ error: "Неизвестное платное действие." }, { status: 400 });
  }
  if (product === "vacancy_match" && !vacancyId) {
    return NextResponse.json({ error: "Для сопоставления нужна вакансия." }, { status: 400 });
  }

  const productCode = productCodeFor(product, vacancyId);

  return NextResponse.json({
    paywallEnabled: isBetaPaywallEnabled(),
    hasAccess: await hasProductAccess(analysisId, productCode),
    priceRub: PAID_ACTION_PRICE_RUB,
  });
}
