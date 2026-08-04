# HDS and EQS current-state evaluation audit

Date: 2026-08-03

> **Superseded readiness note:** the score below is a preserved pre-binding benchmark. Later the same day, HDS restored-layout addressing was live-verified, the workflow schema gained strict EQS structured range values, and all 14 numeric range fields were enabled through one exact 20-field-menu/editor binding. `P/E (Fwd)` 10–20 plus Run completed in 1,793 ms; `Market Cap (USD)` above $10B plus Run completed in 1,367 ms. The fixture now stores exact structured objects and tags all 14 range cases executable. See `reports/live-verification-2026-08-03.md` for current runtime truth.

This audit follows the authenticated HDS view and EQS Run/Clear changes. It changes no runtime, compiler, extension or schema files.

## Readiness ground truth

### HDS

- `Table`, `Treemap` and `Bubble` are now exact enabled view values in the central adapter contract.
- Completion requires mutually exclusive rendered state: only the requested table, treemap or multi-circle bubble visualization may be visible.
- Opening-workflow and addressed existing-panel actions are allowlisted.
- Known limitation: after a full Godel reload, some persisted HDS panels lose native window identity; reopening HDS restores addressing.
- HDS row navigation, 13F navigation and download remain separate from the newly verified view primitive.

### EQS

- `screen.run` and `screen.clear` are enabled, narrow actions with authenticated proof.
- Run requires a fresh `run_id`, complete status and a non-empty results table. Clear requires the authoritative filter list to become empty.
- The narrow binding refuses filter edits.
- All 14 range fields are normalized and have authoritative-state assertions, but their live editing binding remains unverified.

## New strict corpus

`data/jarvis-hds-eqs-current-eval-v1.json` contains 30 cases:

- 9 HDS cases: all three opening views, four natural/immediate follow-ups, HDS-versus-HLDR disambiguation and missing-context clarification.
- 7 EQS Run/Clear cases: three currently routable fast follow-ups, two short-language readiness gaps, one missing-context clarification and one delayed compound sequence.
- 14 aspirational range cases: exactly one for every observed range field.

The range cases keep the desired executable meaning but are tagged `aspirational`, never `executable`. Their compact string value is an evaluation representation such as `P/E Fwd|max=25`; it is not a claim that the production action schema can send the adapter's structured object.

## Pinned live-model score

Route: OpenRouter `openai/gpt-oss-120b`, Groq only, fallbacks disabled, temperature 0, one attempt per case.

| Metric | Score |
|---|---:|
| Strict overall | 6/30 (20.0%) |
| Structured/well-formed | 28/30 (93.3%) |
| Workflow shape | 11/30 (36.7%) |
| Exact actions | 4/27 (14.8%) |
| Strict steps | 5/28 (17.9%) |
| Contextual configure | 1/23 (4.3%) |
| Company entities | 4/4 (100%) |
| Clarifications | 1/2 (50%) |
| Reported executable plan | 8/28 (28.6%) |

Latency: p50 **1,063 ms**, p90 **1,738 ms**, p95 **1,939 ms**, maximum **2,021 ms**. Cost was about **$0.030**.

Raw report: `reports/jarvis-hds-eqs-current-eval-live.json`.

## Results by capability

### HDS: 6/9 raw model exact

Passing:

- Open Table, Treemap and noisy “bub bull” Bubble.
- Natural Treemap follow-up.
- “Who owns Berkshire” correctly selected HDS rather than HLDR.
- Missing-context Bubble request clarified.

Failures:

- “Put this back in the table” asked an unnecessary confirmation.
- Two Bubble follow-ups used invented `bubble` actions instead of canonical `view.select=Bubble`; their plans correctly failed closed.

The production fast path correctly canonicalizes both explicit Bubble failures, so the raw model score understates current routed behavior. The short Table anaphora remains a real readiness gap.

### EQS Run/Clear: 0/7 raw model exact

- The model reopened EQS for one Run request, clarified “run it,” emitted `run/clear` invented actions twice, clarified natural Reset, returned unsupported instead of missing-context clarification, and clarified the delayed Run-then-Clear sequence.
- The deterministic production fast path correctly handles three explicitly tagged executable phrases: “run the screener query,” noisy “apply the screener results,” and “clear the screener filters.”
- “Run it” and “reset this equity screen” are tagged readiness gaps because neither the fast router nor the model handled them exactly.
- Run-then-clear-after-viewing-results remains aspirational because it implies delayed stateful sequencing.

### EQS ranges: 0/14 exact

- 8 produced an execute-shaped response, 2 produced validation errors, 2 clarified and 2 returned unsupported.
- Six execute responses reached the correct command family but used noncanonical actions that failed plan validation.
- Two responses produced a formally executable plan only by reopening an empty EQS panel and silently dropping the requested revenue/net-income filter.

That last result is the most important scoring trap: `executable=true` does not mean the requested operation survived. Strict step/action scoring correctly failed both cases.

## Evaluation-system gaps

1. **Fast-path blindness:** the live model evaluator calls the LLM compiler directly and does not run the production deterministic follow-up router first. It therefore reports 0/7 for Run/Clear even though three supported phrases route locally, and it misses two locally repaired HDS Bubble follow-ups.
2. **Readiness is not required by overall score:** the harness reports the executable metric but excludes it from semantic overall. Future release gates need a separate `executable` partition whose pass requires a non-null plan and verified binding.
3. **Range representation mismatch:** the model/schema action value is scalar, while the EQS adapter requires `{field, minimum, maximum}`. Exact live range evaluation is impossible without a schema-safe structured representation or a deterministic scalar-to-structure compiler.
4. **Silent-loss visibility:** reopening an empty EQS screen can count as executable even when the filter disappears. Any requested filter must be present in the final plan and authoritative postcondition.
5. **Canonical vocabulary:** prompts still invite `bubble`, `run/clear`, and catalog-style valuation names rather than the exact `view`, `screen`, and structured range actions.

## Prioritized repair plan

1. Add a two-lane evaluation runner: deterministic fast path first, pinned LLM fallback second. Report each lane and combined routing accuracy.
2. Add an executable-readiness score that requires exact requested actions, a non-null plan and an enabled contract; never accept open-only degradation.
3. Extend the range action representation safely, then bind one low-risk field end to end before enabling all 14.
4. Add exact prompt examples for HDS `view.select` and EQS `screen.run/clear` while keeping runtime validation authoritative.
5. Expand deterministic anaphora only for bounded active-panel context: “run it,” “reset this screen,” and “back to the table.”
6. Re-run this unchanged 30-case corpus. Do not rewrite expected actions around model output.

## Verification

- New corpus validation and readiness tests: 6/6 passed.
- Full repository suite after adding the fixtures: 289/290 passed. The sole failure is the pre-existing CDP source assertion in `tests/cdp.test.mjs`, which still expects the retired `nearby.length !== 1` panel-selection guard; the current executor now uses typed window roots and spatial association.
- The live run happened before three cases were conservatively retagged from executable to readiness-gap. Case outcomes are unchanged; use the final fixture tags, not the raw live report's tag aggregate, for readiness partitioning.
