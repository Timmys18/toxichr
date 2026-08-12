# ToxicHR

Самый честный карьерный сервис: сначала смеётся над резюме, потом показывает, почему оно не работает, и даёт план правок без выдуманных фактов.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Prisma (SQLite local / PostgreSQL production)
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

Поток: **главная → HR → разбор → публичная карточка → исправление**.

## Product loop

```text
Upload → HR → Result → Share → Fix
```
