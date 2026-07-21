"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { VerdictCardPreview } from "@/components/share/verdict-card-preview";
import type { PublicSharePayload } from "@/lib/public-share";
import type { ShareMetricKey } from "@/lib/share-studio";

type Props = {
  slug: string;
  payload: PublicSharePayload;
};

export function ToastClient({ slug, payload }: Props) {
  useEffect(() => {
    void fetch(`/api/public-shares/${slug}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType: "viewed" }),
    });
  }, [slug]);

  function trackCta() {
    void fetch(`/api/public-shares/${slug}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType: "cta_clicked" }),
    });
  }

  const metrics = payload.metrics
    .filter((m) => m.key !== "total")
    .map((m) => ({
      key: m.key as ShareMetricKey,
      label: m.label,
      value: m.value,
    }));

  return (
    <main className="relative flex flex-1 flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 dossier-grid opacity-35"
      />
      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 py-12 sm:px-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
          Публичный приговор · {payload.personaName}
        </p>
        <h1 className="mt-4 font-display text-3xl leading-tight tracking-tight text-ink sm:text-4xl">
          «{payload.verdictTitle}»
        </h1>
        <p className="mt-2 font-mono text-sm text-signal">
          Выживаемость: {payload.scoreTotal}/100
        </p>
        <blockquote className="mt-5 border-l-2 border-toxic pl-4 text-muted leading-relaxed">
          {payload.quote}
        </blockquote>

        {(payload.roleLabel || payload.levelLabel) && (
          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            {[payload.roleLabel, payload.levelLabel]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}

        <div className="mt-8">
          <VerdictCardPreview
            format="og"
            personaId={payload.personaId}
            verdictTitle={payload.verdictTitle}
            quote={payload.quote}
            scoreTotal={payload.scoreTotal}
            metrics={metrics}
            roleLabel={payload.roleLabel}
            levelLabel={payload.levelLabel}
          />
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <Button
            href={`/start?ref=${slug}&campaign=toast`}
            className="w-full"
            onClick={trackCta}
          >
            А моё резюме выживет?
          </Button>
          <Button
            href={`/challenge/${slug}`}
            variant="secondary"
            className="w-full"
            onClick={trackCta}
          >
            Принять challenge
          </Button>
          <p className="text-center font-mono text-[11px] text-muted">
            Полный текст резюме не публикуется. Только вердикт и метрики.
          </p>
          <Link
            href="/"
            className="text-center text-sm text-muted underline-offset-4 hover:underline"
          >
            Что такое ToxicHR
          </Link>
        </div>
      </div>
    </main>
  );
}
