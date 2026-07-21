import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { PublicSharePayload } from "@/lib/public-share";
import { trackServer } from "@/lib/analytics";
import { auth } from "@/lib/auth";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;

  const share = await prisma.publicShare.findUnique({
    where: { slug },
  });

  if (!share || !share.active || share.revokedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (share.expiresAt && share.expiresAt < new Date()) {
    return NextResponse.json({ error: "Expired" }, { status: 410 });
  }

  return NextResponse.json({
    slug: share.slug,
    title: share.title,
    description: share.description,
    payload: share.publicPayload as PublicSharePayload,
    createdAt: share.createdAt,
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { slug } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const share = await prisma.publicShare.findUnique({
    where: { slug },
    include: { analysis: true },
  });
  if (!share) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const owns =
    share.userId === session.user.id ||
    share.analysis?.userId === session.user.id;

  if (!owns) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.publicShare.update({
    where: { id: share.id },
    data: { active: false, revokedAt: new Date() },
  });

  trackServer("public_share_revoked", { slug });

  return NextResponse.json({ ok: true });
}
