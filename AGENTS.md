<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# ToxicHR agent notes

- Product vision lives in chat + `docs/ROADMAP.md`
- Progress / burndown: `BURNDOWN.md` — update every session
- Language: RU only for v1
- AI: facts → evidence → score → persona voice → grounding. Never invent facts.
- Toxicity hits the resume, never the person.
- New pages use the ToxicHR design system; do not introduce arbitrary colors, fonts, spacing, or duplicate button patterns.
- Add each new visual primitive to `/ui-kit` before relying on it in a product screen.
- Product pages must compose `src/components/ui/system.tsx` primitives and page templates; do not add page-local `<style>` blocks for shared layout, typography, actions, evidence, metrics, or states.
- A document has one `main#main`: the appropriate page template owns it. Components inside a template use sections, articles, and divs instead.
- `/ui-kit` is development-only. Do not link it from public navigation or expose it in production.
- Important content text is at least 16px; test every visual change on desktop and mobile and include screenshots before handoff.
