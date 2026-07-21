import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { trackServer } from "@/lib/analytics";

/** Soft-delete user data: revoke shares, scrub analyses, mark resumes deleted. */
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Revoke shares owned by user OR attached to their analyses
  await prisma.publicShare.updateMany({
    where: {
      active: true,
      OR: [{ userId }, { analysis: { userId } }],
    },
    data: { active: false, revokedAt: new Date() },
  });

  await prisma.resume.updateMany({
    where: { userId, deletedAt: null },
    data: {
      deletedAt: new Date(),
      status: "DELETED",
      sanitizedText: null,
      extractedTextEncrypted: null,
      privateStorageKey: null,
    },
  });

  const analyses = await prisma.analysis.findMany({
    where: { userId },
    select: { id: true },
  });

  for (const a of analyses) {
    await prisma.analysis.update({
      where: { id: a.id },
      data: {
        reportPayload: { redacted: true },
        scorePayload: { redacted: true },
        status: "FAILED",
      },
    });
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      deletionRequestedAt: new Date(),
      email: `deleted_${userId}@invalid.local`,
      passwordHash: null,
      displayName: "удалён",
    },
  });

  trackServer("account_deleted", { userId });

  return NextResponse.json({ ok: true });
}

export async function POST() {
  return DELETE();
}
