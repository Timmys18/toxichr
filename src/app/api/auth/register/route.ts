import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { trackServer } from "@/lib/analytics-server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  displayName: z.string().min(1).max(80).optional(),
  analysisId: z.string().optional(),
  consent: z.literal(true),
});

export async function POST(request: Request) {
  const limited = rateLimit(`register:${clientIp(request)}`, 10, 60 * 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Слишком много попыток. Попробуй позже." },
      { status: 429 },
    );
  }
  const body = await request.json().catch(() => null);
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Проверь email, пароль и согласие с правилами приватности." },
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
    const target = await prisma.analysis.findFirst({
      where: { id: parsed.data.analysisId, userId: null },
      include: { resumeVersion: { include: { resume: true } } },
    });

    if (target && !target.resumeVersion.resume.userId) {
      const resumeId = target.resumeVersion.resumeId;
      await prisma.$transaction([
        prisma.resume.updateMany({
          where: { id: resumeId, userId: null },
          data: { userId: user.id },
        }),
        prisma.analysis.updateMany({
          where: { resumeVersion: { resumeId }, userId: null },
          data: { userId: user.id },
        }),
        prisma.publicShare.updateMany({
          where: { userId: null, analysis: { resumeVersion: { resumeId } } },
          data: { userId: user.id },
        }),
        prisma.resumeImprovement.updateMany({
          where: { userId: null, analysis: { resumeVersion: { resumeId } } },
          data: { userId: user.id },
        }),
        prisma.vacancyMatch.updateMany({
          where: { userId: null, analysis: { resumeVersion: { resumeId } } },
          data: { userId: user.id },
        }),
        prisma.vacancy.updateMany({
          where: {
            userId: null,
            matches: { some: { analysis: { resumeVersion: { resumeId } } } },
          },
          data: { userId: user.id },
        }),
      ]);
    }
  }

  await trackServer("auth_registered", { userId: user.id });

  return NextResponse.json({
    id: user.id,
    email: user.email,
  });
}
