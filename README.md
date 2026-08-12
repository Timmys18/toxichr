# ToxicHR

Самый честный карьерный сервис: четыре HR по-разному разбирают одно резюме, показывают, почему оно не работает, и доводят его до конкретной вакансии без выдуманных фактов.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Prisma + SQLite
- Motion
- AI Gateway (provider-agnostic)

## Docs

- [`docs/ROADMAP.md`](./docs/ROADMAP.md) — продукт и visual track
- [`BURNDOWN.md`](./BURNDOWN.md) — прогресс
- [`docs/LAUNCH.md`](./docs/LAUNCH.md) — production checklist

## Local

```bash
cp .env.example .env
npm install
npm run db:push
npm run dev
```

По умолчанию `DATABASE_URL=file:./.data/toxichr.db` (SQLite, без Docker).

Открой [http://localhost:3100](http://localhost:3100).

Поток: **главная → HR → разбор → второе мнение → исправление → вакансия**.

## Product loop

```text
Upload → HR → Result → Second opinion → Fix → Vacancy match → Repeat
```

Главная продуктовая фишка — не одноразовый AI-ответ, а цикл из четырёх разных
взглядов на те же факты резюме. Любое улучшение проходит проверку качества:
сервис не придумывает опыт и не применяет замену, если она делает текст слабее.

## Проверки

```bash
npm run lint
npx tsc --noEmit
npm run build
npm run test:e2e
```

Playwright проверяет полный пользовательский цикл в Chromium и мобильную вёрстку.
