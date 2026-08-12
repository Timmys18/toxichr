# ToxicHR — Launch checklist

Production readiness before public traffic.

## Required env

| Variable | Notes |
|----------|--------|
| `NEXT_PUBLIC_APP_URL` | Public HTTPS origin |
| `DATABASE_URL` | SQLite-файл на постоянном диске для текущей версии |
| `AUTH_SECRET` | Long random (`openssl rand -base64 32`) |
| `OPS_EMAILS` | Emails allowed to open `/ops/funnel` |
| `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` | Required for live persona voice (`AI_PROVIDER` ≠ `mock`) |
| `AI_PROVIDER` | `mock` (heuristics only) \| `openai` \| `anthropic` |

Copy from `.env.example`. Never commit `.env`.

## Pre-deploy

1. `npm run db:push` (or migrate) against prod DB
2. `npm run build` green
3. OG card: open `/toast/{slug}` in Telegram / LinkedIn debugger
4. Auth: register → claim analysis → history
5. Delete account path: settings → УДАЛИТЬ
6. With AI keys: persona voice differs from heuristic; quotes still grounded
7. Without AI keys: honest heuristic path still ships plan + rewrites
8. `/ops/funnel` is hidden without an email from `OPS_EMAILS`
9. Improvement: answer questions → create version → download DOCX → open print view
10. Vacancy: standalone review → match against saved resume

## Smoke path

```text
/ → /session → result → public card → /toast/{slug}
→ new visitor → upload → result
→ /revenge → DOCX / print
→ /vacancy → match against resume
→ /auth → /me → /settings
```

## Security defaults

- Public shares: no name/companies in payload
- Full report is free; paid value starts with a corrected document
- PII redacted before AI
- Rate limits on upload/analysis/vacancy review (verify under load)

## Visual QA (mobile)

- [ ] Landing first viewport: brand + CTA readable
- [ ] Personas 2-col → 1-col stack
- [ ] Verdict score + CTAs thumb-friendly
- [ ] Share Studio sticky preview usable
- [ ] History row actions wrap cleanly
