import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthClient } from "./auth-client";

export const metadata: Metadata = {
  title: "Вход",
};

export default function AuthPage() {
  return (
    <>
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
    </>
  );
}
