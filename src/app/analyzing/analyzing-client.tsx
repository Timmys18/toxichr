"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { PERSONAS, type PersonaId } from "@/lib/personas";
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
  score: "Считаем убедительность",
  persona: "Дело у HR",
  handoff: "Передаём дело HR",
};

const STAGE_STATUS: Record<string, string> = {
  extract: "Читаем резюме и строим карту доказательств…",
  score: "Считаем убедительность по карте…",
  persona: "HR пишет заключение…",
};

type LiveFinding = {
  id: string;
  stage: string;
  message: string;
};

type StreamEvent =
  | { type: "stage"; stage: string; status: "start" | "done" }
  | { type: "finding"; stage: string; message: string }
  | { type: "completed"; analysisId: string }
  | { type: "error"; message: string };

type Props = {
  resumeId: string;
  personaId: PersonaId;
};

async function reportReferral(resumeId: string, analysisId: string) {
  const ref = readReferral();
  if (!ref) return;
  void fetch("/api/referrals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stage: "completed",
      visitorId: getOrCreateVisitorId(),
      slug: ref.slug,
      resumeId,
      analysisId,
    }),
  }).finally(() => clearReferral());
}

export function AnalyzingClient({ resumeId, personaId }: Props) {
  const router = useRouter();
  const [findings, setFindings] = useState<LiveFinding[]>([]);
  const [activeStage, setActiveStage] = useState<string>("extract");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const startedRef = useRef(false);

  const persona = PERSONAS.find((p) => p.id === personaId);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;
    let counter = 0;

    function handleEvent(event: StreamEvent) {
      if (cancelled) return;
      if (event.type === "stage") {
        if (event.status === "start") setActiveStage(event.stage);
        return;
      }
      if (event.type === "finding") {
        counter += 1;
        const finding: LiveFinding = {
          id: `live-${counter}`,
          stage: event.stage,
          message: event.message,
        };
        setFindings((prev) => [...prev, finding]);
        return;
      }
      if (event.type === "completed") {
        setDone(true);
        void reportReferral(resumeId, event.analysisId);
        track("verdict_viewed", { analysisId: event.analysisId });
        // Дать дочитать последнюю находку, потом — приговор.
        setTimeout(() => {
          if (!cancelled) {
            router.replace(`/verdict?analysisId=${event.analysisId}`);
          }
        }, 900);
        return;
      }
      if (event.type === "error") {
        setError(event.message);
      }
    }

    async function runStreaming(): Promise<boolean> {
      const res = await fetch("/api/analyses/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId, personaId }),
      });
      if (!res.ok || !res.body) {
        if (res.headers.get("Content-Type")?.includes("json")) {
          const data = await res.json().catch(() => null);
          if (data?.error) throw new Error(data.error);
        }
        return false;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawEvent = false;

      for (;;) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (!line) continue;
          try {
            const event = JSON.parse(line.slice(6)) as StreamEvent;
            sawEvent = true;
            handleEvent(event);
          } catch {
            /* пропускаем битый chunk */
          }
        }
      }
      return sawEvent;
    }

    async function runFallback() {
      // Старый sync-путь: POST + реплей готовых находок.
      const res = await fetch("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId, personaId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Анализ не удался");

      const detail = await fetch(`/api/analyses/${data.analysisId}`);
      const analysis = await detail.json();
      const theatre: Array<{ id: string; stage: string; message: string }> =
        analysis.report?.theatreFindings ?? [];
      for (const f of theatre) {
        if (cancelled) return;
        handleEvent({ type: "finding", stage: f.stage, message: f.message });
        await new Promise((r) => setTimeout(r, 500));
      }
      handleEvent({ type: "completed", analysisId: data.analysisId });
    }

    (async () => {
      try {
        const streamed = await runStreaming();
        if (!streamed && !cancelled) await runFallback();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Ошибка анализа");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resumeId, personaId, router]);

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
        Всё, что появляется ниже — реальные находки анализа, не лоадер.
      </p>

      <div className="mt-6 h-1 w-full overflow-hidden bg-ink/10">
        <motion.div
          className="h-full bg-toxic"
          animate={{
            width: done
              ? "100%"
              : activeStage === "persona"
                ? "82%"
                : activeStage === "score"
                  ? "55%"
                  : "28%",
          }}
          transition={{ ease: "easeOut", duration: 0.6 }}
        />
      </div>
      <p
        className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted"
        aria-live="polite"
      >
        {error
          ? "Анализ остановлен"
          : done
            ? "Готово. Выносим вердикт…"
            : (STAGE_STATUS[activeStage] ?? "Снимаем отпечатки…")}
      </p>

      <ul className="mt-8 space-y-2">
        <AnimatePresence>
          {findings.map((f, i) => (
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
        {findings.length === 0 && !error ? (
          <li className="font-mono text-sm text-muted animate-pulse">
            Снимаем отпечатки с текста…
          </li>
        ) : null}
      </ul>

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
