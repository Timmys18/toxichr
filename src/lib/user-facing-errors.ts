export const ANALYSIS_RETRY_MESSAGE =
  "Разбор не удалось завершить. Твои данные сохранены — попробуй ещё раз чуть позже.";

export function analysisErrorMessage(error: unknown): string {
  void error;
  return ANALYSIS_RETRY_MESSAGE;
}
