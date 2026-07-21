"use client";

import { useState } from "react";
import type { Problem, Strength } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils";

type Props = {
  problems: Problem[];
  strengths?: Strength[];
};

function severityClass(severity: Problem["severity"]) {
  switch (severity) {
    case "critical":
      return "border-l-roast bg-roast/5";
    case "high":
      return "border-l-[#c45c1a] bg-[#c45c1a]/5";
    case "medium":
      return "border-l-signal/70 bg-signal/5";
    default:
      return "border-l-muted bg-muted/5";
  }
}

function severityLabel(severity: Problem["severity"]) {
  switch (severity) {
    case "critical":
      return "критично";
    case "high":
      return "слабо";
    case "medium":
      return "вопрос";
    default:
      return "заметка";
  }
}

export function AnnotationMarkup({ problems, strengths = [] }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(
    problems[0]?.id ?? null,
  );

  const selected = problems.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 bg-roast" /> критично
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 bg-[#c45c1a]" /> слабо
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 bg-signal" /> вопрос
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 bg-ok" /> сильное
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(260px,340px)]">
        <ul className="space-y-2">
          {problems.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={cn(
                  "w-full border-l-4 px-4 py-3 text-left transition-colors",
                  severityClass(p.severity),
                  selectedId === p.id
                    ? "border border-ink/20 bg-surface shadow-[0_8px_24px_rgba(18,18,18,0.06)]"
                    : "border border-transparent hover:border-ink/10",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    {severityLabel(p.severity)}
                  </span>
                  <span className="font-mono text-[10px] text-muted">
                    {p.title.slice(0, 28)}
                    {p.title.length > 28 ? "…" : ""}
                  </span>
                </div>
                <blockquote className="mt-2 text-sm leading-relaxed text-ink">
                  «{p.quote}»
                </blockquote>
              </button>
            </li>
          ))}

          {strengths
            .filter((s) => s.quote)
            .map((s) => (
              <li
                key={s.id}
                className="border border-ok/25 border-l-4 border-l-ok bg-ok/5 px-4 py-3"
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ok">
                  сильное
                </span>
                <blockquote className="mt-2 text-sm text-ink">
                  «{s.quote}»
                </blockquote>
                <p className="mt-1 text-sm text-muted">{s.comment}</p>
              </li>
            ))}
        </ul>

        <aside className="border border-ink/10 bg-surface p-5 lg:sticky lg:top-8 lg:self-start">
          {selected ? (
            <>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-roast">
                {severityLabel(selected.severity)} · удар
              </p>
              <h3 className="mt-2 font-display text-xl text-ink">
                {selected.title}
              </h3>
              <p className="mt-3 font-mono text-sm text-roast">
                {selected.roast}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink">
                {selected.diagnosis}
              </p>
              <p className="mt-4 text-sm text-muted">
                <strong className="text-ink">Что сделать:</strong>{" "}
                {selected.recommendation}
              </p>
              {selected.suggestedRewrite ? (
                <p className="mt-4 border border-ok/25 bg-ok/5 p-3 text-sm text-ink">
                  <strong>Каркас:</strong> {selected.suggestedRewrite}
                </p>
              ) : null}
            </>
          ) : (
            <p className="font-mono text-sm text-muted">
              Выбери цитату слева.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
