# ToxicHR — audit corrections 2026-11-03
Branch review/ux-ui-rebuild-48a583b. Starting HEAD verified: 522457c. Existing architecture retained.
Implemented:
- Semantic reviewer checks every professional assessment field, candidate context and arrays plus observations; omitted decisions fail closed. One repair/recheck; unsupported final fields cannot pass.
- Any semantic change or review failure invalidates stored coordinated plan. Current attempt fails before author; next attempt rebuilds coordination from saved facts. Never feeds rejected old observations to coordinatedDirection.
- Expiring 180s lease, 20s heartbeat, atomic conditional takeover. Ownership renewed before model calls; checked again after response and fenced inside save transactions. Cache checked before acquiring/waiting; abandoned RUNNING marked failed after acquisition.
- Per-call fsynced receipt journal `.data/ai-call-ledger.jsonl`, no prompts or secrets. Analysis calls also recorded in AiCall database table, immediate usage/time/estimated cost aggregation survives FAILED. STARTED, ERROR or missing usage remain unresolved (not zero); raw usage + request ID available for billing reconciliation. Standalone runAi calls also journaled.
- Account profile uses general attribution/tool-use principles; removed 85%/weekly-list fixture wording.
Validation: final typecheck and targeted ESLint passed; 20/20 addressed tests passed. Results: artifacts/recovery/audit-fixes-tests.json. Tests use isolated SQLite and fake HTTP transport, no live acceptance.
Budget: recovery paid calls 0. Lifetime spend and remainder still UNKNOWN because paid historical runs were lost; existing $5 reconciliation gate retained. No live calls until confirmed.
Operational: schema changes require prisma db push on target before use; no production DB changes, merge or deploy. Unrelated modified UX screenshot preserved and excluded.
