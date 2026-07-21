import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import {
  PRODUCT_FULL_REPORT,
  fullReportPriceCents,
  stripeEnabled,
  allowMockCheckout,
  paywallEnabled,
} from "@/lib/products";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!stripeEnabled()) return null;
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return stripeClient;
}

export async function hasFullReportAccess(
  analysisId: string,
  userId?: string | null,
) {
  // Закрытый тест: всё после «оплаты» открыто, пока пейвол не включён.
  if (!paywallEnabled()) return true;

  const grant = await prisma.accessGrant.findUnique({
    where: {
      analysisId_productCode: {
        analysisId,
        productCode: PRODUCT_FULL_REPORT,
      },
    },
  });
  if (!grant) return false;
  if (!grant.userId) return true;
  if (!userId) return false;
  return grant.userId === userId;
}

export async function grantFullReport(input: {
  analysisId: string;
  userId?: string | null;
  paymentId?: string | null;
  source?: string;
}) {
  return prisma.accessGrant.upsert({
    where: {
      analysisId_productCode: {
        analysisId: input.analysisId,
        productCode: PRODUCT_FULL_REPORT,
      },
    },
    create: {
      analysisId: input.analysisId,
      userId: input.userId ?? null,
      paymentId: input.paymentId ?? null,
      productCode: PRODUCT_FULL_REPORT,
      source: input.source ?? "payment",
    },
    update: {
      userId: input.userId ?? undefined,
      paymentId: input.paymentId ?? undefined,
    },
  });
}

export {
  PRODUCT_FULL_REPORT,
  fullReportPriceCents,
  stripeEnabled,
  allowMockCheckout,
  paywallEnabled,
};
