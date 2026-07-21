"use client";

import { useEffect } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { DemoRoast } from "@/components/landing/demo-roast";
import { track } from "@/lib/analytics";

export function LandingHero() {
  useEffect(() => {
    track("landing_viewed");
  }, []);

  return (
    <section className="relative flex min-h-[calc(100vh-5.5rem)] flex-1 flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 dossier-grid opacity-50"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 dossier-noise opacity-80"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 right-[-8%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(200,241,53,0.32),transparent_68%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-10%] left-[-12%] h-[420px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(201,24,48,0.09),transparent_70%)]"
      />

      <div className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-14 px-5 pb-20 pt-8 sm:px-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16 lg:px-12 lg:pb-24 lg:pt-6">
        <div>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="mb-6 font-mono text-[11px] uppercase tracking-[0.24em] text-muted"
          >
            Прожарка резюме · без регистрации
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.6,
              delay: 0.04,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="font-display text-[2.45rem] leading-[1.02] tracking-tight text-ink sm:text-5xl lg:text-[3.5rem]"
          >
            <span className="block text-[0.68em] font-medium text-muted">
              ToxicHR
            </span>
            <span className="mt-4 block">
              Самый токсичный HR{" "}
              <span className="marker-underline">тебя заждался.</span>
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.12 }}
            className="mt-6 max-w-xl font-display text-xl leading-snug text-ink sm:text-2xl"
          >
            Толерантность, деликатность и внимательность?{" "}
            <span className="text-muted">Их тут нет.</span>
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.18 }}
            className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg"
          >
            Прожарка круче стендапа: жёстко и саркастично — но по тексту, не по
            тебе. За пару минут и за цену чашки кофе услышишь честный ответ.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.24 }}
            className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <Button
              href="/start"
              size="xl"
              className="min-w-[280px]"
              onClick={() =>
                track("resume_upload_started", { source: "hero" })
              }
            >
              Бросить резюме на стол
            </Button>
            <a
              href="#how"
              className="px-1 font-mono text-[11px] uppercase tracking-[0.16em] text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Как это работает
            </a>
          </motion.div>

          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            PDF / DOCX · без регистрации · результат приватный
          </p>
        </div>

        <DemoRoast />
      </div>
    </section>
  );
}
