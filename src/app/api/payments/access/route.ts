import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPackageSnapshot, refreshPendingPackagePayment } from "@/lib/package";

export async function GET(request: Request) {
  const analysisId = new URL(request.url).searchParams.get("analysisId");
  if (!analysisId) return NextResponse.json({ error: "Нужен сохранённый разбор." }, { status: 400 });
  try {
    const session = await auth();
    let verificationDelayed = false;
    if (new URL(request.url).searchParams.get("refresh") === "1") {
      try {
        await refreshPendingPackagePayment(analysisId, session?.user?.id);
      } catch (error) {
        verificationDelayed = true;
        console.error("[payments/access] provider verification delayed", error);
      }
    }
    return NextResponse.json({ ...await getPackageSnapshot(analysisId, session?.user?.id), verificationDelayed });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось проверить пакет." }, { status: 404 });
  }
}
