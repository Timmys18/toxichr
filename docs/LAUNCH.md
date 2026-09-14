# ToxicHR — Launch checklist

Production readiness before public beta traffic.

Единый список критериев финального решения: [PRE-RELEASE-CHECKLIST.md](PRE-RELEASE-CHECKLIST.md). Этот файл — техническая инструкция, не доказательство прохождения пунктов.

## Required env

| Variable | Notes |
|----------|-------|
| `NEXT_PUBLIC_APP_URL` | Public HTTPS origin |
| `DATABASE_URL` | Persistent production database |
| `AUTH_SECRET` | Long random (`openssl rand -base64 32`) |
| `OPS_EMAILS` | Emails allowed to open `/ops/funnel` |
| `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` | Required for live persona voice |
| `AI_PROVIDER` | `mock` \| `openai` \| `anthropic` |
| `BETA_PAYWALL_ENABLED` | Keep `false` until payment smoke-test is complete |
| `YOOKASSA_SHOP_ID` | Production YooKassa shop id |
| `YOOKASSA_SECRET_KEY` | Production YooKassa secret key |

Copy from `.env.example`. Never commit `.env`.

## Commercial beta

Цена: **199 ₽ за пакет ToxicHR** с лимитами, зафиксированными в Release Plan. Полный разбор и самостоятельный разбор вакансии остаются бесплатными.

Before opening paid access to beta traffic:

1. Add production YooKassa credentials.
2. Configure YooKassa notification URL: `https://<production-host>/api/payments/yookassa/webhook` for successful/canceled payment events.
3. On a restricted production smoke account, enable the paywall and make one real 199 ₽ payment through `/revenge`; no live charge has been performed by automated tests.
4. Убедитесь, что `Payment.status=PAID`, а для текущего резюме появилась запись `ToxicHrPackage`; отдельные старые доступы больше не выдают новые права.
5. Confirm return from YooKassa opens the same analysis and the user can build the corrected version.
6. Confirm DOCX and print are inaccessible without the grant and available after payment.
7. Only then set `BETA_PAYWALL_ENABLED=true` for public traffic.

The configured `NEXT_PUBLIC_APP_URL` must be the actual public HTTPS origin: payment return URLs never use the incoming Host header. Repeating checkout for one pending payment reuses its YooKassa idempotency key. The return screen checks YooKassa directly if the webhook is delayed; both paths grant access only after provider confirmation.

## Backups and restore readiness

Critical local data is the SQLite database and `.data/uploads`. On the production host, create a private, encrypted backup destination outside the project, then run `npm run backup:critical -- /absolute/secure/backup-directory`. The command uses SQLite online backup, copies uploads and writes a SHA-256 manifest. Do not publish or commit the resulting directory. Schedule it with the host's scheduler, retain copies off-host, and regularly rehearse restoration to an isolated environment: verify manifest hashes, restore `database.sqlite` to the configured `DATABASE_URL` path and `uploads/` to `.data/uploads`, then check `/api/health` and a saved account. A backup script is not proof that production backups are configured or restorable.

The repository now includes a single-VM Docker Compose/Caddy deployment template in `deploy/`. It is not a completed deployment: production host, domain, secret injection, off-host backup schedule, real payment and post-deploy desktop/mobile smoke must be evidenced separately before Sprint 6 can be marked complete.

## Single-VM production runbook (Yandex Cloud or Selectel)

Use one persistent Linux VM for the current SQLite, local-upload and in-process rate-limit architecture. The public domain must point to that VM, with ports 80/443 open. Keep the app port private; `deploy/compose.yml` exposes only Caddy. The proxy overwrites `X-Real-IP`, which the app uses for rate limiting.

On the selected host, place the checkout under `/opt/toxichr`, a private environment file outside Git (for example `/etc/toxichr/app.env`), and persistent writable directories for app data and backups. The app process runs as UID 1000. The environment file needs `NEXT_PUBLIC_APP_URL=https://<domain>`, `DATABASE_URL=file:./.data/toxichr.db`, a generated `AUTH_SECRET`, live `AI_PROVIDER`/API key, `OPS_EMAILS`, `BETA_PAYWALL_ENABLED=false` initially, and production `YOOKASSA_SHOP_ID` / `YOOKASSA_SECRET_KEY`. Restrict the file to the deploying operator. Never print or commit these values.

Set `PUBLIC_HOST`, `TOXICHR_ENV_FILE`, `TOXICHR_DATA_DIR` and `TOXICHR_BACKUP_DIR` in the deployment shell. The two directories must be absolute host paths; backup storage should be encrypted and copied off-host. From the repository root:

```sh
docker compose -f deploy/compose.yml build app
docker compose -f deploy/compose.yml run --rm app sh -c 'node scripts/ensure-sqlite-file.mjs && npm run db:push'
docker compose -f deploy/compose.yml up -d
docker compose -f deploy/compose.yml ps
docker compose -f deploy/compose.yml exec -T app npm run backup:critical -- /backups
```

Check `https://<domain>/api/health` before any traffic. On a restricted smoke account, enable the paywall, make one real payment, verify the return route, package grant, purchased result and later cabinet history. Check canceled/failed/pending messaging without treating those states as paid. Verify backup manifest and rehearse restore on an isolated host; then schedule encrypted, off-host backups. Run desktop/mobile smoke against the deployed URL and capture evidence. Only then open the closed beta.

The webhook never grants access from the incoming payload alone: the server re-reads the payment from YooKassa before granting access.

## Pre-deploy

1. `npm run db:push` (or migrate) against prod DB.
2. `npm run build` green.
3. OG card: open `/toast/{slug}` in Telegram / LinkedIn debugger.
4. Auth: register → claim analysis → history.
5. Delete account path: settings → УДАЛИТЬ.
6. With AI keys: persona voice differs from heuristic; quotes remain grounded.
7. Without AI keys: honest heuristic path still ships plan + rewrites.
8. `/ops/funnel` is hidden without an email from `OPS_EMAILS`.
9. Improvement: answer questions → create version → DOCX → print → vacancy.
10. Vacancy: standalone review → match against saved resume.
11. Second opinion: run another HR against the same saved resume.
12. `GET /api/health` returns `200` with the production database available.
13. GitHub Actions is green on the release commit.
14. Playwright desktop core loop and mobile viewport checks are green.
15. `/ops/funnel` shows unique-user conversion rates rather than raw event totals.

## Smoke path

```text
/ → /session → result → /revenge → payment (when enabled)
→ corrected resume → DOCX / print → /vacancy
→ public card → /toast/{slug} → new visitor → upload → result
→ /auth → /me → /settings
```

## Security defaults

- Public shares: no name/companies in payload by default.
- Full report is free; paid value starts with the corrected document.
- PII redacted before AI.
- Rate limits on file/text upload, analysis, vacancy review, checkout and registration.
- Auth `next` redirects accept internal paths only.
- Account deletion removes database data and locally stored uploads.
- Baseline HTTP hardening headers are enabled in `next.config.ts`.
- Payment grant is tied to `analysisId + productCode`; direct DOCX/print URLs are gated too.

## Final visual QA

- [x] Первый экран главной: бренд и основной маршрут читаются без горизонтального переполнения.
- [x] Персонажи собраны в удобную мобильную ленту; реплика персонажа видна без hover.
- [x] Результат: «Исправить» — главный CTA, шаринг вторичный.
- [x] Sticky CTA результата ведёт в продолжение, а не в новый разбор.
- [x] Цена Реванша показана до paywall.
- [x] Mobile navigation сохраняет быстрый путь к вакансии и полное меню.
- [ ] Production payment redirect + webhook smoke-test with real YooKassa credentials.
- [ ] Manual visual check of result/paywall on real production AI output.
