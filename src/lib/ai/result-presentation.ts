import type { AnalysisReport } from "./schemas";

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
