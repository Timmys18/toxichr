import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { AnalysisReport } from "@/lib/ai/schemas";
import { PERSONAS } from "@/lib/personas";
import { buildShareCaption } from "@/lib/share-studio";
import {
  CreatePublicShareSchema,
  PublicSharePayloadSchema,
  createShareSlug,
  publicToastUrl,
  resolveMetricValues,
} from "@/lib/public-share";
import { trackServer } from "@/lib/analytics";
import { auth } from "@/lib/auth";

export async function POST(request: Request) {
  const session = await auth();
  const body = await request.json();
  const parsed = CreatePublicShareSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const {
    analysisId,
    mode,
    format,
    quoteId,
    metrics,
    anonymization,
  } = parsed.data;

  const analysis = await prisma.analysis.findUnique({
    where: { id: analysisId },
    include: { persona: true },
  });

  if (!analysis || analysis.status !== "COMPLETED" || !analysis.reportPayload) {
    return NextResponse.json(
      { error: "Analysis not ready" },
      { status: 404 },
    );
  }

  if (analysis.userId && analysis.userId !== session?.user?.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const report = analysis.reportPayload as AnalysisReport;
  const personaCode =
    analysis.persona?.code ?? report.recommendedPersonaId ?? "lera";
  const persona =
    PERSONAS.find((p) => p.id === personaCode) ??
    PERSONAS.find((p) => p.id === "lera")!;

  const quote =
    report.shareQuotes.find((q) => q.id === quoteId) ?? report.shareQuotes[0];

  if (!quote) {
    return NextResponse.json({ error: "No quote" }, { status: 400 });
  }

  const roleLabel = anonymization.showRole
    ? report.candidateProfile.primaryRole
    : null;
  const levelLabel = anonymization.showLevel
    ? report.candidateProfile.inferredLevel
    : null;

  const selectedMetrics = resolveMetricValues(
    report.score,
    report.viralMetrics,
    metrics,
  );

  const caption = buildShareCaption({
    mode,
    personaName: persona.name,
    score: report.score.total,
    quote: quote.text,
    role: roleLabel ?? undefined,
  });

  const payload = PublicSharePayloadSchema.parse({
    personaId: persona.id,
    personaName: persona.name,
    personaTitle: persona.title,
    verdictTitle: report.verdict.title,
    quote: quote.text,
    scoreTotal: report.score.total,
    metrics: selectedMetrics,
    roleLabel,
    levelLabel,
    mode,
    format,
    caption,
  });

  let slug = createShareSlug();
  for (let i = 0; i < 3; i++) {
    const exists = await prisma.publicShare.findUnique({ where: { slug } });
    if (!exists) break;
    slug = createShareSlug();
  }

  const share = await prisma.publicShare.create({
    data: {
      analysisId: analysis.id,
      userId: session?.user?.id ?? analysis.userId ?? null,
      slug,
      publicPayload: payload,
      title: `«${payload.verdictTitle}» · ${payload.scoreTotal}/100`,
      description: payload.quote.slice(0, 160),
      active: true,
    },
  });

  trackServer("public_share_created", {
    analysisId,
    slug: share.slug,
    mode,
    format,
  });

  return NextResponse.json({
    id: share.id,
    slug: share.slug,
    url: publicToastUrl(share.slug),
    path: `/toast/${share.slug}`,
    payload,
  });
}
