import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { trackServer } from "@/lib/analytics-server";

const FeedbackSchema = z.object({
  annotationId: z.string().min(1),
  verdict: z.enum(["hit", "miss", "wrong_fact"]),
  note: z.string().max(500).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id: analysisId } = await params;

  const analysis = await prisma.analysis.findUnique({
    where: { id: analysisId },
    select: { id: true },
  });

  if (!analysis) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = FeedbackSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { annotationId, verdict, note } = parsed.data;

  const feedback = await prisma.analysisFeedback.create({
    data: {
      analysisId,
      annotationId,
      verdict,
      note: note?.trim() || null,
    },
  });

  await trackServer("annotation_feedback", {
    analysisId,
    annotationId,
    verdict,
    hasNote: Boolean(note?.trim()),
  });

  return NextResponse.json({ id: feedback.id, verdict });
}
