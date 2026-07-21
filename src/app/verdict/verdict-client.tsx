"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { PERSONAS, SCORE_LABEL, type PersonaId } from "@/lib/personas";
import { PersonaSeal } from "@/components/personas/persona-seal";
import type { AnalysisReport } from "@/lib/ai/schemas";
import { Button } from "@/components/ui/button";

type Props = {
  analysisId: string;
};

function MetricRow({
  label,
  hint,
  value,
  barClass,
  invert,
}: {
  label: string;
  hint: string;
  value: number;
  barClass: string;
  invert?: boolean;
}) {
  const width = Math.max(4, Math.min(100, invert ? 100 - value : value));
  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-ink">{label}</div>
          <div className="mt-0.5 text-xs text-muted">{hint}</div>
        </div>
        <div className="font-mono text-xl tabular-nums text-ink">{value}</div>
      </div>
      <div className="metric-bar">
        <span className={barClass} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function VerdictClient({ analysisId }: Props) {
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/analyses/${analysisId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setReport(data.report);
        setPersonaId(data.personaId);
      })
      .catch((e) => setError(e.message));
  }, [analysisId]);

  if (error) {
    return (
      <div className="space-y-4 border border-roast/30 bg-surface p-6">
        <p className="font-display text-2xl text-ink">Разбор не загрузился</p>
        <p className="font-mono text-sm text-roast">{error}</p>
        <div className="flex flex-wrap gap-3">
          <Button href="/start">Новая прожарка</Button>
          <Button href={`/report?analysisId=${analysisId}`} variant="outline">
            К разбору
          </Button>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <p className="font-mono text-sm text-muted animate-pulse">
        Собираем вердикт HR…
      </p>
    );
  }

  const resolvedId = (personaId ??
    report.recommendedPersonaId) as PersonaId;
  const persona =
    PERSONAS.find((p) => p.id === resolvedId) ?? PERSONAS[1];
  const topHit = report.topProblems[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="relative"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-8 h-48 w-48 rounded-full blur-3xl"
        style={{ background: persona.accent.glow }}
      />

      {/* Persona voice */}
      <div className="relative flex items-start gap-4">
        <PersonaSeal personaId={persona.id} size="lg" />
        <div className="min-w-0 pt-1">
          <span
            className={`inline-flex px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] ${persona.accent.chip}`}
          >
            прожарка · {persona.name}
          </span>
          <p className="mt-3 text-sm text-muted">{persona.title}</p>
          <p className="mt-1 text-sm font-medium text-ink">{persona.tone}</p>
        </div>
      </div>

      <h1 className="relative mt-8 font-display text-[1.85rem] leading-[1.12] tracking-tight text-ink sm:text-[2.35rem]">
        {report.verdict.title}
      </h1>

      <p className="relative mt-4 max-w-xl text-base leading-relaxed text-muted">
        {report.verdict.comment}
      </p>

      {/* Score */}
      <div className="relative mt-8 flex flex-wrap items-end gap-6 border-y border-ink/10 py-6">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            {SCORE_LABEL.total.short}
          </div>
          <div className="mt-1 flex items-baseline gap-1 font-mono">
            <span className="text-6xl tabular-nums leading-none text-ink">
              {report.score.total}
            </span>
            <span className="text-sm text-muted">/100</span>
          </div>
        </div>
        <p className="max-w-xs pb-1 text-sm leading-relaxed text-muted">
          {SCORE_LABEL.total.hint}
        </p>
      </div>

      {/* Main punch from letter */}
      {report.hrReview?.firstImpression ? (
        <div className="relative mt-8 space-y-3 text-base leading-relaxed text-ink">
          {report.hrReview.firstImpression
            .split(/\n+/)
            .map((p) => p.trim())
            .filter(Boolean)
            .slice(0, 2)
            .map((p) => (
              <p key={p.slice(0, 20)}>{p}</p>
            ))}
        </div>
      ) : topHit ? (
        <div className="relative mt-8 border-l-2 border-roast pl-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-roast">
            главный удар
          </p>
          <p className="mt-2 font-display text-xl leading-snug text-ink">
            {topHit.title}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink">{topHit.roast}</p>
        </div>
      ) : null}

      {/* Metrics */}
      <div className="relative mt-10 space-y-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          метрики текста
        </p>
        <MetricRow
          label={SCORE_LABEL.evidence.short}
          hint={SCORE_LABEL.evidence.hint}
          value={report.score.evidence}
          barClass={persona.accent.bar}
        />
        <MetricRow
          label={SCORE_LABEL.positioning.short}
          hint={SCORE_LABEL.positioning.hint}
          value={report.score.positioning}
          barClass={persona.accent.bar}
        />
        <MetricRow
          label={SCORE_LABEL.water.short}
          hint={SCORE_LABEL.water.hint}
          value={report.viralMetrics.corporateWater}
          barClass="bg-roast"
          invert
        />
        <MetricRow
          label={SCORE_LABEL.level.short}
          hint={SCORE_LABEL.level.hint}
          value={report.score.seniorityConsistency}
          barClass={persona.accent.bar}
        />
      </div>

      <div className="relative mt-10 flex flex-col gap-3">
        <Button href={`/report?analysisId=${analysisId}`} size="lg">
          Открыть полный разбор
        </Button>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button href={`/share?analysisId=${analysisId}`} variant="secondary">
            Поделиться
          </Button>
          <Button
            href={`/auth?analysisId=${analysisId}&next=/history`}
            variant="outline"
          >
            Сохранить
          </Button>
        </div>
        <Button href="/start" variant="ghost">
          Другое резюме
        </Button>
      </div>
    </motion.div>
  );
}
