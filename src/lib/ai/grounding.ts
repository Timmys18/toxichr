import type { AnalysisReport, Problem } from "@/lib/ai/schemas";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[«»""„]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Quote must appear in resume (fuzzy substring). */
export function quoteInResume(quote: string, resumeText: string): boolean {
  const q = normalize(quote);
  if (q.length < 8) return false;
  const hay = normalize(resumeText);
  if (hay.includes(q)) return true;
  // Allow short excerpt: first 40 chars
  const head = q.slice(0, Math.min(40, q.length));
  return head.length >= 12 && hay.includes(head);
}

function findBestLine(quote: string, resumeText: string): string | null {
  const lines = resumeText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 20);
  const q = normalize(quote);
  let best: { line: string; score: number } | null = null;
  for (const line of lines) {
    const n = normalize(line);
    let score = 0;
    if (q.includes(n) || n.includes(q.slice(0, 24))) score = 3;
    else {
      const words = q.split(" ").filter((w) => w.length > 4);
      const hits = words.filter((w) => n.includes(w)).length;
      score = hits;
    }
    if (!best || score > best.score) best = { line, score };
  }
  return best && best.score >= 2 ? best.line : null;
}

function groundProblem(p: Problem, resumeText: string): Problem {
  if (quoteInResume(p.quote, resumeText)) return p;
  const fallback = findBestLine(p.quote, resumeText);
  if (fallback) {
    return {
      ...p,
      quote: fallback,
      diagnosis: `${p.diagnosis} (цитата привязана к ближайшему фрагменту резюме).`,
    };
  }
  // Drop invented quote — use roast without fake citation
  return {
    ...p,
    quote: "Фрагмент резюме не цитируется дословно — диагноз по совокупности текста.",
  };
}

function isGenericRoast(text: string): boolean {
  const t = normalize(text);
  const generics = [
    "резюме нужно улучшить",
    "добавьте больше деталей",
    "будьте конкретнее",
    "это хороший опыт",
    "рекомендуем переписать",
  ];
  return generics.some((g) => t.includes(g));
}

/** Enforce: quotes grounded, no empty generic punches, no invented scores. */
export function groundReport(
  report: AnalysisReport,
  resumeText: string,
): AnalysisReport {
  const topProblems = report.topProblems
    .map((p) => groundProblem(p, resumeText))
    .map((p) =>
      isGenericRoast(p.roast)
        ? {
            ...p,
            roast: `${p.roast.replace(/\.$/, "")} — на основании конкретной цитаты выше.`,
          }
        : p,
    );

  const strengths = report.strengths.map((s) => {
    if (!s.quote) return s;
    if (quoteInResume(s.quote, resumeText)) return s;
    const line = findBestLine(s.quote, resumeText);
    return line ? { ...s, quote: line } : { ...s, quote: undefined };
  });

  const shareQuotes = report.shareQuotes.filter(
    (q) => !isGenericRoast(q.text) && q.text.trim().length > 12,
  );

  return {
    ...report,
    topProblems,
    strengths,
    shareQuotes:
      shareQuotes.length > 0
        ? shareQuotes
        : report.shareQuotes.slice(0, 1),
  };
}
