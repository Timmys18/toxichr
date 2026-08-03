import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TopNav } from "@/components/shared/top-nav";
import { auth } from "@/lib/auth";
import { SettingsClient } from "./settings-client";

export const metadata: Metadata = {
  title: "Настройки",
};

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth?next=/settings");
  }

  return (
    <>
      <TopNav />
      <main id="main" className="flex flex-1 flex-col">
        <SettingsClient />
      </main>
    </>
  );
}
