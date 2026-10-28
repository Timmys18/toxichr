export function shortVacancyTitle(title: string) {
  const firstSentence = title.replace(/\s*\/\s*/g, " · ").trim().split(/(?<=[.!?])\s+/)[0] ?? "";
  return firstSentence.length > 80 ? `${firstSentence.slice(0, 77).trimEnd()}…` : firstSentence || "Вакансия";
}

export function shortResumeTitle(role: string | null | undefined, filename: string, resumeText?: string | null) {
  const normalizedRole = role?.replace(/\s+/g, " ").trim();
  const meaningfulRole = normalizedRole && !/^(?:кандидат|специалист|не определено|не указано|резюме|pasted\.txt|текст резюме)$/iu.test(normalizedRole) && !/\.(?:pdf|docx?|txt)$/iu.test(normalizedRole);
  const textRole = resumeText?.split(/\r?\n/, 1)[0]?.match(/^[^\n\r]{1,100}?[—–-]\s*([^\n\r.]{3,70})/u)?.[1]?.trim();
  const name = meaningfulRole
    ? normalizedRole
    : textRole || (/^(?:pasted\.txt|текст резюме)$/iu.test(filename) ? "Текст резюме" : filename.replace(/\.(?:pdf|docx?|txt)$/iu, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim());
  const readable = name || "Резюме";
  return readable.length > 48 ? `${readable.slice(0, 47).trimEnd()}…` : readable;
}
