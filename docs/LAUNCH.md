# ToxicHR — Launch checklist

Production readiness before public traffic.

## Required env

| Variable | Notes |
|----------|--------|
| `NEXT_PUBLIC_APP_URL` | Public HTTPS origin |
| `DATABASE_URL` | Postgres in prod; SQLite ok for local |
| `AUTH_SECRET` | Long random (`openssl rand -base64 32`) |
| `STRIPE_SECRET_KEY` | Live key for real charges |
| `STRIPE_WEBHOOK_SECRET` | From Stripe webhook endpoint |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Browser key |
| `STRIPE_PRICE_FULL_REPORT` | Cents, default 990 |
| `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` | Required for live persona voice (`AI_PROVIDER` ≠ `mock`) |
| `AI_PROVIDER` | `mock` (heuristics only) \| `openai` \| `anthropic` |
| `ALLOW_MOCK_CHECKOUT` | Optional; set `false` to disable local mock unlock |

Copy from `.env.example`. Never commit `.env`.

**Fail-closed payments:** in `NODE_ENV=production`, checkout without a valid `STRIPE_SECRET_KEY` returns **503** — never a free unlock.

## Pre-deploy

1. `npm run db:push` (or migrate) against prod DB
2. `npm run build` green
3. Stripe webhook → `POST /api/payments/webhook`
4. Confirm production checkout fails closed without Stripe (503, not free unlock)
5. Confirm mock unlock only in non-production when Stripe unset
6. OG card: open `/toast/{slug}` in Telegram / LinkedIn debugger
7. Auth: register → claim analysis → history
8. Delete account path: settings → УДАЛИТЬ
9. With AI keys: persona voice differs from heuristic; quotes still grounded
10. Without AI keys: honest heuristic path still ships plan + rewrites

## Smoke path

```text
/ → /start → /personas → /analyzing → /verdict
→ /report → checkout → full report
→ /share → publish → /toast/{slug} → /challenge/{slug}
→ /auth → /history → /settings
```

## Security defaults

- Public shares: no name/companies in payload
- Full report redacted without AccessGrant
- PII redacted before AI
- Rate limits on upload/analysis (verify under load)

## Visual QA (mobile)

- [ ] Landing first viewport: brand + CTA readable
- [ ] Personas 2-col → 1-col stack
- [ ] Verdict score + CTAs thumb-friendly
- [ ] Share Studio sticky preview usable
- [ ] History row actions wrap cleanly
