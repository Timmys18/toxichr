"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

type Verdict = "hit" | "miss" | "wrong_fact";

type Props = {
  analysisId: string;
  annotationId: string;
};

const OPTIONS: { verdict: Verdict; label: string }[] = [
  { verdict: "hit", label: "Попал" },
  { verdict: "miss", label: "Мимо" },
  { verdict: "wrong_fact", label: "Факт неверен" },
];

export function FeedbackButtons({ analysisId, annotationId }: Props) {
  const [selected, setSelected] = useState<Verdict | null>(null);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(verdict: Verdict, noteText?: string) {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/analyses/${analysisId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          annotationId,
          verdict,
          note: noteText,
        }),
      });

      if (!res.ok) {
        throw new Error("Не удалось сохранить");
      }

      setSelected(verdict);
      track("annotation_feedback", { analysisId, annotationId, verdict });
    } catch {
      setError("Не сохранилось. Попробуй ещё раз.");
    } finally {
      setSaving(false);
    }
  }

  function handleClick(verdict: Verdict) {
    if (selected || saving) return;

    if (verdict === "wrong_fact") {
      setShowNote(true);
      return;
    }

    void submit(verdict);
  }

  function handleNoteSubmit() {
    if (!note.trim()) {
      setError("Коротко опиши, что не так с фактом.");
      return;
    }
    void submit("wrong_fact", note.trim());
    setShowNote(false);
  }

  return (
    <div className="mt-4 border-t border-ink/10 pt-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        Это попало?
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {OPTIONS.map(({ verdict, label }) => (
          <button
            key={verdict}
            type="button"
            disabled={Boolean(selected) || saving}
            onClick={() => handleClick(verdict)}
            className={cn(
              "rounded-sm border px-3 py-1.5 font-mono text-xs transition-colors",
              selected === verdict
                ? "border-toxic bg-toxic/10 text-ink"
                : "border-ink/15 text-muted hover:border-ink/30 hover:text-ink",
              (selected && selected !== verdict) || saving
                ? "opacity-40"
                : "",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {showNote && !selected ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Что в факте неверно?"
            rows={2}
            className="w-full resize-none border border-ink/15 bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink/40"
          />
          <button
            type="button"
            onClick={handleNoteSubmit}
            disabled={saving}
            className="font-mono text-xs text-toxic hover:underline"
          >
            Отправить
          </button>
        </div>
      ) : null}

      {selected ? (
        <p className="mt-2 font-mono text-xs text-muted">Спасибо, учтём.</p>
      ) : null}

      {error ? (
        <p className="mt-2 font-mono text-xs text-roast">{error}</p>
      ) : null}
    </div>
  );
}
