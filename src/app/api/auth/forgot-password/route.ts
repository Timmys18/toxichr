import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { passwordResetEmailConfigured, sendPasswordResetEmail } from "@/lib/password-reset-email";

const success = { ok: true, message: "Если аккаунт существует, ссылка для сброса отправлена на почту." };

export async function POST(request: Request) {
  const parsed = z.object({ email: z.string().email() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Укажи корректный email." }, { status: 400 });
  const email = parsed.data.email.trim().toLowerCase();
  const limited = rateLimit(`forgot-password:${clientIp(request)}:${email}`, 5, 60 * 60_000);
  if (!limited.ok) return NextResponse.json({ error: "Слишком много запросов. Попробуй позже." }, { status: 429 });
  if (!passwordResetEmailConfigured()) {
    return NextResponse.json({ error: "Восстановление по почте временно недоступно." }, { status: 503 });
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return NextResponse.json(success);
  const raw = randomBytes(32).toString("hex");
  const item = await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(raw).digest("hex"), expiresAt: new Date(Date.now() + 30 * 60_000) } });
  try {
    await sendPasswordResetEmail(email, raw);
  } catch (error) {
    await prisma.passwordResetToken.delete({ where: { id: item.id } });
    console.error("Password reset email delivery failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Не удалось отправить письмо. Попробуй позже." }, { status: 502 });
  }
  return NextResponse.json(success);
}
