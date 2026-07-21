"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { PERSONAS, type PersonaId } from "@/lib/personas";
import { PersonaSeal } from "@/components/personas/persona-seal";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

type ResumeMeta = {
  recommendedPersonaId: PersonaId;
  recommendationReason: string;
  preview: {
    responsibilitiesCount: number;
    achievementsCount: number;
    primaryRole: string | null;
  };
};

type Props = {
  resumeId: string;
};

export function PersonasClient({ resumeId }: Props) {
  const router = useRouter();
  const [meta, setMeta] = useState<ResumeMeta | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/resumes/${resumeId}`)
      .then((r) => r.json())
      .then((data) => {
        setMeta(data);
        track("persona_recommended", {
          persona: data.recommendedPersonaId,
        });
      })
      .catch(() => setMeta(null));
  }, [resumeId]);

  const startRoast = (personaId: PersonaId) => {
    setLoading(personaId);
    track("persona_selected", { persona: personaId });
    router.push(`/analyzing?resumeId=${resumeId}&persona=${personaId}`);
  };

  return (
    <>
      {meta ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-10 border border-signal/20 bg-signal/[0.04] px-5 py-5 sm:px-6"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-signal">
            Рекомендация следствия
          </p>
          <div className="mt-3 flex items-start gap-4">
            <PersonaSeal
              personaId={meta.recommendedPersonaId}
              size="md"
              className="mt-0.5"
            />
            <div>
              <p className="text-ink leading-relaxed">
                Для вашего резюме советуем{" "}
                <span className="font-display text-2xl">
                  {
                    PERSONAS.find((p) => p.id === meta.recommendedPersonaId)
                      ?.name
                  }
                </span>
                . {meta.recommendationReason}
              </p>
              {meta.preview.primaryRole ? (
                <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
                  {meta.preview.primaryRole} ·{" "}
                  {meta.preview.responsibilitiesCount} обязанностей ·{" "}
                  {meta.preview.achievementsCount} результатов
                </p>
              ) : null}
            </div>
          </div>
        </motion.div>
      ) : (
        <p className="mt-10 font-mono text-sm text-muted animate-pulse">
          Подбираем HR…
        </p>
      )}

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {PERSONAS.map((persona, index) => {
          const recommended = meta?.recommendedPersonaId === persona.id;
          return (
            <motion.article
              key={persona.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 * index, duration: 0.45 }}
              className={cn(
                "relative flex flex-col bg-surface p-6 transition-[box-shadow,border-color]",
                recommended
                  ? "border-2 border-ink surface-lift"
                  : "border border-ink/12 hover:border-ink/28",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <PersonaSeal personaId={persona.id} size="md" />
                  <div>
                    <h2 className="font-display text-2xl tracking-tight text-ink">
                      {persona.name}
                    </h2>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                      {persona.title}
                    </p>
                  </div>
                </div>
                {recommended ? (
                  <span className="shrink-0 bg-toxic px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink">
                    рекомендуем
                  </span>
                ) : null}
              </div>

              <p className="mt-6 text-[0.95rem] font-medium leading-snug text-ink">
                {persona.question}
              </p>
              <p className="mt-4 border-l-2 border-roast/80 pl-3 font-mono text-xs leading-relaxed text-roast">
                «{persona.quote}»
              </p>

              <ul className="mt-5 flex flex-wrap gap-1.5">
                {persona.lenses.map((lens) => (
                  <li
                    key={lens}
                    className="bg-paper-deep px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted"
                  >
                    {lens}
                  </li>
                ))}
              </ul>

              <Button
                className="mt-7 w-full"
                variant={recommended ? "primary" : "secondary"}
                disabled={loading !== null}
                onClick={() => startRoast(persona.id)}
              >
                {loading === persona.id ? "Передаём дело…" : "Начать прожарку"}
              </Button>
            </motion.article>
          );
        })}
      </div>
    </>
  );
}
