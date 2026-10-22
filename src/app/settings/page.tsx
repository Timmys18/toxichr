import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { CabinetNav } from "@/components/shared/cabinet-nav";
import { PageContainer } from "@/components/ui/system";
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
      <main id="main" className="flex flex-1 flex-col">
        <PageContainer className="cabinet-view">
          <CabinetNav active="settings" />
          <div className="cabinet-content"><SettingsClient /></div>
        </PageContainer>
      </main>
    </>
  );
}
