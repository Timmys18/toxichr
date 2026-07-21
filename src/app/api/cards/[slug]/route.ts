import { prisma } from "@/lib/prisma";
import type { PublicSharePayload } from "@/lib/public-share";
import {
  OG_SIZE,
  SQUARE_SIZE,
  STORY_SIZE,
  renderShareCard,
} from "@/lib/render-share-card";

type Params = { params: Promise<{ slug: string }> };

export const runtime = "nodejs";

export async function GET(request: Request, { params }: Params) {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") ?? "og";

  const share = await prisma.publicShare.findUnique({ where: { slug } });
  if (!share || !share.active || share.revokedAt) {
    return new Response("Not found", { status: 404 });
  }

  const payload = share.publicPayload as PublicSharePayload;
  const size =
    format === "square"
      ? SQUARE_SIZE
      : format === "story"
        ? STORY_SIZE
        : OG_SIZE;

  return renderShareCard(payload, size);
}
