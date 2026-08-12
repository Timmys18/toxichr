import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TopNav } from "@/components/shared/top-nav";
import { RevengeClient } from "./revenge-client";

export const metadata: Metadata = { title: "Реванш" };

export default async function RevengePage({
  searchParams,
}: {
  searchParams: Promise<{ analysisId?: string }>;
}) {
  const { analysisId } = await searchParams;
  if (!analysisId) redirect("/");

  return (
    <>
      <TopNav />
      <main id="main" className="flex flex-1 flex-col">
        <RevengeClient analysisId={analysisId} />
      </main>
    </>
  );
}
