import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { trackServer } from "@/lib/analytics-server";
import { ImprovementAccessError, loadImprovementContext } from "@/lib/improvement-server";
import { createPackageCheckout, isBetaPaywallEnabled } from "@/lib/package";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const BodySchema = z.object({
  analysisId: z.string().min(1),
  vacancyId: z.string().min(1).optional(),
}).strict();

async function assertCheckoutContext({ analysisId, vacancyId, currentUserId }: { analysisId: string; vacancyId?: string; currentUserId?: string | null }) {
  const analysis = await loadImprovementContext(analysisId, currentUserId);
  if (!vacancyId) return;
  const ownerId = currentUserId ?? analysis.userId ?? null;
  const vacancy = await prisma.vacancy.findFirst({ where: { id: vacancyId, userId: ownerId }, select: { id: true } });
  if (!vacancy) throw new ImprovementAccessError("Вакансия не найдена или недоступна.", 404);
}

export async function POST(request: Request) {
  const limited = rateLimit(`checkout:${clientIp(request)}`, 10, 60_000);
  if (!limited.ok) return NextResponse.json({ error: "Слишком много запросов." }, { status: 429 });

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Нужен сохранённый разбор." }, { status: 400 });

  const session = await auth();
  try {
    await assertCheckoutContext({ analysisId: parsed.data.analysisId, vacancyId: parsed.data.vacancyId, currentUserId: session?.user?.id });
  } catch (error) {
    if (error instanceof ImprovementAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "Не удалось проверить данные для оплаты." }, { status: 500 });
  }

  const origin = new URL(request.url).origin;
  const returnUrl = parsed.data.vacancyId
    ? `${origin}/vacancy?analysisId=${encodeURIComponent(parsed.data.analysisId)}&vacancyId=${encodeURIComponent(parsed.data.vacancyId)}&payment=return`
    : `${origin}/revenge?analysisId=${encodeURIComponent(parsed.data.analysisId)}&payment=return`;

  try {
    await trackServer("package_checkout_started", { analysisId: parsed.data.analysisId, userId: session?.user?.id, paywallEnabled: isBetaPaywallEnabled() });
    const checkout = await createPackageCheckout({ analysisId: parsed.data.analysisId, userId: session?.user?.id, returnUrl });
    return NextResponse.json(checkout);
  } catch (error) {
    await trackServer("payment_failed", { analysisId: parsed.data.analysisId, userId: session?.user?.id, reason: error instanceof Error ? error.message : "unknown" }).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось начать оплату." }, { status: 503 });
  }
}
