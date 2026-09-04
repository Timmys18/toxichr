import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * В бете продаётся не «премиум-доступ», а одно конкретное действие.
 * Код match включает vacancyId, поэтому оплата одной вакансии не открывает
 * сопоставление с другой.
 */
export const RESUME_REWRITE_PRODUCT_CODE = "resume_rewrite";
export const PAID_ACTION_PRICE_RUB = 199;
const PAID_ACTION_PRICE_MINOR = PAID_ACTION_PRICE_RUB * 100;

export type PaidProduct = "resume_rewrite" | "vacancy_match";

export function vacancyMatchProductCode(vacancyId: string) {
  return `vacancy_match:${vacancyId}`;
}

export function productCodeFor(
  product: PaidProduct,
  vacancyId?: string | null,
) {
  if (product === "resume_rewrite") return RESUME_REWRITE_PRODUCT_CODE;
  if (!vacancyId) throw new Error("Для сопоставления нужна вакансия.");
  return vacancyMatchProductCode(vacancyId);
}

function productDescription(productCode: string) {
  return productCode === RESUME_REWRITE_PRODUCT_CODE
    ? "готовая новая версия резюме"
    : "сопоставление резюме с вакансией";
}

export function isBetaPaywallEnabled() {
  return process.env.BETA_PAYWALL_ENABLED === "true";
}

export function isYooKassaConfigured() {
  return Boolean(
    process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY,
  );
}

function authHeader() {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secret = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secret) throw new Error("ЮKassa не настроена.");
  return `Basic ${Buffer.from(`${shopId}:${secret}`).toString("base64")}`;
}

type YooPayment = {
  id: string;
  status: "pending" | "waiting_for_capture" | "succeeded" | "canceled";
  paid?: boolean;
  confirmation?: { type?: string; confirmation_url?: string };
  metadata?: Record<string, string>;
};

async function yooRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.yookassa.ru/v3${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "description" in data
        ? String(data.description)
        : `ЮKassa вернула ${response.status}`;
    throw new Error(message);
  }
  return data as T;
}

export async function hasProductAccess(analysisId: string, productCode: string) {
  if (!isBetaPaywallEnabled()) return true;
  const grant = await prisma.accessGrant.findUnique({
    where: {
      analysisId_productCode: {
        analysisId,
        productCode,
      },
    },
    select: { id: true },
  });
  return Boolean(grant);
}

export async function createProductCheckout({
  analysisId,
  productCode,
  userId,
  returnUrl,
}: {
  analysisId: string;
  productCode: string;
  userId?: string | null;
  returnUrl: string;
}) {
  if (!isBetaPaywallEnabled()) {
    return { access: true as const, checkoutUrl: null };
  }
  if (!isYooKassaConfigured()) {
    throw new Error("Оплата временно не настроена.");
  }
  if (await hasProductAccess(analysisId, productCode)) {
    return { access: true as const, checkoutUrl: null };
  }

  const analysis = await prisma.analysis.findUnique({
    where: { id: analysisId },
    select: { id: true, userId: true, status: true },
  });
  if (!analysis || analysis.status !== "COMPLETED") {
    throw new Error("Разбор не найден.");
  }
  if (analysis.userId && analysis.userId !== userId) {
    throw new Error("Нет доступа к этому разбору.");
  }

  const payment = await prisma.payment.create({
    data: {
      userId: userId ?? analysis.userId,
      analysisId,
      provider: "yookassa",
      productCode,
      amount: PAID_ACTION_PRICE_MINOR,
      currency: "RUB",
      status: "PENDING",
    },
  });

  try {
    const yoo = await yooRequest<YooPayment>("/payments", {
      method: "POST",
      headers: { "Idempotence-Key": randomUUID() },
      body: JSON.stringify({
        amount: {
          value: PAID_ACTION_PRICE_RUB.toFixed(2),
          currency: "RUB",
        },
        capture: true,
        confirmation: {
          type: "redirect",
          return_url: returnUrl,
        },
        description: `ToxicHR · ${productDescription(productCode)} · ${analysisId.slice(0, 8)}`,
        metadata: {
          localPaymentId: payment.id,
          analysisId,
          productCode,
        },
      }),
    });

    const checkoutUrl = yoo.confirmation?.confirmation_url;
    if (!checkoutUrl) throw new Error("ЮKassa не вернула ссылку на оплату.");

    await prisma.payment.update({
      where: { id: payment.id },
      data: { externalId: yoo.id },
    });

    return { access: false as const, checkoutUrl };
  } catch (error) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED" },
    });
    throw error;
  }
}

export async function syncYooKassaPayment(externalId: string) {
  if (!isYooKassaConfigured()) throw new Error("ЮKassa не настроена.");
  const yoo = await yooRequest<YooPayment>(`/payments/${encodeURIComponent(externalId)}`);
  const payment = await prisma.payment.findUnique({
    where: { externalId: yoo.id },
  });
  if (!payment) return { handled: false as const, status: yoo.status };

  if (yoo.status === "succeeded" && yoo.paid !== false) {
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: "PAID", paidAt: new Date() },
      }),
      prisma.accessGrant.upsert({
        where: {
          analysisId_productCode: {
            analysisId: payment.analysisId!,
            productCode: payment.productCode,
          },
        },
        create: {
          userId: payment.userId,
          analysisId: payment.analysisId!,
          productCode: payment.productCode,
          paymentId: payment.id,
          source: "payment",
        },
        update: {
          userId: payment.userId,
          paymentId: payment.id,
          source: "payment",
        },
      }),
    ]);
    return { handled: true as const, status: "PAID" as const };
  }

  if (yoo.status === "canceled") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED" },
    });
    return { handled: true as const, status: "FAILED" as const };
  }

  return { handled: true as const, status: "PENDING" as const };
}
