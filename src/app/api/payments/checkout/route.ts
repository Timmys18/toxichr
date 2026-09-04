import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  createProductCheckout,
  isBetaPaywallEnabled,
  productCodeFor,
  type PaidProduct,
} from "@/lib/payments";
import {
  ImprovementAccessError,
  loadImprovementContext,
} from "@/lib/improvement-server";
import { prisma } from "@/lib/prisma";
import { trackServer } from "@/lib/analytics-server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const BodySchema = z.object({
  analysisId: z.string().min(1),
  product: z.enum(["resume_rewrite", "vacancy_match"]),
  vacancyId: z.string().min(1).optional(),
});

async function assertVacancyMatchCheckoutContext({
  analysisId,
  vacancyId,
  currentUserId,
}: {
  analysisId: string;
  vacancyId: string;
  currentUserId?: string | null;
}) {
  const analysis = await loadImprovementContext(analysisId, currentUserId);
  // Вакансия могла быть создана уже после входа пользователя, хотя сам
  // бесплатный разбор начался в гостевом режиме. Используем ту же логику
  // владельца, что и при сохранении вакансии в /api/vacancies/review.
  const ownerId = currentUserId ?? analysis.userId ?? null;
  const vacancy = await prisma.vacancy.findFirst({
    where: { id: vacancyId, userId: ownerId },
    select: { id: true },
  });

  if (!vacancy) {
    // Не раскрываем, существует ли чужая вакансия, и не создаём платёж
    // для произвольного productCode.
    throw new ImprovementAccessError("Вакансия не найдена или недоступна.", 404);
  }
}

export async function POST(request: Request) {
  const limited = rateLimit(`checkout:${clientIp(request)}`, 10, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "Слишком много запросов." }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Разбор не найден." }, { status: 400 });
  }

  if (parsed.data.product === "vacancy_match" && !parsed.data.vacancyId) {
    return NextResponse.json({ error: "Для сопоставления нужна вакансия." }, { status: 400 });
  }

  const session = await auth();
  if (parsed.data.product === "vacancy_match") {
    try {
      await assertVacancyMatchCheckoutContext({
        analysisId: parsed.data.analysisId,
        vacancyId: parsed.data.vacancyId!,
        currentUserId: session?.user?.id,
      });
    } catch (error) {
      if (error instanceof ImprovementAccessError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      console.error(error);
      return NextResponse.json(
        { error: "Не удалось проверить сохранённую вакансию." },
        { status: 500 },
      );
    }
  }

  const origin = new URL(request.url).origin;
  const productCode = productCodeFor(
    parsed.data.product as PaidProduct,
    parsed.data.vacancyId,
  );
  const returnUrl = parsed.data.product === "vacancy_match"
    ? `${origin}/vacancy?analysisId=${encodeURIComponent(parsed.data.analysisId)}&vacancyId=${encodeURIComponent(parsed.data.vacancyId!)}&payment=return`
    : `${origin}/revenge?analysisId=${encodeURIComponent(parsed.data.analysisId)}&payment=return`;

  try {
    await trackServer("checkout_started", {
      analysisId: parsed.data.analysisId,
      userId: session?.user?.id,
      provider: "yookassa",
      paywallEnabled: isBetaPaywallEnabled(),
      product: parsed.data.product,
    });
    const checkout = await createProductCheckout({
      analysisId: parsed.data.analysisId,
      productCode,
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
