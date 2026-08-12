import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AnalyticsEvent } from "@/lib/analytics";

type EventProps = Record<string, string | number | boolean | null | undefined>;

export async function trackServer(
  event: AnalyticsEvent,
  props: EventProps = {},
) {
  const { userId, visitorId, sessionId, ...properties } = props;

  await prisma.productEvent.create({
    data: {
      eventName: event,
      userId: typeof userId === "string" ? userId : null,
      visitorId: typeof visitorId === "string" ? visitorId : null,
      sessionId: typeof sessionId === "string" ? sessionId : null,
      properties: properties as Prisma.InputJsonValue,
    },
  });
}
