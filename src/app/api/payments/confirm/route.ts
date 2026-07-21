import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { trackServer } from "@/lib/analytics";
import {
  PRODUCT_FULL_REPORT,
  getStripe,
  grantFullReport,
  hasFullReportAccess,
  stripeEnabled,
} from "@/lib/payments";

const BodySchema = z.object({
  analysisId: z.string().min(1),
  sessionId: z.string().optional(),
});

/**
 * After Stripe redirect (?paid=1), confirm Checkout Session and grant access
 * even if webhook is delayed/missing (local + production safety net).
 */
export async function POST(request: Request) {
  const session = await auth();
  const body = await request.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { analysisId, sessionId } = parsed.data;
  const userId = session?.user?.id ?? null;

  if (await hasFullReportAccess(analysisId, userId)) {
    return NextResponse.json({ unlocked: true, source: "existing" });
  }

  if (!stripeEnabled()) {
    return NextResponse.json({ unlocked: false, reason: "stripe_disabled" });
  }

  const stripe = getStripe()!;

  // Prefer explicit session id; else find latest pending payment for analysis
  let checkoutId = sessionId;
  if (!checkoutId) {
    const pending = await prisma.payment.findFirst({
      where: {
        analysisId,
        productCode: PRODUCT_FULL_REPORT,
        provider: "stripe",
        status: { in: ["PENDING", "PAID"] },
      },
      orderBy: { createdAt: "desc" },
    });
    checkoutId = pending?.externalId ?? undefined;
  }

  if (!checkoutId) {
    return NextResponse.json({ unlocked: false, reason: "no_session" });
  }

  const checkout = await stripe.checkout.sessions.retrieve(checkoutId);
  if (checkout.payment_status !== "paid" && checkout.status !== "complete") {
    return NextResponse.json({
      unlocked: false,
      reason: "not_paid",
      status: checkout.payment_status,
    });
  }

  const paymentId =
    typeof checkout.metadata?.paymentId === "string"
      ? checkout.metadata.paymentId
      : null;

  if (paymentId) {
    await prisma.payment.updateMany({
      where: { id: paymentId },
      data: { status: "PAID", paidAt: new Date(), externalId: checkoutId },
    });
  }

  await grantFullReport({
    analysisId,
    userId:
      userId ??
      (checkout.metadata?.userId ? checkout.metadata.userId : null),
    paymentId,
    source: "stripe_confirm",
  });

  trackServer("payment_completed", {
    analysisId,
    provider: "stripe_confirm",
  });

  return NextResponse.json({ unlocked: true, source: "stripe_confirm" });
}
