import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthClient } from "./auth-client";
import { ServicePage } from "@/components/ui/page-templates";

export const metadata: Metadata = {
  title: "Вход",
};

export default function AuthPage() {
  return (
    <ServicePage>
      <main id="main" className="flex flex-1 flex-col">
        <Suspense
          fallback={
            <p className="thr-mono" style={{ padding: 40, color: "var(--dim)" }}>
              Открываем дверь…
            </p>
          }
        >
          <AuthClient />
        </Suspense>
      </main>
    </ServicePage>
  );
}
