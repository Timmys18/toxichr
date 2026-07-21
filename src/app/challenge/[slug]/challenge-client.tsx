"use client";

import { useEffect } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { VerdictCardPreview } from "@/components/share/verdict-card-preview";
import type { PublicSharePayload } from "@/lib/public-share";
import type { ShareMetricKey } from "@/lib/share-studio";
import {
  getOrCreateVisitorId,
  rememberReferral,
} from "@/lib/referral-client";
import { track } from "@/lib/analytics";

type Props = {
  slug: string;
  payload: PublicSharePayload;
};

export function ChallengeClient({ slug, payload }: Props) {
  useEffect(() => {
    const visitorId = getOrCreateVisitorId();
    rememberReferral({ slug, campaign: "challenge" });

    void fetch("/api/referrals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        visitorId,
        campaign: "challenge",
        platform: "challenge_landing",
      }),
    }).then(async (res) => {
      const data = await res.json();
      if (data.referralId) {
        rememberReferral({
          slug,
          campaign: "challenge",
          referralId: data.referralId,
        });
      }
    });

    void fetch(`/api/public-shares/${slug}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "viewed",
        platform: "challenge",
        sessionId: visitorId,
      }),
    });

    track("challenge_joined", { slug });
  }, [slug]);

  const metrics = payload.metrics
    .filter((m) => m.key !== "total")
    .slice(0, 3)
    .map((m) => ({
      key: m.key as ShareMetricKey,
      label: m.label,
      value: m.value,
    }));

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 dossier-grid opacity-40"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 top-10 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(200,241,53,0.22),transparent_68%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 bottom-0 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle_at_center,rgba(215,38,61,0.12),transparent_70%)]"
      />

      <div className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-12 lg:py-16">
        <div>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-mono text-[11px] uppercase tracking-[0.22em] text-roast"
          >
            Challenge · тебя вызвали
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mt-4 font-display text-[2.4rem] leading-[1.05] tracking-tight text-ink sm:text-5xl"
          >
            <span className="block text-muted">Чей приговор злее?</span>
            <span className="mt-2 block">
              У соперника уже {payload.scoreTotal}/100.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="mt-5 max-w-lg text-base leading-relaxed text-muted sm:text-lg"
          >
            {payload.personaName} уже разнесла чужое резюме. Загрузи своё — без
            регистрации — и узнай, выдержишь ли удар.
          </motion.p>

          <blockquote className="mt-6 max-w-lg border-l-2 border-toxic pl-4 text-ink">
            «{payload.quote}»
          </blockquote>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button
              href={`/start?ref=${slug}&campaign=challenge`}
              size="xl"
              className="min-w-[240px]"
              onClick={() => {
                track("public_cta_clicked", {
                  slug,
                  source: "challenge",
                });
                void fetch(`/api/public-shares/${slug}/events`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    eventType: "cta_clicked",
                    platform: "challenge",
                  }),
                });
              }}
            >
              Принять вызов
            </Button>
            <Button href={`/toast/${slug}`} variant="outline" size="lg">
              Смотреть их приговор
            </Button>
          </div>

          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            PDF / DOCX · анонимно · без регистрации
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.55 }}
        >
          <VerdictCardPreview
            format="square"
            personaId={payload.personaId}
            verdictTitle={payload.verdictTitle}
            quote={payload.quote}
            scoreTotal={payload.scoreTotal}
            metrics={metrics}
            roleLabel={payload.roleLabel}
            levelLabel={payload.levelLabel}
          />
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Анонимный результат соперника · без резюме и PII
          </p>
        </motion.div>
      </div>
    </main>
  );
}
