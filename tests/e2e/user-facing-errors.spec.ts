import { expect, test } from "@playwright/test";
import {
  ANALYSIS_RETRY_MESSAGE,
  analysisErrorMessage,
} from "../../src/lib/user-facing-errors";

test("ошибка анализа не раскрывает инфраструктуру и обещает сохранность данных", () => {
  const internalFailures = [
    new Error("Проверь VPN и OPENAI_API_KEY"),
    new Error("OpenAI 503: upstream unavailable"),
    new Error("Сервер провайдера недоступен"),
  ];

  for (const failure of internalFailures) {
    const message = analysisErrorMessage(failure);
    expect(message).toBe(ANALYSIS_RETRY_MESSAGE);
    expect(message).not.toMatch(/vpn|openai|anthropic|api[_ -]?key|сервер|провайдер/i);
    expect(message).toContain("данные сохранены");
  }
});
