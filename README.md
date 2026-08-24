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
npm run dev -- --port 3100
```

По умолчанию `DATABASE_URL=file:./.data/toxichr.db` (SQLite, без Docker).

Открой [http://localhost:3100](http://localhost:3100).

Для безопасной локальной проверки без внешнего AI-ключа укажи в `.env`:

```dotenv
AI_PROVIDER=mock
```

На Windows важно дождаться полного завершения `npm install`: в этот момент собирается нативный SQLite-модуль. Если установка была прервана и запуск сообщает об отсутствии `better_sqlite3.node`, выполни `npm rebuild better-sqlite3`, затем снова `npm run db:push`.

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
