# Live acceptance: failed before writer

Source: c3eb9ecba3d34e39f2bb0fda07a7a299db6aab41. User authorized a separate maximum $1 for this test. No historical spending was declared reconciled. Two synthetic CVs: H10 (audit regression) and N01 (new laboratory assistant).

Six real OpenAI requests, all HTTP 200 with usage and request IDs. Estimated spend from returned token usage: $0.04152525. Conservative total reservations including maximum output: $0.1829709375, below the $0.95 dispatch ceiling. No unknown charges. These are token-based calculations, not a billing statement. Model defaults retained. No successful HR answers; no literary acceptance possible.

## H10: broken selected observation IDs

After facts extraction, semantic rejection, one repair and successful recheck, coordinated_plan_v1 returned selectedId T1/L1/G1/V1. Available observation IDs were F11..F13/S11..S13, F21..F23/S21..S23, F31..F33/S31..S33, F41..F43/S41..S43 respectively. None of the four selected IDs exists. validatePlan throws `Выбранное наблюдение не подтверждено` before the writer. First failed attempt: 34.348s, $0.03737025. Full provider response: call-5.json.

Fix requirement: enforce selectedId membership, convey actual validation errors to one bounded repair of the plan, then validate again. Never choose an arbitrary first item or silently rewrite the model's selection. Keep facts immutable. Reproduce with this saved response before paying for a new request.

## N01: citation punctuation blocks repair

The first facts response cites `Принимала и маркировала образцы бетона.` for inferred industry, but the CV has a comma after `бетона`, followed by more duties. validateFacts rejects the exact substring before the semantic review/repair branch can run. First failed attempt: 3.324s, $0.004155. Full provider response: call-6.json.

Fix requirement: initial schema/citation validation failures must enter a single bounded repair with explicit errors and the original CV; corrected evidence must still be an exact source span. Do not disable grounding or accept invented text. Reproduce with the saved response.

## Test interpretation

The harness caught and saved failed product attempts, so Playwright's `1 passed` only describes harness completion. Product live acceptance FAILED. No model responses were substituted. No application logic was modified. Tests and outputs contain synthetic CV data only; no credentials or request authorization headers.

Further paid calls stopped after these reproducible failures. Replaying the same unmodified route would not resolve the defects. Full four-persona latency/cost and voice quality remain unmeasured.
