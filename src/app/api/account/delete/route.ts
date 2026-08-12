import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { trackServer } from "@/lib/analytics-server";
import { deleteUpload } from "@/lib/storage";

/** Revoke public data, remove uploads, and irreversibly anonymize the account. */
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const storedFiles = await prisma.resume.findMany({
    where: { userId, privateStorageKey: { not: null } },
    select: { privateStorageKey: true },
  });

  // Delete physical files before removing their database pointers. The action
  // stays safely retryable because a missing file is treated as already gone.
  await Promise.all(
    storedFiles
      .map((resume) => resume.privateStorageKey)
      .filter((key): key is string => Boolean(key))
      .map((key) => deleteUpload(key)),
  );

  const deletedAt = new Date();
  await prisma.$transaction([
    prisma.publicShare.updateMany({
      where: {
        active: true,
        OR: [{ userId }, { analysis: { userId } }],
      },
      data: { active: false, revokedAt: deletedAt },
    }),
    prisma.resumeImprovement.deleteMany({
      where: { OR: [{ userId }, { analysis: { userId } }] },
    }),
    prisma.vacancyMatch.deleteMany({
      where: {
        OR: [{ userId }, { analysis: { userId } }, { vacancy: { userId } }],
      },
    }),
    prisma.vacancy.deleteMany({ where: { userId } }),
    prisma.analysis.updateMany({
      where: { userId },
      data: {
        reportPayload: { redacted: true },
        scorePayload: { redacted: true },
        status: "FAILED",
      },
    }),
    prisma.resumeVersion.updateMany({
      where: { resume: { userId } },
      data: { structuredContent: { redacted: true } },
    }),
    prisma.resume.updateMany({
      where: { userId, deletedAt: null },
      data: {
        deletedAt,
        status: "DELETED",
        sanitizedText: null,
        extractedTextEncrypted: null,
        privateStorageKey: null,
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        deletionRequestedAt: deletedAt,
        email: `deleted_${userId}@invalid.local`,
        passwordHash: null,
        displayName: "удалён",
      },
    }),
  ]);

  await trackServer("account_deleted", { userId });

  return NextResponse.json({ ok: true });
}

export async function POST() {
  return DELETE();
}
