import { prisma } from "@/lib/prisma";
import { deleteUpload } from "@/lib/storage";

export async function deleteAccountData(userId: string) {
  const storedFiles = await prisma.resume.findMany({
    where: { userId, privateStorageKey: { not: null } },
    select: { privateStorageKey: true },
  });
  await Promise.all(storedFiles
    .map((resume) => resume.privateStorageKey)
    .filter((key): key is string => Boolean(key))
    .map((key) => deleteUpload(key)));

  const deletedAt = new Date();
  await prisma.$transaction([
    prisma.publicShare.updateMany({
      where: { OR: [{ userId }, { analysis: { userId } }] },
      data: { active: false, revokedAt: deletedAt, publicPayload: { redacted: true }, title: null, description: null, imageKey: null },
    }),
    prisma.analysisFeedback.deleteMany({ where: { analysis: { userId } } }),
    prisma.resumeAdaptation.deleteMany({ where: { OR: [{ userId }, { analysis: { userId } }] } }),
    prisma.resumeImprovement.deleteMany({ where: { OR: [{ userId }, { analysis: { userId } }] } }),
    prisma.vacancyMatch.deleteMany({ where: { OR: [{ userId }, { analysis: { userId } }, { vacancy: { userId } }] } }),
    prisma.vacancy.deleteMany({ where: { userId } }),
    prisma.candidateProfile.deleteMany({ where: { resumeVersion: { resume: { userId } } } }),
    prisma.productEvent.deleteMany({ where: { userId } }),
    prisma.analysis.updateMany({ where: { userId }, data: { reportPayload: { redacted: true }, scorePayload: { redacted: true }, status: "FAILED" } }),
    prisma.resumeVersion.updateMany({ where: { resume: { userId } }, data: { structuredContent: { redacted: true } } }),
    prisma.resume.updateMany({
      where: { userId, deletedAt: null },
      data: { deletedAt, status: "DELETED", sanitizedText: null, extractedTextEncrypted: null, privateStorageKey: null },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { deletionRequestedAt: deletedAt, email: `deleted_${userId}@invalid.local`, passwordHash: null, displayName: "удалён" },
    }),
  ]);
}
