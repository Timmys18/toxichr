import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { ANALYTICS_EVENTS } from "@/lib/analytics";
import { trackServer } from "@/lib/analytics-server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const EventSchema = z.object({
  event: z.enum(ANALYTICS_EVENTS),
  visitorId: z.string().min(8).max(80).optional(),
  props: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .default({}),
});

export async function POST(request: Request) {
  const limited = rateLimit(`analytics:${clientIp(request)}`, 120, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many events" }, { status: 429 });
  }

  const parsed = EventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }

  const session = await auth();
  await trackServer(parsed.data.event, {
    ...parsed.data.props,
    visitorId: parsed.data.visitorId,
    userId: session?.user?.id,
  });

  return NextResponse.json({ ok: true });
}
