import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const parsed = z.object({ email: z.string().email() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Укажи корректный email." }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.trim().toLowerCase() } });
  if (!user) return NextResponse.json({ ok: true, message: "Если аккаунт существует, ссылка готова." });
  const raw = randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(raw).digest("hex"), expiresAt: new Date(Date.now() + 30 * 60_000) } });
  return NextResponse.json({ ok: true, message: "Если аккаунт существует, ссылка отправлена. Открой её в течение 30 минут.", ...(process.env.NODE_ENV !== "production" ? { resetToken: raw } : {}) });
}
