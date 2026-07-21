import { PERSONAS, type PersonaId } from "@/lib/personas";
import type { ShareFormat, ShareMetricKey } from "@/lib/share-studio";
import { cn } from "@/lib/utils";

type Props = {
  format: ShareFormat;
  personaId: string;
  verdictTitle: string;
  quote: string;
  scoreTotal: number;
  metrics: { key: ShareMetricKey; label: string; value: number }[];
  roleLabel?: string | null;
  levelLabel?: string | null;
  className?: string;
};

export function VerdictCardPreview({
  format,
  personaId,
  verdictTitle,
  quote,
  scoreTotal,
  metrics,
  roleLabel,
  levelLabel,
  className,
}: Props) {
  const persona =
    PERSONAS.find((p) => p.id === personaId) ??
    PERSONAS.find((p) => p.id === "lera")!;

  const ratio =
    format === "og"
      ? "aspect-[1200/630]"
      : format === "square"
        ? "aspect-square"
        : "aspect-[1080/1920]";

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden border border-ink/15 bg-ink text-paper shadow-[0_24px_60px_rgba(18,18,18,0.18)]",
        ratio,
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(#f3efe6 1px, transparent 1px), linear-gradient(90deg, #f3efe6 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-toxic/25 blur-3xl"
      />

      <div
        className={cn(
          "relative flex h-full flex-col justify-between p-5 sm:p-7",
          format === "story" && "p-6 sm:p-8",
        )}
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-toxic">
              ToxicHR · прожарка
            </p>
            <p className="mt-2 font-display text-lg leading-tight text-paper sm:text-xl">
              {persona.name}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-paper/55">
              {persona.title}
            </p>
          </div>
          <div className="shrink-0 border border-toxic/40 bg-toxic/10 px-3 py-2 text-right">
            <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-toxic">
              убедительность
            </div>
            <div className="mt-0.5 font-mono text-2xl tabular-nums text-toxic">
              {scoreTotal}
              <span className="text-sm text-paper/40">/100</span>
            </div>
          </div>
        </header>

        <div className={cn(format === "story" ? "my-8" : "my-4")}>
          {(roleLabel || levelLabel) && (
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-paper/45">
              {[roleLabel, levelLabel].filter(Boolean).join(" · ")}
            </p>
          )}
          <h2
            className={cn(
              "font-display leading-[1.15] tracking-tight text-paper",
              format === "story" ? "text-3xl" : "text-xl sm:text-2xl",
            )}
          >
            «{verdictTitle}»
          </h2>
          <blockquote
            className={cn(
              "mt-4 border-l-2 border-toxic/70 pl-3 text-paper/75",
              format === "story" ? "text-base" : "text-sm",
            )}
          >
            {quote}
          </blockquote>
        </div>

        <footer>
          {metrics.length > 0 && (
            <div
              className={cn(
                "grid gap-2 border-t border-paper/10 pt-4",
                metrics.length <= 2
                  ? "grid-cols-2"
                  : metrics.length === 3
                    ? "grid-cols-3"
                    : "grid-cols-2 sm:grid-cols-4",
              )}
            >
              {metrics.map((m) => (
                <div key={m.key}>
                  <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-paper/40">
                    {m.label}
                  </div>
                  <div className="mt-0.5 font-mono text-lg tabular-nums text-paper">
                    {m.value}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-paper/35">
            toxichr · а моё резюме выживет?
          </p>
        </footer>
      </div>
    </div>
  );
}

export function isPersonaId(value: string): value is PersonaId {
  return PERSONAS.some((p) => p.id === value);
}
