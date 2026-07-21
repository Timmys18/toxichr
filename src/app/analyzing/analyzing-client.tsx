"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { PERSONAS, type PersonaId } from "@/lib/personas";
import type { TheatreFinding } from "@/lib/ai/schemas";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import {
  clearReferral,
  getOrCreateVisitorId,
  readReferral,
} from "@/lib/referral-client";

const STAGE_LABELS: Record<string, string> = {
  extract: "Извлекаем карьерные показания",
  classify: "Отделяем достижения от инструкции",
  seniority: "Проверяем заявленный уровень",
  evidence: "Ищем доказательства",
  water: "Измеряем корпоративную воду",
  language: "Проверяем язык",
  handoff: "Передаём дело HR",
};

type Props = {
  resumeId: string;
  personaId: PersonaId;
};

export function AnalyzingClient({ resumeId, personaId }: Props) {
  const router = useRouter();
  const [findings, setFindings] = useState<TheatreFinding[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const skipRef = useRef(false);

  const persona = PERSONAS.find((p) => p.id === personaId);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const res = await fetch("/api/analyses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resumeId, personaId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Анализ не удался");

        if (cancelled) return;
        setAnalysisId(data.analysisId);

        const ref = readReferral();
        if (ref) {
          void fetch("/api/referrals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              stage: "completed",
              visitorId: getOrCreateVisitorId(),
              slug: ref.slug,
              resumeId,
              analysisId: data.analysisId,
            }),
          }).finally(() => clearReferral());
        }

        const detail = await fetch(`/api/analyses/${data.analysisId}`);
        const analysis = await detail.json();
        if (cancelled) return;

        const theatre: TheatreFinding[] =
          analysis.report?.theatreFindings ?? [];
        setFindings(theatre);

        for (let i = 0; i < theatre.length; i++) {
          if (skipRef.current) {
            setVisibleCount(theatre.length);
            break;
          }
          await new Promise((r) => setTimeout(r, 650));
          if (cancelled) return;
          setVisibleCount(i + 1);
        }

        await new Promise((r) => setTimeout(r, skipRef.current ? 200 : 450));
        if (!cancelled) {
          track("verdict_viewed", { analysisId: data.analysisId });
          router.replace(`/verdict?analysisId=${data.analysisId}`);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Ошибка анализа");
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [resumeId, personaId, router]);

  const total = findings.length || 1;
  const progress = Math.min(100, Math.round((visibleCount / total) * 100));

  return (
    <div className="mx-auto w-full max-w-lg">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
        Analysis Theatre
        {persona ? ` · ${persona.name}` : null}
      </p>
      <h1 className="mt-3 font-display text-3xl tracking-tight text-ink sm:text-4xl">
        Дело в работе
      </h1>
      <p className="mt-3 text-muted leading-relaxed">
        Промежуточные сообщения — из реального разбора, не случайный лоадер.
      </p>

      <div className="mt-6 h-1 w-full overflow-hidden bg-ink/10">
        <motion.div
          className="h-full bg-toxic"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ ease: "easeOut", duration: 0.35 }}
        />
      </div>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        {visibleCount === 0 && !error
          ? "Снимаем отпечатки…"
          : `${visibleCount} / ${findings.length || "…"} находок`}
      </p>

      <ul className="mt-8 space-y-2">
        <AnimatePresence>
          {findings.slice(0, visibleCount).map((f, i) => (
            <motion.li
              key={f.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="border-l-2 border-signal/70 bg-surface px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-signal">
                  {STAGE_LABELS[f.stage] ?? f.stage}
                </div>
                <span className="font-mono text-[10px] text-muted">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-ink">
                {f.message}
              </p>
            </motion.li>
          ))}
        </AnimatePresence>
        {visibleCount === 0 && !error ? (
          <li className="font-mono text-sm text-muted animate-pulse">
            Снимаем отпечатки с текста…
          </li>
        ) : null}
      </ul>

      {analysisId && !error && visibleCount < findings.length ? (
        <Button
          className="mt-6"
          variant="ghost"
          size="sm"
          onClick={() => {
            skipRef.current = true;
            setVisibleCount(findings.length);
          }}
        >
          Пропустить анимацию
        </Button>
      ) : null}

      {error ? (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-roast" role="alert">
            {error}
          </p>
          <Button href="/start" variant="outline">
            Попробовать снова
          </Button>
        </div>
      ) : null}
    </div>
  );
}
