import { randomUUID } from "node:crypto";
import type { PackageUsageKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const TOXICHR_PACKAGE_PRODUCT_CODE = "toxichr_package";
export const TOXICHR_PACKAGE_PRICE_RUB = 199;
const PACKAGE_PRICE_MINOR = TOXICHR_PACKAGE_PRICE_RUB * 100;
const PACKAGE_RESERVATION_TTL_MS = 15 * 60 * 1000;

export const PACKAGE_LIMITS = {
  MATCH: 5,
  RECHECK: 5,
  IMPROVEMENT: 1,
  ADAPTATION: 1,
} as const;

export type PackageAction = keyof typeof PACKAGE_LIMITS;

export class PackageAccessError extends Error {
  constructor(
    message: string,
    readonly status: 402 | 403 | 409,
    readonly reason: "package_required" | "limit_reached" | "in_progress",
  ) {
    super(message);
    this.name = "PackageAccessError";
  }
}

type PackageContext = {
  analysisId: string;
  resumeId: string;
  resumeVersionId: string;
  userId: string | null;
};

export type PackageSnapshot = {
  paywallEnabled: boolean;
  hasPackage: boolean;
  priceRub: number;
  matchesUsed: number;
  matchesRemaining: number;
  rechecksUsed: number;
  rechecksRemaining: number;
  improvementUsed: boolean;
  improvementAvailable: boolean;
  adaptationUsed: boolean;
  adaptationAvailable: boolean;
};

function paywallEnabled() {
  return process.env.BETA_PAYWALL_ENABLED === "true";
}

export function isBetaPaywallEnabled() {
  return paywallEnabled();
}

export function isYooKassaConfigured() {
  return Boolean(process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY);
}

async function packageContext(analysisId: string, currentUserId?: string | null): Promise<PackageContext> {
  const analysis = await prisma.analysis.findUnique({
    where: { id: analysisId },
    select: {
      id: true,
      userId: true,
      status: true,
      reportPayload: true,
      resumeVersionId: true,
      resumeVersion: { select: { resumeId: true } },
    },
  });
  if (!analysis || analysis.status !== "COMPLETED" || !analysis.reportPayload) {
    throw new Error("Разбор не найден.");
  }
  if (analysis.userId && analysis.userId !== currentUserId) {
    throw new Error("Нет доступа к этому разбору.");
  }
  return {
    analysisId: analysis.id,
    resumeId: analysis.resumeVersion.resumeId,
    resumeVersionId: analysis.resumeVersionId,
    userId: currentUserId ?? analysis.userId ?? null,
  };
}

async function migrateLegacyGrant(context: PackageContext) {
  const existing = await prisma.toxicHrPackage.findUnique({ where: { resumeId: context.resumeId } });
  if (existing) return existing;

  const legacyGrant = await prisma.accessGrant.findFirst({
    where: {
      analysis: { resumeVersion: { resumeId: context.resumeId } },
      productCode: { not: TOXICHR_PACKAGE_PRODUCT_CODE },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, userId: true },
  });
  if (!legacyGrant) return null;

  return prisma.toxicHrPackage.upsert({
    where: { resumeId: context.resumeId },
    create: {
      resumeId: context.resumeId,
      userId: context.userId ?? legacyGrant.userId,
      source: "legacy_migration",
    },
    update: {},
  });
}

async function findPackage(context: PackageContext) {
  const existing = await prisma.toxicHrPackage.findUnique({
    where: { resumeId: context.resumeId },
    include: { usages: { where: { status: "COMPLETED" } } },
  });
  if (existing) return existing;

  const migrated = await migrateLegacyGrant(context);
  if (!migrated) return null;
  return prisma.toxicHrPackage.findUnique({
    where: { id: migrated.id },
    include: { usages: { where: { status: "COMPLETED" } } },
  });
}

function usageCount(snapshot: NonNullable<Awaited<ReturnType<typeof findPackage>>>, kind: PackageAction) {
  return snapshot.usages.filter((usage) => usage.kind === kind).length;
}

function noPackageSnapshot(): PackageSnapshot {
  return {
    paywallEnabled: paywallEnabled(),
    hasPackage: !paywallEnabled(),
    priceRub: TOXICHR_PACKAGE_PRICE_RUB,
    matchesUsed: 0,
    matchesRemaining: PACKAGE_LIMITS.MATCH,
    rechecksUsed: 0,
    rechecksRemaining: PACKAGE_LIMITS.RECHECK,
    improvementUsed: false,
    improvementAvailable: true,
    adaptationUsed: false,
    adaptationAvailable: true,
  };
}

export async function getPackageSnapshot(analysisId: string, currentUserId?: string | null): Promise<PackageSnapshot> {
  const context = await packageContext(analysisId, currentUserId);
  if (!paywallEnabled()) return noPackageSnapshot();
  const current = await findPackage(context);
  if (!current) return { ...noPackageSnapshot(), hasPackage: false };
  const matchesUsed = usageCount(current, "MATCH");
  const rechecksUsed = usageCount(current, "RECHECK");
  const improvementUsed = usageCount(current, "IMPROVEMENT") > 0;
  const adaptationUsed = usageCount(current, "ADAPTATION") > 0;
  return {
    paywallEnabled: true,
    hasPackage: true,
    priceRub: TOXICHR_PACKAGE_PRICE_RUB,
    matchesUsed,
    matchesRemaining: Math.max(0, PACKAGE_LIMITS.MATCH - matchesUsed),
    rechecksUsed,
    rechecksRemaining: Math.max(0, PACKAGE_LIMITS.RECHECK - rechecksUsed),
    improvementUsed,
    improvementAvailable: !improvementUsed,
    adaptationUsed,
    adaptationAvailable: !adaptationUsed,
  };
}

export async function hasPaidPackageForResume(resumeId: string) {
  if (!paywallEnabled()) return false;
  return Boolean(await prisma.toxicHrPackage.findUnique({ where: { resumeId }, select: { id: true } }));
}

export async function matchPackageAction(analysisId: string, vacancyId: string, currentUserId?: string | null): Promise<"MATCH" | "RECHECK"> {
  if (!paywallEnabled()) return "MATCH";
  const context = await packageContext(analysisId, currentUserId);
  const current = await prisma.toxicHrPackage.findUnique({ where: { resumeId: context.resumeId }, select: { id: true } });
  if (!current) return "MATCH";
  const previous = await prisma.packageUsage.findFirst({
    where: { packageId: current.id, vacancyId, kind: "MATCH", status: "COMPLETED" },
    select: { id: true },
  });
  return previous ? "RECHECK" : "MATCH";
}

function actionKey(kind: PackageAction, context: PackageContext, vacancyId?: string) {
  if (kind === "IMPROVEMENT") return `improvement:${context.resumeId}`;
  if (kind === "ADAPTATION") return `adaptation:${vacancyId ?? "pending"}:${context.resumeId}`;
  return `${kind.toLowerCase()}:${vacancyId ?? "unknown"}:${context.resumeVersionId}`;
}

export async function reservePackageAction({
  analysisId,
  currentUserId,
  kind,
  vacancyId,
}: {
  analysisId: string;
  currentUserId?: string | null;
  kind: PackageAction;
  vacancyId?: string;
}) {
  const context = await packageContext(analysisId, currentUserId);
  if (!paywallEnabled()) return { reservationId: null, reused: false, snapshot: noPackageSnapshot() };

  return prisma.$transaction(async (tx) => {
    let current = await tx.toxicHrPackage.findUnique({ where: { resumeId: context.resumeId } });
    if (!current) {
      const legacy = await tx.accessGrant.findFirst({
        where: {
          analysis: { resumeVersion: { resumeId: context.resumeId } },
          productCode: { not: TOXICHR_PACKAGE_PRODUCT_CODE },
        },
        orderBy: { createdAt: "asc" },
      });
      if (legacy) {
        current = await tx.toxicHrPackage.upsert({
          where: { resumeId: context.resumeId },
          create: { resumeId: context.resumeId, userId: context.userId ?? legacy.userId, source: "legacy_migration" },
          update: {},
        });
      }
    }
    if (!current) {
      throw new PackageAccessError("Нужен пакет ToxicHR за 199 ₽.", 402, "package_required");
    }

    const dedupeKey = actionKey(kind, context, vacancyId);
    const existing = await tx.packageUsage.findUnique({
      where: { packageId_dedupeKey: { packageId: current.id, dedupeKey } },
    });
    if (existing?.status === "COMPLETED") return { reservationId: null, reused: true };
    if (existing?.status === "PENDING") {
      if (existing.createdAt.getTime() <= Date.now() - PACKAGE_RESERVATION_TTL_MS) {
        await tx.packageUsage.delete({ where: { id: existing.id } });
      } else {
        throw new PackageAccessError("Это действие уже выполняется. Подожди готовый результат.", 409, "in_progress");
      }
    }

    // Незавершённый запрос после падения процесса не становится использованным
    // действием и не должен уменьшать доступный лимит навсегда.
    await tx.packageUsage.deleteMany({
      where: {
        packageId: current.id,
        status: "PENDING",
        createdAt: { lte: new Date(Date.now() - PACKAGE_RESERVATION_TTL_MS) },
      },
    });

    const used = await tx.packageUsage.count({
      where: { packageId: current.id, kind: kind as PackageUsageKind, status: { in: ["PENDING", "COMPLETED"] } },
    });
    if (used >= PACKAGE_LIMITS[kind]) {
      throw new PackageAccessError("Лимит этого действия в пакете уже использован.", 403, "limit_reached");
    }
    const usage = await tx.packageUsage.create({
      data: {
        packageId: current.id,
        kind: kind as PackageUsageKind,
        dedupeKey,
        analysisId: context.analysisId,
        vacancyId,
        resumeVersionId: context.resumeVersionId,
      },
    });
    return { reservationId: usage.id, reused: false };
  });
}

export async function completePackageAction(reservationId: string | null) {
  if (!reservationId) return;
  await prisma.packageUsage.update({
    where: { id: reservationId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
}

export async function releasePackageAction(reservationId: string | null) {
  if (!reservationId) return;
  await prisma.packageUsage.deleteMany({ where: { id: reservationId, status: "PENDING" } });
}

function authHeader() {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secret = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secret) throw new Error("Оплата временно не настроена.");
  return `Basic ${Buffer.from(`${shopId}:${secret}`).toString("base64")}`;
}

type YooPayment = {
  id: string;
  status: "pending" | "waiting_for_capture" | "succeeded" | "canceled";
  paid?: boolean;
  confirmation?: { type?: string; confirmation_url?: string };
};

async function yooRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.yookassa.ru/v3${path}`, {
    ...init,
    headers: { Authorization: authHeader(), "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data && typeof data === "object" && "description" in data ? String(data.description) : `ЮKassa вернула ${response.status}`);
  return data as T;
}

export async function createPackageCheckout({ analysisId, userId, returnUrl }: { analysisId: string; userId?: string | null; returnUrl: string }) {
  const context = await packageContext(analysisId, userId);
  if (!paywallEnabled()) return { access: true as const, checkoutUrl: null };
  if (await findPackage(context)) return { access: true as const, checkoutUrl: null };
  if (!isYooKassaConfigured()) throw new Error("Оплата временно не настроена.");

  const payment = await prisma.payment.create({
    data: { userId: userId ?? context.userId, analysisId, provider: "yookassa", productCode: TOXICHR_PACKAGE_PRODUCT_CODE, amount: PACKAGE_PRICE_MINOR, currency: "RUB", status: "PENDING" },
  });
  try {
    const yoo = await yooRequest<YooPayment>("/payments", {
      method: "POST",
      headers: { "Idempotence-Key": randomUUID() },
      body: JSON.stringify({
        amount: { value: TOXICHR_PACKAGE_PRICE_RUB.toFixed(2), currency: "RUB" },
        capture: true,
        confirmation: { type: "redirect", return_url: returnUrl },
        description: `ToxicHR · пакет · ${analysisId.slice(0, 8)}`,
        metadata: { localPaymentId: payment.id, analysisId, productCode: TOXICHR_PACKAGE_PRODUCT_CODE },
      }),
    });
    if (!yoo.confirmation?.confirmation_url) throw new Error("ЮKassa не вернула ссылку на оплату.");
    await prisma.payment.update({ where: { id: payment.id }, data: { externalId: yoo.id } });
    return { access: false as const, checkoutUrl: yoo.confirmation.confirmation_url };
  } catch (error) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
    throw error;
  }
}

export async function syncYooKassaPayment(externalId: string) {
  if (!isYooKassaConfigured()) throw new Error("Оплата временно не настроена.");
  const yoo = await yooRequest<YooPayment>(`/payments/${encodeURIComponent(externalId)}`);
  const payment = await prisma.payment.findUnique({
    where: { externalId: yoo.id },
    include: { analysis: { include: { resumeVersion: { select: { resumeId: true } } } } },
  });
  if (!payment) return { handled: false as const, status: yoo.status, productCode: null };
  if (yoo.status === "succeeded" && yoo.paid !== false) {
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: payment.id }, data: { status: "PAID", paidAt: new Date() } });
      if (payment.productCode === TOXICHR_PACKAGE_PRODUCT_CODE && payment.analysis?.resumeVersion) {
        await tx.toxicHrPackage.upsert({
          where: { resumeId: payment.analysis.resumeVersion.resumeId },
          create: { resumeId: payment.analysis.resumeVersion.resumeId, userId: payment.userId, paymentId: payment.id },
          update: { userId: payment.userId ?? undefined, paymentId: payment.id, source: "payment" },
        });
      }
    });
    return { handled: true as const, status: "PAID" as const, productCode: payment.productCode };
  }
  if (yoo.status === "canceled") {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
    return { handled: true as const, status: "FAILED" as const, productCode: payment.productCode };
  }
  return { handled: true as const, status: "PENDING" as const, productCode: payment.productCode };
}
