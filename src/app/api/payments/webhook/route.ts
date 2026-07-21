import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { trackServer } from "@/lib/analytics";
import {
  PRODUCT_FULL_REPORT,
  getStripe,
  grantFullReport,
  stripeEnabled,
} from "@/lib/payments";

export async function POST(request: Request) {
  if (!stripeEnabled()) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const stripe = getStripe()!;
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return NextResponse.json({ error: "Missing webhook config" }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const paymentId = session.metadata?.paymentId;
    const analysisId = session.metadata?.analysisId;
    const userId = session.metadata?.userId || null;

    if (paymentId) {
      const existing = await prisma.payment.findUnique({
        where: { id: paymentId },
      });

      // Idempotent webhook
      if (existing && existing.status !== "PAID") {
        await prisma.payment.update({
          where: { id: paymentId },
          data: {
            status: "PAID",
            paidAt: new Date(),
            externalId: session.id,
          },
        });
      }

      if (analysisId) {
        await grantFullReport({
          analysisId,
          userId,
          paymentId,
          source: "stripe",
        });
      }

      trackServer("payment_completed", {
        paymentId,
        analysisId: analysisId ?? null,
        productCode: PRODUCT_FULL_REPORT,
      });
    }
  }

  return NextResponse.json({ received: true });
}
