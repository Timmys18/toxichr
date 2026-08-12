import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { trackServer } from "@/lib/analytics-server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const EventSchema = z.object({
  eventType: z.enum([
    "viewed",
    "cta_clicked",
    "platform_opened",
    "link_copied",
  ]),
  platform: z.string().max(40).optional(),
  sessionId: z.string().max(80).optional(),
});

type Params = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: Params) {
  const limited = rateLimit(`share-event:${clientIp(request)}`, 120, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many events" }, { status: 429 });
  }
  const { slug } = await params;

  const share = await prisma.publicShare.findUnique({
    where: { slug },
    select: { id: true, active: true, revokedAt: true },
  });

  if (!share || !share.active || share.revokedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = EventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { eventType, platform, sessionId } = parsed.data;

  await prisma.shareEvent.create({
    data: {
      publicShareId: share.id,
      eventType,
      platform: platform ?? null,
      sessionId: sessionId ?? null,
    },
  });

  const analyticsEvent =
    eventType === "viewed"
      ? "public_share_viewed"
      : eventType === "cta_clicked"
        ? "public_cta_clicked"
        : eventType === "platform_opened"
          ? "share_platform_opened"
          : "share_text_copied";

  await trackServer(analyticsEvent, {
    slug,
    platform: platform ?? null,
    visitorId: sessionId,
  });

  return NextResponse.json({ ok: true });
}
