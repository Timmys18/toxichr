import { NextResponse } from "next/server";
import { syncYooKassaPayment, TOXICHR_PACKAGE_PRODUCT_CODE } from "@/lib/package";
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
      if (result.productCode === TOXICHR_PACKAGE_PRODUCT_CODE) {
        await trackServer("package_purchased", {
          externalId,
          provider: "yookassa",
        }).catch(() => undefined);
      }
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
