import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthClient } from "./auth-client";
import { ServicePage } from "@/components/ui/page-templates";
import { PageContainer } from "@/components/ui/system";

export const metadata: Metadata = {
  title: "Вход",
};

export default function AuthPage() {
  return (
    <ServicePage>
      <main id="main" className="flex flex-1 flex-col">
        <Suspense
          fallback={
            <PageContainer><p className="ds-page-loading thr-mono">Открываем дверь…</p></PageContainer>
          }
        >
          <AuthClient />
        </Suspense>
      </main>
    </ServicePage>
  );
}
