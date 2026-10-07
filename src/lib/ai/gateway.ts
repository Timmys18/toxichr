import { recordCalibrationAiCall } from "@/lib/ai/calibration-audit";

/**
 * AI Gateway. Без ключа выбранного провайдера анализ не притворяется «живым».
 */

export type AiStage =
  | "extract"
  | "classify"
  | "evidence"
  | "score"
  | "persona"
  | "grounding"
  | "anti_generic"
  | "vacancy"
  | "vacancy_match";

export type AiProvider = "openai" | "anthropic" | "yandex";

export type AiRequest = {
  stage: AiStage;
  system: string;
  user: string;
  jsonSchemaName?: string;
  /** JSON Schema для strict Structured Outputs у OpenAI. */
  jsonSchema?: Record<string, unknown>;
  /** 0–1: аналитические этапы низкая, персона — высокая */
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
  /** Модель на этот вызов (аналитике — быстрая mini, персоне — сильная) */
  model?: string;
};

export type AiResponse = {
  provider: AiProvider;
  model: string;
  content: string;
  tokensIn: number;
  tokensOut: number;
  /** Валюта провайдера; новое поле для корректной телеметрии. */
  cost?: { amount: number; currency: "USD" | "RUB" };
  /** @deprecated Совместимость со старой телеметрией до её миграции на cost. */
  costUsd: number;
};

export class AiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigError";
  }
}

export class AiTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiTimeoutError";
  }
}

/** Explicit Yandex routing only. Never forward a secret to an arbitrary URL. */
export function yandexBaseUrl(): string {
  const base = (process.env.YANDEX_AI_BASE_URL?.trim() || "https://ai.api.cloud.yandex.net/v1").replace(/\/+$/, "");
  if (base !== "https://ai.api.cloud.yandex.net/v1" && base !== "https://llm.api.cloud.yandex.net/v1") {
    throw new AiConfigError("YANDEX_AI_BASE_URL должен указывать на один из двух разрешённых HTTPS-адресов Yandex AI Studio.");
  }
  return base;
}

function hasOpenAiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

function hasYandexCredentials(): boolean {
  return Boolean(
    process.env.YANDEX_AI_API_KEY?.trim() &&
    process.env.YANDEX_AI_FOLDER_ID?.trim(),
  );
}

/** Какой провайдер выбран. По умолчанию — OpenAI для обратной совместимости. */
export function resolveProvider(): AiProvider {
  const configured = (process.env.AI_PROVIDER ?? "openai").trim().toLowerCase();
  if (configured === "openai") return "openai";
  if (configured === "anthropic") return "anthropic";
  if (configured === "yandex") return "yandex";
  throw new AiConfigError(
    `Неизвестный AI_PROVIDER: ${configured || "<пусто>"}. Разрешены openai, anthropic, yandex или mock.`,
  );
}

export function aiLiveEnabled(): boolean {
  if (aiMockEnabled()) return false;
  const provider = resolveProvider();
  if (provider === "openai") return hasOpenAiKey();
  if (provider === "anthropic") return hasAnthropicKey();
  return hasYandexCredentials();
}

/** Локальный честный режим для разработки и smoke-тестов без внешнего AI. */
export function aiMockEnabled(): boolean {
  return (process.env.AI_PROVIDER ?? "").trim().toLowerCase() === "mock";
}

/** Понятная ошибка, если ключа нет. */
export function assertAiReady(): void {
  const provider = resolveProvider();
  if (provider === "openai" && !hasOpenAiKey()) {
    throw new AiConfigError(
      "Нужен ключ ChatGPT: добавь OPENAI_API_KEY в файл .env (ключ с platform.openai.com) и перезапусти сервер.",
    );
  }
  if (provider === "anthropic" && !hasAnthropicKey()) {
    throw new AiConfigError(
      "Нужен ключ Anthropic: добавь ANTHROPIC_API_KEY в файл .env и перезапусти сервер.",
    );
  }
  if (provider === "yandex" && !hasYandexCredentials()) {
    throw new AiConfigError(
      "Для YandexGPT нужны YANDEX_AI_API_KEY и YANDEX_AI_FOLDER_ID в секретах окружения.",
    );
  }
}

const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? "45000");

/** fetch с таймаутом: без него зависший вызов AI вешает весь разбор навсегда. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms = AI_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new AiTimeoutError(
        `AI не ответил за ${Math.round(ms / 1000)}с. Попробуй ещё раз.`,
      );
    }
    throw new Error(
      "Не удалось связаться с AI. Попробуй ещё раз.",
    );
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAi(
  system: string,
  user: string,
  options?: { temperature?: number; maxTokens?: number; model?: string; jsonSchemaName?: string; jsonSchema?: Record<string, unknown>; timeoutMs?: number; reasoningEffort?: "minimal" | "low" | "medium" | "high" },
): Promise<AiResponse> {
  const model = options?.model ?? process.env.OPENAI_MODEL ?? "gpt-4o";
  const baseRaw = process.env.OPENAI_BASE_URL?.trim();
  const base = (baseRaw || "https://api.openai.com/v1").replace(/\/$/, "");
  const res = await fetchWithTimeout(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY!.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      ...(model.startsWith("gpt-5")
        ? { max_completion_tokens: options?.maxTokens ?? 4500, reasoning_effort: options?.reasoningEffort ?? "low" }
        : { temperature: options?.temperature ?? 0.9, max_tokens: options?.maxTokens ?? 4500 }),
      response_format: options?.jsonSchema
        ? {
            type: "json_schema",
            json_schema: {
              name: options.jsonSchemaName ?? "toxichr_output",
              strict: true,
              schema: options.jsonSchema,
            },
          }
        : { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  }, options?.timeoutMs);

  if (!res.ok) {
    const err = await res.text();
    if (res.status === 401) {
      throw new AiConfigError(
        "Ключ OpenAI не принят. Проверь OPENAI_API_KEY на platform.openai.com.",
      );
    }
    if (res.status === 403 && /country|region|territory/i.test(err)) {
      throw new AiConfigError("OpenAI недоступен в регионе размещения сервера. Выбери поддерживаемого провайдера.");
    }
    if (res.status === 429) {
      throw new Error(
        "OpenAI временно ограничил запросы. Подожди минуту и попробуй снова.",
      );
    }
    throw new Error(`OpenAI ${res.status}: ${err.slice(0, 240)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const content = data.choices?.[0]?.message?.content ?? "{}";
  const tokensIn = data.usage?.prompt_tokens ?? 0;
  const tokensOut = data.usage?.completion_tokens ?? 0;
  // rough gpt-4o list prices
  const costUsd = tokensIn * 0.0000025 + tokensOut * 0.00001;

  return {
    provider: "openai",
    model,
    content,
    tokensIn,
    tokensOut,
    cost: { amount: costUsd, currency: "USD" },
    costUsd,
  };
}

async function callAnthropic(
  system: string,
  user: string,
  options?: { temperature?: number; maxTokens?: number },
): Promise<AiResponse> {
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";
  const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!.trim(),
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature ?? 0.7,
      system,
      messages: [
        {
          role: "user",
          content: `${user}\n\nОтветь только валидным JSON.`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    if (res.status === 401) {
      throw new AiConfigError(
        "Ключ Anthropic не принят. Проверь ANTHROPIC_API_KEY.",
      );
    }
    throw new Error(`Anthropic ${res.status}: ${err.slice(0, 240)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  const text =
    data.content?.find((c) => c.type === "text")?.text ??
    data.content?.[0]?.text ??
    "{}";
  const tokensIn = data.usage?.input_tokens ?? 0;
  const tokensOut = data.usage?.output_tokens ?? 0;

  return {
    provider: "anthropic",
    model,
    content: text,
    tokensIn,
    tokensOut,
    cost: { amount: tokensIn * 0.000003 + tokensOut * 0.000015, currency: "USD" },
    costUsd: tokensIn * 0.000003 + tokensOut * 0.000015,
  };
}

async function callYandex(
  system: string,
  user: string,
  options?: { temperature?: number; maxTokens?: number; jsonSchemaName?: string; jsonSchema?: Record<string, unknown>; timeoutMs?: number },
): Promise<AiResponse> {
  const folderId = process.env.YANDEX_AI_FOLDER_ID!.trim();
  const model = `gpt://${folderId}/yandexgpt-5.1`;
  const res = await fetchWithTimeout(`${yandexBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Api-Key ${process.env.YANDEX_AI_API_KEY!.trim()}`,
      "Content-Type": "application/json",
      "OpenAI-Project": folderId,
      "x-data-logging-enabled": "false",
    },
    body: JSON.stringify({
      model,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 4500,
      stream: false,
      response_format: options?.jsonSchema
        ? {
            type: "json_schema",
            json_schema: {
              name: options.jsonSchemaName ?? "toxichr_output",
              // Контракт API поддерживает strict, но для Pro 5.1 включаем его
              // только после отдельного live-smoke на синтетических данных.
              strict: false,
              schema: options.jsonSchema,
            },
          }
        : { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  }, options?.timeoutMs);

  if (!res.ok) {
    const err = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new AiConfigError(
        "Yandex AI Studio не принял ключ или у сервисного аккаунта нет роли ai.languageModels.user.",
      );
    }
    if (res.status === 429) {
      throw new Error("Yandex AI Studio временно ограничил запросы. Попробуй ещё раз позже.");
    }
    throw new Error(`Yandex AI Studio ${res.status}: ${err.slice(0, 240)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const choice = data.choices?.[0];
  const content = choice?.message?.content?.trim();
  if (!content) {
    throw new Error("Yandex AI Studio вернул пустой ответ.");
  }
  if (choice?.finish_reason !== "stop") {
    throw new Error(`Yandex AI Studio завершил ответ с причиной ${choice?.finish_reason ?? "unknown"}.`);
  }
  try {
    JSON.parse(content);
  } catch {
    throw new Error("Yandex AI Studio вернул невалидный JSON.");
  }
  const tokensIn = data.usage?.prompt_tokens ?? 0;
  const tokensOut = data.usage?.completion_tokens ?? 0;
  const costRub = (tokensIn + tokensOut) * 0.0008;
  return {
    provider: "yandex",
    model,
    content,
    tokensIn,
    tokensOut,
    cost: { amount: costRub, currency: "RUB" },
    // Оставлено только для обратной совместимости; рублёвая стоимость — в cost.
    costUsd: 0,
  };
}

export async function runAi(request: AiRequest): Promise<AiResponse> {
  assertAiReady();
  const provider = resolveProvider();

  const options = {
    temperature: request.temperature,
    maxTokens: request.maxTokens,
    model: request.model,
    jsonSchemaName: request.jsonSchemaName,
    jsonSchema: request.jsonSchema,
    timeoutMs: request.timeoutMs,
    reasoningEffort: request.reasoningEffort,
  };

  try {
    const response = provider === "openai"
      ? await callOpenAi(request.system, request.user, options)
      : provider === "anthropic"
        ? await callAnthropic(request.system, request.user, options)
        : await callYandex(request.system, request.user, options);
    recordCalibrationAiCall({ stage: request.stage, provider: response.provider, model: response.model, status: "success" });
    return response;
  } catch (error) {
    recordCalibrationAiCall({ stage: request.stage, provider, model: request.model ?? "default", status: "error" });
    throw error;
  }
}

/**
 * Потоковый вызов (только OpenAI). onChunk получает куски текста по мере
 * генерации — так разбор печатается вживую, а не ждётся целиком.
 * Для не-OpenAI и при ошибке — прозрачный fallback на обычный runAi.
 */
export async function runAiStream(
  request: AiRequest,
  onChunk: (delta: string) => void,
): Promise<AiResponse> {
  assertAiReady();
  if (resolveProvider() !== "openai") {
    const r = await runAi(request);
    onChunk(r.content);
    return r;
  }

  const model = request.model ?? process.env.OPENAI_MODEL ?? "gpt-4o";
  const baseRaw = process.env.OPENAI_BASE_URL?.trim();
  const base = (baseRaw || "https://api.openai.com/v1").replace(/\/$/, "");
  const controller = new AbortController();
  // Таймаут по бездействию: сбрасывается на каждом токене. Не даёт зависнуть
  // на старте/в середине, но не режет долгую живую генерацию.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  };
  arm();
  let full = "";

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY!.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: request.temperature ?? 0.9,
        max_tokens: request.maxTokens ?? 4500,
        stream: true,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      const err = await res.text().catch(() => "");
      if (res.status === 401) {
        throw new AiConfigError(
          "Ключ OpenAI не принят. Проверь OPENAI_API_KEY.",
        );
      }
      throw new Error(`OpenAI ${res.status}: ${err.slice(0, 200)}`);
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = j.choices?.[0]?.delta?.content ?? "";
          if (delta) {
            arm(); // токен пришёл — сбрасываем сторож бездействия
            full += delta;
            onChunk(delta);
          }
        } catch {
          /* частичный JSON — пропускаем */
        }
      }
    }
  } catch (e) {
    if (e instanceof AiConfigError) throw e;
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(
        `Поток молчал ${Math.round(AI_TIMEOUT_MS / 1000)}с. Попробуй ещё раз.`,
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  return {
    provider: "openai",
    model,
    content: full,
    tokensIn: 0,
    tokensOut: 0,
    cost: { amount: full.length * 0.0000004, currency: "USD" },
    costUsd: full.length * 0.0000004,
  };
}
