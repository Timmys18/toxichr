<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# ToxicHR agent notes

- **ACTIVE release plan до закрытой беты: `docs/RELEASE-PLAN.md`. Читать перед любой продуктовой работой и выполнять спринты по порядку. Текущий спринт указан внутри файла.**
- Не переходить к следующему спринту, пока Definition of Done текущего не выполнен либо Product Owner явно не изменил приоритет.
- Product vision lives in chat + `docs/ROADMAP.md`
- Progress / burndown: `BURNDOWN.md` — update every session
- Language: RU only for v1
- AI: facts → evidence → score → persona voice → grounding. Never invent facts.
- Toxicity hits the resume, never the person.

## Режим проверок во время разработки

Цель — проверять изменённое поведение и один раз подтверждать готовность спринта. Не запускать полный набор «для уверенности» после уже зелёной проверки того же кода.

### Во время спринта

- На завершённый набор изменений: `npm run lint`, `npm run typecheck` и точечные тесты изменённого контура. Не повторять их после каждого сохранения файла.
- Платежи/пакеты/лимиты требуют monetization-проверки; AI safety/grounding — safety; голоса HR — persona; анализ вакансий — vacancy. Для auth, миграций и сохранности данных выбрать сценарий, который действительно проверяет изменённый риск; если такого сценария нет, добавить его.
- Локальный build нужен только для запуска выбранного браузерного теста или диагностики сборки. Это не повод запускать остальные E2E или полный локальный acceptance.
- Обычные push/PR запускают в GitHub только lint/typecheck. Для облачной диагностики выбирать конкретный `suite` в `.github/workflows/ci.yml`: `safety`, `persona`, `vacancy`, `monetization` или `e2e`. `quick` запускает только lint/typecheck.

### Завершение спринта

1. Закончить изменения и точечные проверки, отправить код, зафиксировать итоговый SHA.
2. Запустить **один** GitHub Actions `workflow_dispatch` с `suite=full`. Не запускать перед ним и после него тот же полный набор локально. Это правило действует и после исправлений на финальной стадии.
3. Проверить, что run относится к нужному SHA, выбран `suite=full`, все восемь jobs успешно выполнены, а не пропущены. Быстрый или точечный зелёный run не является полной приёмкой.
4. Если тот же SHA уже имеет успешный полный run, использовать ссылку на него. Не запускать второй полный run из-за нового чата, передачи дел или просьбы проверить существующий отчёт.
5. После зелёного результата дать отчёт и остановиться. Визуальные изменения требуют desktop/mobile-скриншотов; пустые заголовки не заменяют изображения. Не называть спринт принятым Product Owner до его решения.

### Когда повторять

- Если после проверки изменился исполняемый код, зависимости, схема данных или тесты — сначала точечная проверка исправления, затем один новый полный облачный run на итоговом SHA.
- При сбое инфраструктуры без изменений кода повторить только упавшие jobs существующего run. Не маскировать повторными запусками воспроизводимую ошибку приложения.
- Правки только документации не требуют полного прогона приложения. Для изменений CI проверить YAML, условия запуска и затронутый режим. Если изменились команды, среда или зависимости полного acceptance, выполнить один полный облачный run для проверки этой настройки.
- Live AI и реальные платёжные проверки проводить только на соответствующих контрольных точках плана либо по явному запросу пользователя; не запускать их при каждом коммите.
- В отчёте указывать SHA, режим, ссылку на run, результат и оставшиеся ограничения. Исторический зелёный run не выдавать за проверку изменённого кода.

## UI / design system

- New pages use the ToxicHR design system; do not introduce arbitrary colors, fonts, spacing, or duplicate button patterns.
- Add each new visual primitive to `/ui-kit` before relying on it in a product screen.
- Product pages must compose `src/components/ui/system.tsx` primitives and page templates; do not add page-local `<style>` blocks for shared layout, typography, actions, evidence, metrics, or states.
- A document has one `main#main`: the appropriate page template owns it. Components inside a template use sections, articles, and divs instead.
- `/ui-kit` is development-only. Do not link it from public navigation or expose it in production.
- Important content text is at least 16px; test every visual change on desktop and mobile and include screenshots before handoff.
