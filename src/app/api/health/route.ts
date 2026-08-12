import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.user.count();
    return NextResponse.json(
      { ok: true, service: "toxichr" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, service: "toxichr" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
