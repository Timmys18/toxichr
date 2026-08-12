import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractFacts, recommendPersona } from "@/lib/ai/heuristics";
import { auth } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  const resume = await prisma.resume.findUnique({
    where: { id },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });

  if (!resume || resume.deletedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (resume.userId && resume.userId !== session?.user?.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const text = resume.sanitizedText ?? "";
  const facts = text ? extractFacts(text) : null;
  const rec = facts
    ? recommendPersona(facts)
    : { id: "lera" as const, reason: "Загрузите резюме для рекомендации." };

  return NextResponse.json({
    id: resume.id,
    status: resume.status,
    filename: resume.originalFilename,
    recommendedPersonaId: rec.id,
    recommendationReason: rec.reason,
    preview: {
      responsibilitiesCount: facts?.responsibilitiesCount ?? 0,
      achievementsCount: facts?.achievementsCount ?? 0,
      primaryRole: facts?.inferredRole ?? null,
    },
  });
}
