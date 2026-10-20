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

Используй отдельный `.env.development.local`: `DATABASE_URL=file:./.data/toxichr-dev.db`, `AI_PROVIDER=mock`, `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3100`, `STORAGE_DRIVER=local`, `BETA_PAYWALL_ENABLED=false`, пустые реквизиты YooKassa и отдельный локальный `AUTH_SECRET`. Файл уже создан на рабочем компьютере и не попадает в Git. Не используй production-базу и боевые интеграции для предпросмотра.

На Windows один раз создай отдельную базу и запусти предпросмотр:

```powershell
$env:DATABASE_URL='file:./.data/toxichr-dev.db'
node scripts/ensure-sqlite-file.mjs
npm run db:push
npm run dev -- --hostname 127.0.0.1 --port 3100
```

Открой [http://127.0.0.1:3100](http://127.0.0.1:3100). При последующих правках достаточно обновить страницу.

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
