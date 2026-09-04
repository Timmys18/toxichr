# ToxicHR — Launch checklist

Production readiness before public beta traffic.

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

Цена: **199 ₽ за платное действие**: готовая новая версия резюме или match с одной вакансией. Полный разбор и самостоятельный разбор вакансии остаются бесплатными.

Before switching `BETA_PAYWALL_ENABLED=true`:

1. Add production YooKassa credentials.
2. Configure YooKassa notification URL: `https://<production-host>/api/payments/yookassa/webhook` for successful/canceled payment events.
3. Make one real low-risk production payment through `/revenge`.
4. Убедитесь, что `Payment.status=PAID`, а у `AccessGrant` появился `productCode=resume_rewrite` либо точный `vacancy_match:<vacancyId>`.
5. Confirm return from YooKassa opens the same analysis and the user can build the corrected version.
6. Confirm DOCX and print are inaccessible without the grant and available after payment.
7. Only then set `BETA_PAYWALL_ENABLED=true` for public traffic.

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
