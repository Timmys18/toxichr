export function shortVacancyTitle(title: string) {
  const firstSentence = title.replace(/\s*\/\s*/g, " · ").trim().split(/(?<=[.!?])\s+/)[0] ?? "";
  return firstSentence.length > 80 ? `${firstSentence.slice(0, 77).trimEnd()}…` : firstSentence || "Вакансия";
}
