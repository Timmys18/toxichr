import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPackageSnapshot } from "@/lib/package";

export async function GET(request: Request) {
  const analysisId = new URL(request.url).searchParams.get("analysisId");
  if (!analysisId) return NextResponse.json({ error: "Нужен сохранённый разбор." }, { status: 400 });
  try {
    const session = await auth();
    return NextResponse.json(await getPackageSnapshot(analysisId, session?.user?.id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось проверить пакет." }, { status: 404 });
  }
}
