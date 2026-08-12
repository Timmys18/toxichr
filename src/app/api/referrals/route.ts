import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { trackServer } from "@/lib/analytics-server";

const StartSchema = z.object({
  slug: z.string().min(1),
  visitorId: z.string().min(8).max(80),
  campaign: z.string().max(40).default("challenge"),
  platform: z.string().max(40).optional(),
});

const CompleteSchema = z.object({
  visitorId: z.string().min(8).max(80),
  slug: z.string().min(1).optional(),
  resumeId: z.string().optional(),
  analysisId: z.string().optional(),
  stage: z.enum(["started", "completed"]),
});

export async function POST(request: Request) {
  const body = await request.json();

  // Complete / update path
  if (body?.stage === "started" || body?.stage === "completed") {
    const parsed = CompleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { visitorId, slug, resumeId, analysisId, stage } = parsed.data;

    const existing = await prisma.referralSession.findFirst({
      where: {
        visitorId,
        ...(slug
          ? { publicShare: { slug } }
          : {}),
        completedAt: null,
      },
      orderBy: { createdAt: "desc" },
      include: { publicShare: true },
    });

    if (!existing) {
      return NextResponse.json({ ok: false, reason: "no_session" });
    }

    if (stage === "started" && resumeId) {
      await prisma.referralSession.update({
        where: { id: existing.id },
        data: { startedResumeId: resumeId },
      });
      await trackServer("challenge_joined", {
        slug: existing.publicShare.slug,
        referralId: existing.id,
      });
      return NextResponse.json({ ok: true, referralId: existing.id });
    }

    if (stage === "completed" && analysisId) {
      await prisma.referralSession.update({
        where: { id: existing.id },
        data: {
          completedAnalysisId: analysisId,
          completedAt: new Date(),
          startedResumeId: resumeId ?? existing.startedResumeId,
        },
      });

      await prisma.shareEvent.create({
        data: {
          publicShareId: existing.publicShareId,
          sessionId: visitorId,
          eventType: "referral_converted",
          platform: existing.platform,
          metadata: {
            campaign: existing.campaign,
            analysisId,
          },
        },
      });

      await trackServer("referral_converted", {
        slug: existing.publicShare.slug,
        referralId: existing.id,
        analysisId,
      });

      return NextResponse.json({ ok: true, referralId: existing.id });
    }

    return NextResponse.json({ ok: true, referralId: existing.id });
  }

  // Start path
  const parsed = StartSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { slug, visitorId, campaign, platform } = parsed.data;

  const share = await prisma.publicShare.findUnique({ where: { slug } });
  if (!share || !share.active || share.revokedAt) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }

  const open = await prisma.referralSession.findFirst({
    where: {
      visitorId,
      publicShareId: share.id,
      completedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  if (open) {
    return NextResponse.json({
      referralId: open.id,
      slug,
      reused: true,
    });
  }

  const session = await prisma.referralSession.create({
    data: {
      publicShareId: share.id,
      visitorId,
      campaign,
      platform: platform ?? null,
    },
  });

  await prisma.shareEvent.create({
    data: {
      publicShareId: share.id,
      sessionId: visitorId,
      eventType: "challenge_started",
      platform: platform ?? null,
      metadata: { campaign },
    },
  });

  await trackServer("challenge_created", {
    slug,
    referralId: session.id,
    campaign,
  });

  return NextResponse.json({
    referralId: session.id,
    slug,
    reused: false,
  });
}
