export const ANALYSIS_RETRY_MESSAGE =
  "Разбор не удалось завершить. Твои данные сохранены — попробуй ещё раз чуть позже.";

export function analysisErrorMessage(error: unknown): string {
  void error;
  return ANALYSIS_RETRY_MESSAGE;
}

const TECHNICAL_FAILURE =
  /failed to fetch|networkerror|network request failed|load failed|vpn|openai|anthropic|api[_ -]?key|fetch failed|econn|socket|сервер провайдера/i;

export function requestErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message.trim() || TECHNICAL_FAILURE.test(error.message)) {
    return fallback;
  }
  return error.message;
}
