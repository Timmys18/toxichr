import { aiMockEnabled, resolveProvider, runAi } from "./ai/gateway";
import { resumeHash } from "./ai/coordinated-plan";

export type DocumentPurposeDecision = "suitable" | "other" | "uncertain";

export type DocumentPurposeRecord = {
  schemaVersion: 1;
  textHash: string;
  decision: DocumentPurposeDecision;
  provider: string;
  model: string;
  checkedAt: string;
  costAmount: number;
  currency: string;
};

export function documentPurposeProvider() {
  return aiMockEnabled() ? "mock" : resolveProvider();
}

export function storedDocumentPurpose(content: unknown, text: string): DocumentPurposeRecord | null {
  if (!content || typeof content !== "object" || Array.isArray(content)) return null;
  const value = (content as { documentPurpose?: unknown }).documentPurpose;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<DocumentPurposeRecord>;
  return record.schemaVersion === 1 && record.textHash === resumeHash(text) &&
    record.provider === documentPurposeProvider() &&
    (record.decision === "suitable" || record.decision === "other" || record.decision === "uncertain")
    ? record as DocumentPurposeRecord : null;
}

export async function classifyDocumentPurpose(text: string): Promise<DocumentPurposeRecord> {
  const trimmed = text.trim();
  // The mock provider is strictly a local test mode; its verdict cannot be reused by a live provider.
  if (aiMockEnabled()) return {
    schemaVersion: 1, textHash: resumeHash(trimmed), decision: trimmed ? "suitable" : "uncertain",
    provider: "mock", model: "mock", checkedAt: new Date().toISOString(), costAmount: 0, currency: "USD",
  };
  const response = await runAi({
    stage: "classify",
    model: process.env.OPENAI_PURPOSE_MODEL || "gpt-5.4-mini",
    reasoningEffort: "none",
    maxTokens: 350,
    timeoutMs: 30_000,
    system: `Определи основное назначение переданного текста по всему его содержанию. Это проверка входа для сервиса профессионального разбора резюме, а не оценка качества кандидата.\n
Подходящий материал: текст представляет профессиональный опыт, навыки, достижения, проекты или квалификацию кандидата для представления его как специалиста. Принимай нестандартную структуру, связный рассказ и краткое описание опыта. Не требуй заголовков, контактов, дат, стажа или стандартного оформления.\n
Если основное назначение текста иное, выбери other, даже если в нём упоминается работа или профессия. Если по содержанию нельзя уверенно определить назначение либо текста недостаточно, выбери uncertain. Не оценивай достоверность или силу опыта. Верни только решение в JSON.`,
    user: trimmed,
    jsonSchemaName: "document_purpose_v1",
    jsonSchema: {
      type: "object", additionalProperties: false,
      properties: { decision: { type: "string", enum: ["suitable", "other", "uncertain"] } },
      required: ["decision"],
    },
  });
  let decision: unknown;
  try { decision = (JSON.parse(response.content) as { decision?: unknown }).decision; } catch { /* Treat malformed AI output as a technical error. */ }
  if (decision !== "suitable" && decision !== "other" && decision !== "uncertain") {
    throw new Error("AI не смог проверить назначение документа. Попробуй ещё раз.");
  }
  return {
    schemaVersion: 1, textHash: resumeHash(trimmed), decision,
    provider: response.provider, model: response.model, checkedAt: new Date().toISOString(),
    costAmount: response.cost?.amount ?? response.costUsd, currency: response.cost?.currency ?? "USD",
  };
}
