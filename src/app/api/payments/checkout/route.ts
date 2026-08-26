import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createRevengeCheckout, isBetaPaywallEnabled } from "@/lib/payments";
import { trackServer } from "@/lib/analytics-server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const BodySchema = z.object({
  analysisId: z.string().min(1),
});

export async function POST(request: Request) {
  const limited = rateLimit(`checkout:${clientIp(request)}`, 10, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "Слишком много запросов." }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Разбор не найден." }, { status: 400 });
  }

  const session = await auth();
  const origin = new URL(request.url).origin;
  const returnUrl = `${origin}/revenge?analysisId=${encodeURIComponent(parsed.data.analysisId)}&payment=return`;

  try {
    await trackServer("checkout_started", {
      analysisId: parsed.data.analysisId,
      userId: session?.user?.id,
      provider: "yookassa",
      paywallEnabled: isBetaPaywallEnabled(),
    });
    const checkout = await createRevengeCheckout({
      analysisId: parsed.data.analysisId,
      userId: session?.user?.id,
      returnUrl,
    });
    return NextResponse.json(checkout);
  } catch (error) {
    await trackServer("payment_failed", {
      analysisId: parsed.data.analysisId,
      userId: session?.user?.id,
      reason: error instanceof Error ? error.message : "unknown",
    }).catch(() => undefined);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось начать оплату." },
      { status: 503 },
    );
  }
}
