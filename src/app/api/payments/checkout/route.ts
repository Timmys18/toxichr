import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { trackServer } from "@/lib/analytics";
import { appBaseUrl } from "@/lib/public-share";
import {
  PRODUCT_FULL_REPORT,
  fullReportPriceCents,
  getStripe,
  grantFullReport,
  stripeEnabled,
  allowMockCheckout,
  paywallEnabled,
} from "@/lib/payments";

const BodySchema = z.object({
  analysisId: z.string().min(1),
  productCode: z.literal(PRODUCT_FULL_REPORT).default(PRODUCT_FULL_REPORT),
});

export async function POST(request: Request) {
  const session = await auth();
  const body = await request.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { analysisId } = parsed.data;
  const analysis = await prisma.analysis.findUnique({
    where: { id: analysisId },
  });
  if (!analysis || analysis.status !== "COMPLETED") {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  // Owned analyses: only owner can checkout
  if (analysis.userId && analysis.userId !== session?.user?.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const amount = fullReportPriceCents();
  const userId = session?.user?.id ?? analysis.userId ?? null;

  trackServer("checkout_started", { analysisId, amount });

  // Пока оплата выключена — полный доступ уже открыт, checkout не нужен.
  if (!paywallEnabled()) {
    return NextResponse.json({
      mode: "open",
      unlocked: true,
      redirectUrl: `${appBaseUrl()}/report?analysisId=${analysisId}&full=1`,
    });
  }

  if (!stripeEnabled()) {
    if (!allowMockCheckout()) {
      return NextResponse.json(
        {
          error:
            "Оплата не настроена. Задайте STRIPE_SECRET_KEY для production.",
        },
        { status: 503 },
      );
    }

    const payment = await prisma.payment.create({
      data: {
        userId,
        analysisId,
        provider: "mock",
        externalId: `mock_${Date.now()}`,
        productCode: PRODUCT_FULL_REPORT,
        amount,
        currency: "usd",
        status: "PAID",
        paidAt: new Date(),
      },
    });

    await grantFullReport({
      analysisId,
      userId,
      paymentId: payment.id,
      source: "mock",
    });

    trackServer("payment_completed", {
      analysisId,
      paymentId: payment.id,
      provider: "mock",
    });

    return NextResponse.json({
      mode: "mock",
      unlocked: true,
      redirectUrl: `${appBaseUrl()}/report?analysisId=${analysisId}&full=1`,
    });
  }

  const stripe = getStripe()!;
  const payment = await prisma.payment.create({
    data: {
      userId,
      analysisId,
      provider: "stripe",
      productCode: PRODUCT_FULL_REPORT,
      amount,
      currency: "usd",
      status: "PENDING",
    },
  });

  const checkout = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: `${appBaseUrl()}/report?analysisId=${analysisId}&full=1&paid=1`,
    cancel_url: `${appBaseUrl()}/pricing?analysisId=${analysisId}`,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amount,
          product_data: {
            name: "ToxicHR — полный разбор",
            description:
              "Полный разбор, разметка улик, каркасы формулировок, план правок",
          },
        },
      },
    ],
    metadata: {
      paymentId: payment.id,
      analysisId,
      productCode: PRODUCT_FULL_REPORT,
      userId: userId ?? "",
    },
  });

  await prisma.payment.update({
    where: { id: payment.id },
    data: { externalId: checkout.id },
  });

  return NextResponse.json({
    mode: "stripe",
    checkoutUrl: checkout.url,
  });
}
