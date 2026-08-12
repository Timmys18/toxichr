import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { trackServer } from "@/lib/analytics-server";

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  displayName: z.string().min(1).max(80).optional(),
  analysisId: z.string().optional(),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Проверь email и пароль (минимум 8 символов)." },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "Этот email уже зарегистрирован. Войди." },
      { status: 409 },
    );
  }

  const passwordHash = await hash(parsed.data.password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName: parsed.data.displayName?.trim() || email.split("@")[0],
      consentVersion: "v1",
      lastLoginAt: new Date(),
    },
  });

  if (parsed.data.analysisId) {
    await prisma.analysis.updateMany({
      where: { id: parsed.data.analysisId, userId: null },
      data: { userId: user.id },
    });
    await prisma.resume.updateMany({
      where: {
        userId: null,
        versions: {
          some: {
            analyses: { some: { id: parsed.data.analysisId } },
          },
        },
      },
      data: { userId: user.id },
    });
  }

  await trackServer("auth_registered", { userId: user.id });

  return NextResponse.json({
    id: user.id,
    email: user.email,
  });
}
