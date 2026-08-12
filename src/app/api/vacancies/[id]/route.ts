import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Нужен вход." }, { status: 401 });
  }

  const { id } = await params;
  const vacancy = await prisma.vacancy.findFirst({
    where: { id, userId: session.user.id },
    include: {
      matches: {
        where: { userId: session.user.id },
        orderBy: { updatedAt: "desc" },
        select: { analysisId: true, result: true },
      },
    },
  });

  if (!vacancy) {
    return NextResponse.json({ error: "Вакансия не найдена." }, { status: 404 });
  }

  const latestMatch = vacancy.matches[0] ?? null;
  return NextResponse.json({
    id: vacancy.id,
    text: vacancy.sourceText,
    analysisId: latestMatch?.analysisId ?? null,
    result: latestMatch?.result ?? vacancy.review,
    createdAt: vacancy.createdAt,
  });
}
