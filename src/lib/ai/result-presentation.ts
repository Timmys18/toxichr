import type { AnalysisReport } from "./schemas";

/** Put the HR's supported lead and actions before the analyst's original order. */
export function prioritizeFindings<T extends { id: string }>(findings: T[], leadIds: string[], actionIds: string[]): T[] {
  const rank = new Map<string, number>();
  [...leadIds, ...actionIds].forEach((id, index) => { if (!rank.has(id)) rank.set(id, index); });
  return findings.map((item, index) => ({ item, index }))
    .sort((a, b) => (rank.get(a.item.id) ?? Infinity) - (rank.get(b.item.id) ?? Infinity) || a.index - b.index)
    .map(({ item }) => item);
}

/** Keep the HR's lead and every critical finding, even when they exceed the usual eight. */
export function selectReportFindings<T extends { id: string; severity: string }>(findings: T[], leadIds: string[], actionIds: string[], limit = 8): T[] {
  const ordered = prioritizeFindings(findings, leadIds, actionIds);
  const leads = new Set(leadIds);
  const essential = ordered.filter(item => leads.has(item.id) || item.severity === "critical");
  const rest = ordered.filter(item => !leads.has(item.id) && item.severity !== "critical");
  return [...essential, ...rest.slice(0, Math.max(0, limit - essential.length))];
}

/** Never attribute the analyst's first finding to the persona's lead. */
export function resultPresentation(report: AnalysisReport) {
  const assessment = report.professionalAssessment;
  const evidence = assessment ? [...assessment.findings, ...assessment.strengths] : [];
  const quotes = (report.verdict.findingIds ?? []).flatMap(id => {
    const item = evidence.find(item => item.id === id);
    return item ? [item.sourceQuote] : [];
  });
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim().toLocaleLowerCase("ru");
  const seen = new Set([normalize(report.verdict.comment), ...report.verdict.comment.split(/\n+/).map(normalize)]);
  // New reports have authored blocks. Legacy reports may concatenate the lead
  // into firstImpression: remove that exact prefix before de-duplicating.
  const candidates = report.contentBlocks?.length
    ? report.contentBlocks.map(block => block.content)
    : [report.hrReview.firstImpression.startsWith(report.verdict.comment)
      ? report.hrReview.firstImpression.slice(report.verdict.comment.length).trim()
      : report.hrReview.firstImpression, report.hrReview.deepDive, report.hrReview.hiringTake, report.hrReview.fixPriority];
  const paragraphs = candidates.flatMap(text => text.split(/\n+/)).map(text => text.trim()).filter(text => {
    const key = normalize(text);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { quotes: [...new Set(quotes)], paragraphs };
}
