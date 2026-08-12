import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { trackServer } from "@/lib/analytics-server";

type Params = { params: Promise<{ id: string }> };

/** Attach a guest analysis to the logged-in user (auth after value). */
export async function POST(_request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const analysis = await prisma.analysis.findUnique({
    where: { id },
    include: { resumeVersion: { include: { resume: true } } },
  });

  if (!analysis) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (
    (analysis.userId && analysis.userId !== session.user.id) ||
    (analysis.resumeVersion.resume.userId &&
      analysis.resumeVersion.resume.userId !== session.user.id)
  ) {
    return NextResponse.json({ error: "Already claimed" }, { status: 403 });
  }

  const resumeId = analysis.resumeVersion.resumeId;
  await prisma.$transaction([
    prisma.resume.update({
      where: { id: resumeId },
      data: { userId: session.user.id },
    }),
    prisma.analysis.updateMany({
      where: {
        resumeVersion: { resumeId },
        OR: [{ userId: null }, { userId: session.user.id }],
      },
      data: { userId: session.user.id },
    }),
    prisma.publicShare.updateMany({
      where: {
        userId: null,
        analysis: { resumeVersion: { resumeId } },
      },
      data: { userId: session.user.id },
    }),
    prisma.resumeImprovement.updateMany({
      where: {
        userId: null,
        analysis: { resumeVersion: { resumeId } },
      },
      data: { userId: session.user.id },
    }),
    prisma.vacancyMatch.updateMany({
      where: {
        userId: null,
        analysis: { resumeVersion: { resumeId } },
      },
      data: { userId: session.user.id },
    }),
    prisma.vacancy.updateMany({
      where: {
        userId: null,
        matches: { some: { analysis: { resumeVersion: { resumeId } } } },
      },
      data: { userId: session.user.id },
    }),
  ]);

  await trackServer("analysis_claimed", {
    analysisId: id,
    userId: session.user.id,
  });

  return NextResponse.json({ ok: true });
}
