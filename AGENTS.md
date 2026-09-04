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

- Внутри спринта не запускать полный тяжёлый acceptance-набор после каждого куска работы, коммита или push — в том числе если работа идёт прямо в `master`.
- После промежуточного изменения запускать только быстрые обязательные проверки (`typecheck`, `lint`) и точечные тесты изменённого контура.
- Если изменение затрагивает критичный контур (платежи, auth/access control, миграции/схему данных, AI safety/grounding, сохранность пользовательских данных), дополнительно запускать только релевантный специализированный тест до продолжения работы.
- Полный acceptance-набор (`production build`, все safety/persona/vacancy тесты, monetization E2E, полный E2E и прочие проверки Definition of Done) запускать **один раз при закрытии каждого спринта/этапа**: Sprint 1.1, затем Sprint 2, 3, 4, 5 и 6, либо когда Product Owner явно просит полную приёмку.
- Для финальной приёмки спринта: сначала завершить и отправить код, затем запустить полный GitHub Actions workflow вручную (`workflow_dispatch`) на финальном commit и дождаться зелёного результата.
- Не дублировать перед этим тот же полный набор локально. Локально достаточно быстрых и точечных проверок; полный GitHub-прогон является контрольным acceptance-прогоном спринта.
- Live AI acceptance и реальные платёжные smoke-тесты не запускать на каждый промежуточный коммит; запускать только когда менялся соответствующий контур и на контрольных точках, где это действительно нужно.
- Если полный acceptance выявил дефект и после исправления был изменён код, повторить полный acceptance на исправленном финальном commit — это не считается лишним дублированием.

## UI / design system

- New pages use the ToxicHR design system; do not introduce arbitrary colors, fonts, spacing, or duplicate button patterns.
- Add each new visual primitive to `/ui-kit` before relying on it in a product screen.
- Product pages must compose `src/components/ui/system.tsx` primitives and page templates; do not add page-local `<style>` blocks for shared layout, typography, actions, evidence, metrics, or states.
- A document has one `main#main`: the appropriate page template owns it. Components inside a template use sections, articles, and divs instead.
- `/ui-kit` is development-only. Do not link it from public navigation or expose it in production.
- Important content text is at least 16px; test every visual change on desktop and mobile and include screenshots before handoff.
