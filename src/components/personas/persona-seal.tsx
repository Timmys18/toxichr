import type { PersonaId } from "@/lib/personas";
import { cn } from "@/lib/utils";

const SEALS: Record<
  PersonaId,
  { letter: string; accent: string; ring: string }
> = {
  tamara: {
    letter: "Т",
    accent: "bg-ink text-paper",
    ring: "ring-ink/30",
  },
  lera: {
    letter: "Л",
    accent: "bg-signal text-paper",
    ring: "ring-signal/40",
  },
  gleb: {
    letter: "Г",
    accent: "bg-graphite text-toxic",
    ring: "ring-toxic/35",
  },
  vadik: {
    letter: "В",
    accent: "bg-roast text-paper",
    ring: "ring-roast/40",
  },
};

type Props = {
  personaId: PersonaId;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZES = {
  sm: "size-11 text-lg",
  md: "size-14 text-xl",
  lg: "size-[4.5rem] text-3xl",
};

/** Editorial monogram seal — not cartoon, not stock photo. */
export function PersonaSeal({ personaId, size = "md", className }: Props) {
  const seal = SEALS[personaId];

  return (
    <div
      aria-hidden
      className={cn(
        "relative flex shrink-0 items-center justify-center font-display ring-1",
        SIZES[size],
        seal.accent,
        seal.ring,
        className,
      )}
    >
      <span className="absolute inset-1 border border-current opacity-25" />
      <span className="relative leading-none tracking-tight">{seal.letter}</span>
    </div>
  );
}
