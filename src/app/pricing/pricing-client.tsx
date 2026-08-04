"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  analysisId: string | null;
  paywallOn?: boolean;
};

export function PricingClient({ analysisId, paywallOn = false }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    if (!analysisId) {
      window.location.href = "/";
      return;
    }
    if (!paywallOn) {
      window.location.href = `/session?view=${analysisId}`;
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId, productCode: "full_report" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-9">
      <Button
        onClick={buy}
        disabled={loading}
        className="w-full"
        size="lg"
      >
        {loading
          ? "Секунду…"
          : !analysisId
            ? "Сначала получи приговор"
            : paywallOn
              ? "Открыть полный разбор"
              : "Смотреть полный разбор — сейчас бесплатно"}
      </Button>
      {error ? (
        <p className="mt-3 font-mono text-xs text-roast">{error}</p>
      ) : (
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-paper/40">
          {paywallOn
            ? "Stripe · безопасная оплата"
            : "Закрытый тест · оплата ещё выключена"}
        </p>
      )}
    </div>
  );
}
