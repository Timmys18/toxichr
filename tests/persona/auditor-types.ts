import type { AnalysisReport } from '../../src/lib/ai/schemas';

export type Receipt = {
 id: number; model: string; schema?: string; boundUsd: number; startedAt: string; status: string;
 elapsedMs?: number; httpStatus?: number; requestId?: string | null; usage?: unknown; costUsd?: number;
};
export type ResultEntry = {
 caseId: string; personaId: string; status: string; elapsedMs: number; costUsd: number;
 verdict?: AnalysisReport['verdict']; error?: string; sourceDirectory?: string;
};
export type AuditManifest = {
 sourceCommit: string; budgetUsd: number; reservationLimitUsd: number; pricingSource: string;
 calls: Receipt[]; results: ResultEntry[]; reusedResults: ResultEntry[];
 reservedUsd: number; knownCostUsd: number; priorSpendUsd?: number; cumulativeCostUsd?: number;
 [key: string]: unknown;
};
