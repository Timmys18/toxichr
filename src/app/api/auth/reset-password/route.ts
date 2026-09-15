import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const parsed = z.object({ token: z.string().min(20), password: z.string().min(8).max(100) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ссылка устарела или пароль слишком короткий." }, { status: 400 });
  const item = await prisma.passwordResetToken.findUnique({ where: { tokenHash: createHash("sha256").update(parsed.data.token).digest("hex") } });
  if (!item || item.usedAt || item.expiresAt < new Date()) return NextResponse.json({ error: "Ссылка устарела. Запроси новую ссылку." }, { status: 410 });
  await prisma.$transaction([prisma.user.update({ where: { id: item.userId }, data: { passwordHash: await hash(parsed.data.password, 10) } }), prisma.passwordResetToken.update({ where: { id: item.id }, data: { usedAt: new Date() } })]);
  return NextResponse.json({ ok: true });
}
