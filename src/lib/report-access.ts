import type { AnalysisReport } from "@/lib/ai/schemas";

/**
 * Пейволл внутри разбора отключён по продуктовому решению: разбор
 * показывается целиком. Монетизация — на действиях (исправить,
 * сравнить с вакансией), не на урезании заключения.
 */
export function redactReportForFree(report: AnalysisReport): AnalysisReport {
  return report;
}
