import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const parsed = z.object({ token: z.string().min(20), password: z.string().min(8).max(100) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ссылка устарела или пароль слишком короткий." }, { status: 400 });
  const item = await prisma.passwordResetToken.findUnique({ where: { tokenHash: createHash("sha256").update(parsed.data.token).digest("hex") } });
  const now = new Date();
  if (!item || item.usedAt || item.expiresAt <= now) return NextResponse.json({ error: "Ссылка устарела. Запроси новую ссылку." }, { status: 410 });
  const passwordHash = await hash(parsed.data.password, 10);
  const changed = await prisma.$transaction(async (tx) => {
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: item.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return false;
    await tx.user.update({ where: { id: item.userId }, data: { passwordHash } });
    await tx.passwordResetToken.updateMany({ where: { userId: item.userId, usedAt: null }, data: { usedAt: now } });
    return true;
  });
  if (!changed) return NextResponse.json({ error: "Ссылка устарела. Запроси новую ссылку." }, { status: 410 });
  return NextResponse.json({ ok: true });
}
