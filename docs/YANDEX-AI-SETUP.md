# Yandex AI Studio — точная предрелизная настройка

> Статус на 06.10.2026: облачная настройка выполнена пользователем; локальный `.env` содержит `AI_PROVIDER=yandex`, каталог и непустой `YANDEX_AI_API_KEY`. Файл исключён из Git. Это проверка наличия конфигурации, не подтверждение действительности ключа или доступности API. Внешний запрос ещё не выполнялся.

## Сетевая диагностика · 07.10.2026

Внешняя проверка без ключа выполнена из Linux-среды ChatGPT Work, а не из Windows пользователя. Сначала `ai.api.cloud.yandex.net` дал тайм-аут; curl указал на `Proxy CONNECT`, до завершения TLS. `llm.api.cloud.yandex.net` ответил HTTP 401 на GET и HTTP 400 (`messages array cannot be empty`) на POST `{}` в `/v1/chat/completions`. При контрольном запуске оба адреса ответили HTTP 400 через Node и curl. Это наблюдение нестабильного сетевого подключения в проверенной среде, а не установленная постоянная блокировка API или причина на компьютере пользователя.

Адрес `https://ai.api.cloud.yandex.net/v1` соответствует [документации Completions](https://aistudio.yandex.ru/ru/docs/ai-studio/operations/generation/completions-basic). `https://llm.api.cloud.yandex.net/v1` используется для OpenAI-compatible API в [официальной инструкции Yandex Cloud](https://yandex.cloud/en/marketplace/products/yc/openclaw). Неплатный ответ HTTP 400/401 не подтверждает ключ, модель Pro 5.1 или JSON Schema.

Добавлен явный `YANDEX_AI_BASE_URL`. По умолчанию сохраняется основной адрес; другой выбирается только конфигурацией. Разрешены только эти два HTTPS-адреса без пользовательских реквизитов, query и нестандартного порта. Автоматического переключения, отключения TLS-проверки и отправки ключа стороннему серверу нет. Модель и заголовок запрета логирования сохраняются.

Порядок дальнейшей проверки для Codex на компьютере пользователя:

1. Выполнить `node scripts/diagnose-yandex-network.mjs` в текущей среде. Скрипт не читает `.env`, не передаёт ключ и отправляет только заведомо неверный `{}`. Показывает DNS, Node HTTP, curl HTTP и состояние CONNECT/TLS, не раскрывая значения прокси.
2. При тайм-ауте выполнить ту же команду в обычном PowerShell вне ограниченной среды Codex. Если там HTTP-ответ есть, исправлять настройки доступа среды исполнения. Если ответа нет в обоих случаях, исследовать доверенный системный прокси, DNS и firewall. Не отключать проверку сертификатов.
3. Если Node не отвечает, а curl отвечает, проверить версию Node и использование уже настроенного доверенного прокси. По [официальной документации Node](https://nodejs.org/learn/http/enterprise-network-configuration), `NODE_USE_ENV_PROXY=1` включает использование `HTTP_PROXY`/`HTTPS_PROXY` для fetch на Node 22.21+ и 24+. Не менять переменные прокси вслепую и не создавать новый прокси. В Linux-среде этой диагностики режим уже был включён.
4. Если основной адрес недоступен, а второй отвечает, сохранить в локальном игнорируемом `.env` только `YANDEX_AI_BASE_URL=https://llm.api.cloud.yandex.net/v1`. Ключ, каталог и модель не менять. Если основной доступен, оставлять его.
5. После HTTP-ответа из нужной среды запустить **один** access smoke с `json_object`, отдельно от strict:

```powershell
node -e "require('dotenv').config({quiet:true,override:true}); process.env.RUN_YANDEX_ACCESS_SMOKE='1'; process.env.RUN_YANDEX_STRICT_SMOKE='0'; const {spawnSync}=require('node:child_process'); const r=spawnSync(process.execPath,['node_modules/@playwright/test/cli.js','test','--config=playwright.persona.config.ts','tests/persona/yandex-provider-access-smoke.spec.ts','--workers=1','--retries=0'],{stdio:'inherit',env:process.env}); process.exit(r.status ?? 1);"
```

Access smoke использует реальный адаптер, один синтетический запрос, лимит 32 токена, общий тайм-аут 20 секунд и не включает strict. Выводит только результат проверки и метаданные стоимости. Strict проверяется прежним отдельным тестом после успешного access. Даже успешный access не является оценкой голосов HR.

Артефакт: `tests/artifacts/ai/yandex-network-diagnostic-2026-10-07.json`. В моей среде локального пользовательского `.env` нет; оплачиваемые запросы и обращения с ключом не выполнялись. Сообщённый пользователем `c2ea8f1` на момент проверки не найден в удалённом репозитории; подготовка основана на доступной рабочей ветке `68e9255`, без доступа к незапушенным изменениям Windows.

## После интеграции PR #7

Коммит `53c89be` применён fast-forward в `codex/internal-ux-before-release`. Авторские примеры и локальные подмены ответов не считаются живыми ответами YandexGPT.

Ранее подготовленный strict smoke остаётся отдельной проверкой поддержки схемы. После сетевого сбоя сначала используется access smoke из раздела выше; strict запускается после успешного доступа. Production для этого не требуется. Команда strict из корня проекта (PowerShell):

```powershell
node -e "require('dotenv').config({quiet:true,override:true}); process.env.RUN_YANDEX_STRICT_SMOKE='1'; const {spawnSync}=require('node:child_process'); const r=spawnSync(process.execPath,['node_modules/@playwright/test/cli.js','test','--config=playwright.persona.config.ts','tests/persona/yandex-provider-live-smoke.spec.ts','--workers=1','--retries=0'],{stdio:'inherit',env:process.env}); process.exit(r.status ?? 1);"
```

Этот запуск отправляет только синтетическую фразу с просьбой вернуть `{"ok":true}`. Он проверяет доступ, модель и strict-контракт; качество четырёх голосов им не измеряется. Ошибка strict-контракта не означает автоматически неработоспособность основного адаптера с `strict:false`. В этой сессии команда не запускалась: запрос пользователя ограничен подготовкой первого запроса.

По предоставленным пользователем снимкам настроены каталог `toxichr-prod`, сервисный аккаунт `toxichr-ai-prod`, роль `ai.languageModels.user`, область ключа `yc.ai.foundationModels.execute`, окончание срока 04.01.2027. Месячный бюджет — 500 ₽ с уведомлениями 50% и 100%; это уведомления, не автоматическое отключение. Свежая проверка облачной конфигурации через API не выполнялась.

## Целевая конфигурация

1. В production-облаке Yandex Cloud — отдельный каталог `toxichr-prod`.
2. В каталоге — сервисный аккаунт `toxichr-ai-prod` только для backend ToxicHR.
3. Сервисному аккаунту на каталог назначается единственная необходимая роль `ai.languageModels.user`.
4. Для аккаунта выпускается API-ключ `toxichr-ai-prod-90d`:
   - область действия только `yc.ai.foundationModels.execute`;
   - срок действия 90 дней;
   - секрет сразу сохраняется в production secret store как `YANDEX_AI_API_KEY`, не в Git и не в чат.
5. ID каталога сохраняется как `YANDEX_AI_FOLDER_ID`. Код всегда вызывает модель `gpt://<YANDEX_AI_FOLDER_ID>/yandexgpt-5.1`.
6. В Billing создаётся месячный бюджет `toxichr-ai-prod-monthly`: лимит 500 ₽, область — каталог `toxichr-prod`, уведомления владельцу на 50%, 80% и 100%.

Бюджет Yandex Cloud уведомляет, но сам по себе не останавливает расход. До закрытой беты дополнительный программный лимит запросов и существующие продуктовые лимиты остаются обязательными.

## Историческая инструкция выпуска ключа (уже выполнена пользователем)

После того как Codex подготовит каталог, аккаунт, роль и бюджет, Product Owner проверяет на экране:

- аккаунт: `toxichr-ai-prod`;
- область: `yc.ai.foundationModels.execute`;
- срок: 90 дней;

и нажимает **«Создать API-ключ»**. Значение ключа затем вносится в secret store production-хоста. После этого выполняется только синтетический smoke `RUN_YANDEX_STRICT_SMOKE=1`; реальные резюме до отдельной проверки условий обработки данных не отправляются.

## Критерий синтетического smoke

Smoke отправляет фразу без персональных данных и запрашивает `{ "ok": true }` со strict JSON Schema. Успех: HTTP 200, `finish_reason=stop`, непустой валидный JSON, точное соответствие схеме. До этого результата приложение использует документированный JSON Schema с `strict: false` и дополнительно проверяет пустой ответ, причину завершения и валидность JSON локально.
