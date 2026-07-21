import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
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
      <SiteHeader />
      <main id="main" className="relative flex flex-1 flex-col overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 dossier-grid opacity-35"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-[-10%] bottom-0 h-[300px] w-[300px] rounded-full bg-[radial-gradient(circle_at_center,rgba(201,24,48,0.08),transparent_70%)]"
        />
        <div className="relative z-10 mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
          <SettingsClient />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
