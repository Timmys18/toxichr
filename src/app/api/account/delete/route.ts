import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { trackServer } from "@/lib/analytics-server";
import { deleteAccountData } from "@/lib/account-deletion";

/** Revoke public data, remove uploads, and irreversibly anonymize the account. */
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await deleteAccountData(session.user.id);

  await trackServer("account_deleted");

  return NextResponse.json({ ok: true });
}

export async function POST() {
  return DELETE();
}
