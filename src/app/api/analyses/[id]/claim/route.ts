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
    include: { resumeVersion: true },
  });

  if (!analysis) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (analysis.userId && analysis.userId !== session.user.id) {
    return NextResponse.json({ error: "Already claimed" }, { status: 403 });
  }

  await prisma.analysis.update({
    where: { id },
    data: { userId: session.user.id },
  });

  await prisma.resume.update({
    where: { id: analysis.resumeVersion.resumeId },
    data: { userId: session.user.id },
  });

  await trackServer("analysis_claimed", {
    analysisId: id,
    userId: session.user.id,
  });

  return NextResponse.json({ ok: true });
}
