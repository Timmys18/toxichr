# Final UX and voice acceptance — 29 October 2026

Status: implementation candidate; NOT literary acceptance or market-release approval.
Approved scope: final UX of the resume-to-document flow and four generative HR characters.
Baseline: `62b2e734d102f75c977dd379ba331ec49fc3edd5`.

## Implemented

- The result hero displays the writer's `verdict.comment`, never the analyst's `topProblems[0].roast`.
- `verdict.findingIds` links the lead to findings or strengths. Unknown IDs are rejected. Legacy reports remain readable; they do not get an unrelated quote attached to their lead.
- Authored blocks appear in the expanded review without repeating the lead or artificially padded legacy fields. Short substantive content is valid; boilerplate is not added to satisfy character counts.
- Mobile shows the HR portrait beside the attribution instead of below the action. Detail headings use inflected names.
- Always-present character direction defines worldview, rhythm, praise, uncertainty and professional breadth. Fictional craft examples teach contrast even when no narrow scenario matches; scenario-specific examples remain separately selected.
- Analyst guidance requests specific professional relationships rather than generic lack-of-detail summaries. Bounded source context accompanies findings in both writer and repair calls.
- Removed the blanket ban on the professional word «приём». Other safeguards against invented claims, numbers and sensitive public quotes remain.
- Existing provider selection and default models are unchanged. No new model stage was added.

## Evaluation kit

`tests/fixtures/voice-release-cases.json` has nine development and three held-out synthetic cases. H02 was used to tune the reviewer and is no longer a holdout. The remaining held-out cases must not be used to tune prompts before initial acceptance. They are newly authored, not an independently sourced benchmark.

`tests/persona/voice-release-live.spec.ts` is disabled by default. It supports one to three repetitions, all four personas, explicit case selection and a hard network-call limit. Each successful or limited result is saved before its status assertion. Manifest records commit, dirty state, case/persona mapping and call count. Random IDs conceal the assigned persona in `blind.json`; the manifest must stay hidden during review. The source text remains visible for factual evaluation.

Example command ONLY after credentials, model and spend limit have been agreed:

```sh
RUN_VOICE_RELEASE=1 VOICE_CASE_IDS=R01 VOICE_REPETITIONS=1 VOICE_MAX_CALLS=12 npx playwright test --config=playwright.persona.config.ts tests/persona/voice-release-live.spec.ts --workers=1
```

This limits requests, not currency. Prices, tokens and failures must be reviewed before choosing a monetary cap; no prepaid budget is implied. Original gateway transport retries/repair count towards the request cap. If the cap is reached, the batch stops and retains its partial artifacts. Test retries must remain disabled.

For before/after review, run the same synthetic inputs and provider/model configuration on an isolated checkout of the baseline and the candidate, then mix outputs. Do not compare newly generated candidate output with handwritten historical fixtures. No baseline/candidate comparison has been executed here.

## Editorial review protocol

Evaluate each lead with its resume, then the full report. Record the guessed persona before revealing the manifest. Record factual defects separately from taste. Rate specificity, voice recognition, wit, usefulness and readability on an anchored scale:

- 1: absent, generic or actively misleading;
- 3: useful and identifiable but conventional;
- 5: specific, unmistakable, concise and worth quoting.

For each before/after pair record preferred / tie / worse and a reason. Report counts per persona, not only an aggregate. On repetitions compare central observations, opening constructions, metaphors and endings. Shared facts are expected; repeated creative framing is a warning. Exact phrase overlap is only a diagnostic, never an automatic humour score. Blind evaluation by the implementing author still has bias; owner acceptance remains necessary.

Critical blockers: fabricated experience or attribution, contradicting supplied facts, devaluing proven work, privacy leakage, executing instructions embedded in a resume, or unsupported advice. Any blocker must be fixed and the affected case plus related cases rechecked. A clean finite sample is evidence, not a guarantee of universal correctness.

Release conditions: clear improvement over baseline for each persona, no unresolved critical defects, diversity across repetitions and unfamiliar contexts, acceptable measured latency/cost, and completed browser acceptance. No numeric literary pass rate has been invented in advance of actual results.

## Outstanding

- Live credentials are absent in the current environment. No paid calls were made; literary quality, variability, latency and current cost are unmeasured.
- Browser checks passed 5/5 on the candidate: four persona fixtures at desktop/mobile widths and the mock resume-to-DOCX/cabinet/vacancy flow. Updated screenshots are in `tests/artifacts/hr-voices-v02/` and `artifacts/ux-ui-rebuild/after/`. Long authored leads are readable without clipping; actions can move below the first viewport. These fixtures exercise display, not model quality. The adaptation path tested a truthful insufficient-data stop, not a successful live adaptation.
- Full payment/provider/production release acceptance is outside this implementation checkpoint. No deployment or remote push was performed.
