# Аудит AI-контура для production в РФ

Статус: **техническая подготовка, внешние вызовы российских провайдеров не выполнялись**. Дата: 17.09.2026. Основание: production планируется в РФ, а Россия отсутствует в официальном списке поддерживаемых стран OpenAI API. Обход региональных ограничений не рассматривается.

## Короткий вывод

Основной кандидат — **YandexGPT Pro 5.1 через Yandex AI Studio**. Он доступен в том же российском облаке, имеет OpenAI-совместимый Chat Completions API, streaming и Structured Outputs по JSON Schema. Для запросов с резюме обязательно передавать `x-data-logging-enabled: false`, не включать tracing и отдельно принять условия поручения обработки персональных данных.

GigaChat Max — резервный кандидат. Его API также поддерживает JSON Schema, но требуется отдельный корпоративный договор/контур, OAuth-токен с обновлением и отдельная проверка условий обработки данных. Локальная модель даёт максимальный контроль над данными, но для закрытой беты экономически и операционно хуже managed API.

Качество YandexGPT на ToxicHR **ещё не измерено**: до решения Product Owner ни один контрольный кейс ему не отправлялся. Плановый риск для первой оценки — снижение совокупной ручной оценки на 5–15 процентных пунктов, прежде всего в persona/rewrite/adaptation. Критерий допуска: не более 8 пунктов относительно OpenAI и ноль новых blocker-ошибок по grounding, critical requirements и выдуманным фактам.

## Готовность текущего слоя

Положительное:

- все продуктивные стадии вызывают общий `runAi()`;
- JSON-схемы, Zod-валидация, grounding, безопасные fallback и бизнес-правила находятся выше провайдера;
- mock отделён от live-ответа;
- журнал уже хранит stage/provider/model/status без содержимого резюме.

Ограничения:

- `AiProvider` знает только `openai | anthropic`, а выбор провайдера и HTTP-клиенты находятся в одном `gateway.ts`;
- модели OpenAI (`OPENAI_MODEL`, `OPENAI_WRITER_MODEL`) передаются из pipeline и протекают в бизнес-слой;
- стоимость хранится как `costUsd`, что неверно для рублёвого провайдера;
- streaming реализован отдельно только для OpenAI;
- тексты ошибок предлагают VPN или «обходной адрес». Для production в РФ это нужно удалить: неподдерживаемый провайдер должен завершаться безопасной ошибкой, без обхода ограничений;
- нет capability-профиля провайдера: `jsonSchema`, `stream`, context window, data-logging header, timeout/retry.

Итоговая готовность к замене: **примерно 70%**. Pipeline переписывать не нужно, но gateway пока следует разделить на тонкий контракт и реализации провайдеров.

## Минимальный адаптер

Достаточно интерфейса `AiProviderAdapter`:

```ts
type ProviderCapabilities = {
  jsonSchema: boolean;
  streaming: boolean;
  contextTokens: number;
};

interface AiProviderAdapter {
  id: "openai" | "yandex" | "gigachat" | "local";
  capabilities: ProviderCapabilities;
  assertReady(): void;
  complete(request: AiRequest): Promise<AiResponse>;
  stream?(request: AiRequest, onChunk: (chunk: string) => void): Promise<AiResponse>;
}
```

Минимальные изменения: вынести существующий OpenAI-клиент без изменения pipeline; добавить Yandex adapter; перенести выбор моделей в конфигурацию `stage → model`; заменить `costUsd` на `{ amount, currency }`; добавить обязательный запрет логирования и adapter contract tests. Промпты, схемы, score, grounding, персоны и продуктовые маршруты не менять до результатов сравнения.

Для Yandex adapter нужны `YANDEX_AI_API_KEY`, `YANDEX_AI_FOLDER_ID`, явный URI `gpt://<folder>/yandexgpt-5.1`, endpoint `https://ai.api.cloud.yandex.net/v1/chat/completions`, `Authorization: Api-Key ...`, `OpenAI-Project`/folder ID и `x-data-logging-enabled: false`. Версию модели нельзя оставлять неявной.

## Пригодность по стадиям

| Стадия | YandexGPT Pro 5.1 | GigaChat Max | Локальная 30–70B | Главный риск |
|---|---|---|---|---|
| extract | высокая | высокая | средняя–высокая | строгая полнота фактов и JSON |
| professional assessment | средняя–высокая | средняя–высокая | средняя | уровень кандидата без домыслов |
| vacancy | высокая | высокая | средняя–высокая | атомарность и critical requirements |
| match | средняя–высокая | средняя–высокая | средняя | `unknown` не превращать в `gap` |
| persona | средняя | средняя–высокая | низкая–средняя | четыре действительно разные оптики |
| rewrite | средняя | средняя | низкая–средняя | полезность без добавления фактов |
| adaptation | средняя | средняя | низкая–средняя | точная связь с вакансией и grounding |

YandexGPT выбран первым кандидатом не потому, что качество уже доказано, а потому что он минимизирует инфраструктурный и юридический разрыв при Yandex Cloud, поддерживает нужный API-контракт и имеет прозрачное отключение логирования. GigaChat следует держать вторым сравнительным вариантом, если YandexGPT не пройдёт persona/rewrite или blocker-критерии.

## Стоимость

Сохранённые live-артефакты показывают для наиболее полного контрольного маршрута примерно **24–28 тыс. входящих** и **9–10 тыс. исходящих токенов**; фактическое число зависит от повторов валидации и числа персон.

- YandexGPT Pro 5.1: 0,8 ₽ за 1000 входящих и 0,8 ₽ за 1000 исходящих токенов. Оценка полного маршрута: **27–31 ₽**, с резервом на один retry — **до 40–45 ₽**.
- GigaChat Max: 0,65 ₽ за 1000 тарифицируемых токенов, но при использовании действует минимальный месячный платёж 600 ₽. Оценка маршрута: **22–25 ₽**, без учёта возможных повторов.
- Локальная модель: выделенный inference оплачивается даже без запросов; опубликованные Yandex AI Studio конфигурации начинаются примерно от 408,70–817,40 ₽ в час. Для малой закрытой беты unit economics хуже managed API.

Цена пакета **199 ₽ сохраняется** при YandexGPT/GigaChat: AI занимает ориентировочно 14–23% цены даже с retry-резервом. Это не чистая маржа: отдельно остаются эквайринг, налоги, VM, хранение и поддержка. Для локальной выделенной модели цена 199 ₽ оправдана только при стабильной загрузке, которой у закрытой беты пока нет.

## Подготовленный сравнительный тест

Зафиксирован manifest `tests/artifacts/ai/provider-comparison-plan.json`. В нём шесть уже существующих обезличенных кейсов:

1. `junior-ux`;
2. `senior-backend`;
3. `support-manager`;
4. `operations-executive`;
5. `construction-pm`;
6. `clinic-nurse`.

Для каждого провайдера выполняется одинаковая цепочка `extract → professional assessment → vacancy → match → persona → rewrite → adaptation`. Сравнение слепое по шести критериям Sprint 5: фактическая обоснованность, чтение вакансии, match/grounding, различимость персон, полезность rewrite/adaptation, ясность языка. Дополнительно фиксируются JSON/technical failures, latency, входные/выходные токены и рублёвая стоимость. В журнал не попадают тексты резюме, промпты и ответы.

Запуск заблокирован до одновременного выполнения условий:

- Product Owner отдельно выбрал провайдера и разрешил отправку шести обезличенных кейсов;
- проверены оферта/договор, поручение обработки данных и территория обработки;
- для Yandex отключено логирование запросов и не включён tracing;
- создан отдельный сервисный аккаунт с минимальной ролью и бюджетным лимитом;
- ключ передан через секреты окружения, не Git.

## Официальные источники

- OpenAI: https://help.openai.com/ru-ru/articles/5347006-which-countries-and-territories-are-supported-by-openai
- Yandex AI Studio, модели: https://aistudio.yandex.ru/ru/docs/ai-studio/concepts/generation/models
- Yandex Structured Outputs: https://aistudio.yandex.ru/ru/docs/ai-studio/operations/generation/completions-structured
- Yandex тарифы: https://aistudio.yandex.ru/ru/docs/ai-studio/pricing
- Yandex хранение и логирование: https://aistudio.yandex.ru/ru/docs/ai-studio/concepts/security/data-storage и https://aistudio.yandex.ru/ru/docs/ai-studio/operations/disable-logging
- Yandex Cloud и 152-ФЗ: https://yandex.cloud/ru/security/data-privacy
- GigaChat Structured Outputs: https://developers.sber.ru/docs/ru/gigachat/guides/structured-output
- GigaChat тарифы для бизнеса: https://developers.sber.ru/docs/ru/gigachat/tariffs/legal-tariffs

