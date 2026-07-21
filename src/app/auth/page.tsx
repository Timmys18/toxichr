import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { AuthClient } from "./auth-client";

export const metadata: Metadata = {
  title: "Вход",
};

export default function AuthPage() {
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
          className="pointer-events-none absolute left-[-8%] bottom-0 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle_at_center,rgba(200,241,53,0.16),transparent_68%)]"
        />
        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 items-center px-5 py-14 sm:px-8 lg:py-20">
          <Suspense
            fallback={
              <p className="font-mono text-sm text-muted">Открываем дверь…</p>
            }
          >
            <AuthClient />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
