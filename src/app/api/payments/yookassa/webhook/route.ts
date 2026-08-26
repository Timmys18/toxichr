import { NextResponse } from "next/server";
import { syncYooKassaPayment } from "@/lib/payments";
import { trackServer } from "@/lib/analytics-server";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null) as
    | { event?: string; object?: { id?: string } }
    | null;
  const externalId = payload?.object?.id;
  if (!externalId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    const result = await syncYooKassaPayment(externalId);
    if (result.status === "PAID") {
      await trackServer("payment_succeeded", {
        externalId,
        provider: "yookassa",
      }).catch(() => undefined);
    } else if (result.status === "FAILED") {
      await trackServer("payment_failed", {
        externalId,
        provider: "yookassa",
      }).catch(() => undefined);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("YooKassa webhook sync failed", error);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
