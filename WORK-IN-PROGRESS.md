# Текущая работа · 2026-11-05

Закрытая проба на `3102`: новый синтетический DOCX загружен через главную, Лера и Тамара вернули `COMPLETED` в режиме `live`; оба результата после обновления открылись с тем же ID. На ширине 390 px нет горизонтального переполнения и ошибок страницы. Реплики различаются: Лера выделила лично настроенный журнал и обучение, Тамара — поля журнала и ответственность. Сводка, ответы и desktop/mobile-снимки сохранены в [artifacts/openai-closed-20261105/](artifacts/openai-closed-20261105/). Оба ответа правильно отделили командный показатель от личного вклада и не приписали экономию времени.

Проба выявила оставшийся узкий дефект: оба HR назвали отсутствие измеренной экономии времени самостоятельной проблемой, хотя регулярное использование списка в резюме подтверждено. Добавлен предохранитель и регрессия для этого случая; 17/17 адресных тестов, typecheck и ESLint прошли. Эти два уже сохранённых ответа получены **до** последнего предохранителя и не переписаны задним числом. Новый платный прогон после правки не делали. Журнал стенда: 12 завершённых OpenAI-вызовов, оценка $0.10426630; суммарный учтённый расход прежнего лимита $1 — $0.89041250, остаток $0.10958750. Это синтетический маршрут, не приёмка на реальных резюме владельца; production и оплата не менялись.

Аудиторские замечания после `5d732ed`: OpenAI-оценка теперь явно отклоняет приписанную экономию времени и формулировку о «скрытом доказательстве» при честно неизмеренном личном вкладе; ошибочные тезисы проходят прежний ограниченный цикл исправления и повторную проверку. Выбор замечаний резервирует место для главной мысли HR и всех критичных пунктов; критичные не прячутся в раскрывающемся списке. Исторический H10-артефакт не переписан и служит регрессионным примером.

Отдельный локальный OpenAI-стенд запущен на `http://127.0.0.1:3102/` с пустой `.data/openai-stand-20261105.db`, собственным каталогом загрузок и выключенной оплатой. Обычные локальные серверы на 3100/3101 не менялись. Стенд использует OpenAI через переменные процесса, а не mock-конфигурацию `.env.development.local`; `GET /` и `/api/health` отвечают 200. Адрес действует, пока жив локальный процесс. Новых платных генераций после исправления не было: холодную первую загрузку и качество на реальных резюме владелец ещё не проверял. Адресные 18/18 тестов, typecheck и ESLint прошли; прочие пользовательские файлы сохранены без коммита.

Рабочая копия `C:\Users\mks\Documents\ChatGPT\Toxic HR`, ветка `codex/master-ux-ui-rebuild`. Локальный предпросмотр: существующий dev-сервер `http://127.0.0.1:3100/` при запуске пользователем; эта работа его не перезапускала. Публикация — отдельная команда, текущий production не менялся.

Целевой AI для новой версии — OpenAI по решению владельца; прежний выбор Yandex в плане отменён. Локальная `.env` переключена на `AI_PROVIDER=openai` (файл вне Git), `.env.development.local` остаётся безопасным mock для обычного dev-предпросмотра. Исправлены ложная ошибка ожидания при долгом AI-разборе (SSE heartbeat и скользящий таймер), ожидание уже запущенного разбора, ошибка загрузки сохранённого результата и порядок трёх замечаний согласно главному выводу HR. Редактор испорченного ответа использует ту же модель, что автор.

Проверено: адресный ESLint и typecheck прошли; 7/7 тестов с подменённым OpenAI-транспортом и копией отдельной тестовой SQLite прошли. Один живой синтетический H10/Лера на актуальном коде завершился с фактологически связанной репликой за 23 с, 4 API-вызова, расчётная стоимость $0.02895175. Общий учтённый расход прежнего лимита $1 — $0.78614620; остаток $0.21385380. Другие семь ранее принятых ответов повторно не генерировались. Это не подтверждает все профессии, четыре голоса в едином холодном прогоне или доступ OpenAI с боевого сервера. Оплата и production не затрагивались. Принятие владельцем ожидается.

# История · 2026-11-04

Рабочая копия: `C:\Users\mks\Documents\ChatGPT\Toxic HR`, локальная ветка `codex/master-ux-ui-rebuild`, ревью-ветка `origin/review/ux-ui-rebuild-48a583b`. Кодовый SHA `52685d75cf29ef875c38d150c22762102929adde`: [полный CI · suite=full](https://github.com/Timmys18/toxichr/actions/runs/41817654952), все 8 заданий успешны. `master`, production и deploy не менялись. Локальные browser-проверки использовали mock AI и отдельную SQLite; последняя полная приёмка прошла в GitHub.

Сделано: подготовлена доставка одноразовой ссылки сброса через защищённый почтовый API, ссылка перестала попадать в ответ; добавлены страницы условий покупки и контакт поддержки из `SUPPORT_EMAIL`; устранено предупреждение сборки о трассировке всего репозитория. Синтетический путь UI, оплата с тестовым транспортом и полный cloud acceptance проверены. Прямые загрузки без согласия отклоняются, подтверждение хранится с версией резюме; синтетические DOCX и PDF прошли upload. Добавлен проверяющий скрипт резервной копии; на сервере read-only проверена последняя ежедневная копия. Подробности и блокеры — в [docs/LAUNCH-READINESS-2026-11-04.md](docs/LAUNCH-READINESS-2026-11-04.md). Product Owner ещё не принимал релиз. Live AI, реальная оплата и production deploy не запускались.

# Передача Codex — 2026-11-04
Актуальное задание, замысел владельца, карта кода и критерии подготовки запуска: [docs/CODEX-HANDOFF-2026-11-04.md](docs/CODEX-HANDOFF-2026-11-04.md). Базовый код 2cf4df3. Бюджет прежнего цикла не обнулять: из $1 осталось $0.24280555. Production-восстановление пароля сейчас возвращает 503; старые планы запуска требуют сверки.

# Completion checkpoint — 2026-11-04
Branch review/ux-ui-rebuild-48a583b, local workspace /workspace/scratch/168bf684bac1/toxichr. Earlier durable code checkpoint 55e125c.
AI fixes and limited live acceptance complete on two synthetic CVs; all eight accepted real replies in artifacts/auditor-completion/accepted-results.json. Full report: artifacts/auditor-completion/REVIEW.md. Total authorized-$1 ledger includes ALL initial/failed/repaired calls: $0.75719445, 100 calls, zero unknown charges in this session. Corrected cache-write premium included. This does not reconcile the lost historical $5 budget.
Current code additionally prevents planner mutation of facts, requires full review coverage, prunes rejected optional conclusions using only supported observations, internally reconciles corrected observations, and feeds actual earlier same-hash replies to the next HR. Fixed negative-metric lexical false positives; kept factual/context gates and final review. No canned successful HR reply substituted.
Validation: typecheck + targeted ESLint pass; 31/31 addressed free tests; last same-hash history/persistence test 2/2. Isolated local SQLite; no production DB access. Final source and report checkpoint saved through connected GitHub. No production deployment or merge. No UI change/preview. Existing deployment procedure remains separate/manual; no production action authorized by this work.
Remaining: broader profession/style evaluation and production acceptance. Accepted reply collection spans tested intermediate revisions and preserves untouched successful outputs to stay within budget; no claim of one cold final-version batch.

# Active completion — 2026-11-04
Working copy: /workspace/scratch/168bf684bac1/toxichr; branch review/ux-ui-rebuild-48a583b. Starting saved remote 9f57723.
- Fixed initial facts JSON/schema/citation failures entering one bounded repair plus semantic recheck; exact quotes remain required. Detailed declared-field errors preserve original grammatical form.
- Added selectedId schema constraint and one full coordinated-plan repair with immutable facts; no arbitrary anchor replacement.
- Semantic repair applies only rejected claims, preserving all supported observations/classification. Rechecked summary-only corrections persist in the plan without making the user restart; changed observations or common facts still invalidate coordination.
- Replayed both recorded failures and preserved existing persistence/lease/grounding checks: 27/27 addressed tests pass in isolated SQLite. Typecheck and addressed ESLint pass. npm CI was installed without scripts initially; SQLite native driver subsequently rebuilt for DB checks.
- Live continuation uses the same user-authorized TOTAL $1 cap, including original $0.04152525. Separate manifests and pre-dispatch conservative reservations; no historical billing reconciliation was fabricated. Live results in progress, not yet accepted.
- No UI changes or preview server. Production deployment is manual per existing workflow; no merge, deployment or production DB changes authorized/performed. Review branch artifacts/code will be preserved through connected GitHub as before.

# Latest follow-up — 2026-11-04
Base remote HEAD verified: 2c62ba84, same review branch. No architecture rewrite.
- Repository code search confirms runAiStream has no production callers. Its unaccounted SSE/character-price implementation is removed; exported entry throws before network/chunks pending complete streaming accounting. runAi remains the supported transport.
- New success-chain integration test uses real application orchestration, isolated SQLite and a fully stubbed HTTP transport with AI_PROVIDER=openai (not mock). It checks facts extraction/review → persisted facts → four-view plan → persisted plan → whole-assessment review → selected author → final review → COMPLETED storage and six receipts → reopen same analysis with no new calls/rows.
- Two new tests passed; typecheck and addressed ESLint passed. Historical 20-test result retained, not rerun for this follow-up. New artifact: artifacts/recovery/success-chain-checks.json.
- Actual paid calls 0; new spend $0. Historical $5 remainder still unresolved; live acceptance remains blocked. No merge/deploy. Unrelated modified screenshot excluded.

# ToxicHR — audit corrections 2026-11-03
Branch review/ux-ui-rebuild-48a583b. Starting HEAD verified: 522457c. Existing architecture retained.
Implemented:
- Semantic reviewer checks every professional assessment field, candidate context and arrays plus observations; omitted decisions fail closed. One repair/recheck; unsupported final fields cannot pass.
- Any semantic change or review failure invalidates stored coordinated plan. Current attempt fails before author; next attempt rebuilds coordination from saved facts. Never feeds rejected old observations to coordinatedDirection.
- Expiring 180s lease, 20s heartbeat, atomic conditional takeover. Ownership renewed before model calls; checked again after response and fenced inside save transactions. Cache checked before acquiring/waiting; abandoned RUNNING marked failed after acquisition.
- Per-call fsynced receipt journal `.data/ai-call-ledger.jsonl`, no prompts or secrets. Analysis calls also recorded in AiCall database table, immediate usage/time/estimated cost aggregation survives FAILED. STARTED, ERROR or missing usage remain unresolved (not zero); raw usage + request ID available for billing reconciliation. Standalone runAi calls also journaled.
- Account profile uses general attribution/tool-use principles; removed 85%/weekly-list fixture wording.
Validation: final typecheck and targeted ESLint passed; 20/20 addressed tests passed. Results: artifacts/recovery/audit-fixes-tests.json. Tests use isolated SQLite and fake HTTP transport, no live acceptance.
Budget: recovery paid calls 0. Lifetime spend and remainder still UNKNOWN because paid historical runs were lost; existing $5 reconciliation gate retained. No live calls until confirmed.
Operational: schema changes require prisma db push on target before use; no production DB changes, merge or deploy. Unrelated modified UX screenshot preserved and excluded.
# 2026-11-06 — входной контроль резюме

- Добавлена серверная AI-проверка назначения документа перед HR-конвейером, кэшированная по версии, провайдеру и хешу текста. При неподходящем или неопределённом материале Analysis не создаётся; клиент получает путь к новой загрузке или вставке текста.
- Адресные тесты 24/24. Живой негативный сценарий с новым DOCX и обновление страницы прошли; прямой запрос с поддельным статусом отклонён. Нестандартный текст опыта прошёл входной контроль, но его HR-пайплайн дважды завершился ошибкой. Повторная UI-проба с другим новым синтетическим резюме дала `COMPLETED`/`live`; после обновления тот же ID результата, desktop/mobile-снимки сохранены. Время успешного полного прогона 93,8 с; оценка суммарных OpenAI-затрат $0,17132075, включая неуспешные попытки. Сбой первого кандидата остаётся ограничением надёжности. Production и оплата не тронуты.
