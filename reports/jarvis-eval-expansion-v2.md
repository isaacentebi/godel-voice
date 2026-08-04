# Jarvis evaluation expansion v2

Date: 2026-08-03

## What changed

- Added `data/jarvis-eval-expansion-v2.json` with 81 strict natural-speech cases.
- Every one of the 59 canonical Godel commands appears as an expected command step.
- Added coverage for noisy pronunciation, corrections, command disambiguation, company-to-ticker resolution, multi-panel workflows, contextual follow-ups, nested filters, layout, exact close targeting, exports/downloads, clarifications and consequential-action blocking.
- Added an explicit two-way regression for `IMAP` (S&P/DJIA sector wheel) versus `MAP` (world exchange opening-status map).
- Kept this corpus separate from the frozen benchmark and the first adversarial corpus.
- Did not relax exact scoring or modify the runtime to improve the score.

## Verification

- Repository tests: **230/230 passed**.
- Expansion structural tests: **6/6 passed**.
- Corpus size: **81 cases**.
- Command coverage: **59/59**.

## Pinned live-model result

Route: OpenRouter `openai/gpt-oss-120b`, pinned to Groq only, fallbacks disabled, temperature 0, one run per case.

| Measure | Result |
|---|---:|
| Exact overall | 54/81 (66.7%) |
| Command routing | 62/66 (93.9%) |
| Workflow shape | 67/81 (82.7%) |
| Nested actions | 8/15 (53.3%) |
| Company/entity resolution | 26/33 (78.8%) |
| Clarification behavior | 1/3 (33.3%) |
| Strict step match | 54/75 (72.0%) |
| Contextual configure | 1/4 (25.0%) |
| Window control | 1/6 (16.7%) |
| Valid structured output | 81/81 (100%) |
| Provider availability | 81/81 (100%) |

Latency: p50 **1,123 ms**, p90 **1,725 ms**, p95 **1,888 ms**, maximum **3,358 ms**. Average prompt size was 8,009 tokens. The full run cost about **$0.079**.

Raw report: `reports/jarvis-eval-expansion-v2-live-full.json`.

## Main failure clusters

### High-priority semantic failures

- `xv2-imap-not-world-map`: a direct request for the index sector wheel, explicitly excluding the world exchange map, still routed to `MAP` instead of `IMAP`.
- `xv2-most-activity`: “by volume” selected dollar-value ranking instead of active/volume ranking.
- `xv2-workflow-company-desk-noisy`: omitted the earnings matrix and filings from a six-panel dictated research desk.
- `xv2-workflow-macro-strip`: omitted the cash world-index panel and opened only futures, commodities and FX.
- `xv2-pdf-settings-open`: opening Settings without changing anything was rejected as unsupported.
- `xv2-ambiguous-earnings`: “Amazon earnings” silently chose the earnings matrix rather than asking matrix versus estimates versus transcript.
- `xv2-unsupported-forward-pe-label`: produced ordinary `P/E` plus estimates despite the request requiring a guaranteed forward-only label that GF does not expose.
- `xv2-unsupported-alert-create`: attempted an unattended price-alert creation instead of failing closed.

### Entity-resolution failures

- Coca-Cola, Eli Lilly, “Alphabet Google,” Apple in systematic pattern search, Block/Square and Unity were left unresolved despite provided trusted entity fixtures in five of those cases.
- Alphabet without a share class executed an unresolved earnings matrix instead of clarifying `GOOG` versus `GOOGL`.

### Nested-action and follow-up failures

- The model often understood the requested control but emitted noncanonical feature names, such as `sell leg` instead of the expected comparison action, `range filters` for EQS, and `source include/exclude` for News.
- MOST and News contextual filters preserved the target panel but used schema-incompatible action names/values.
- The EQS follow-up collapsed multiple requested filters, Run and CSV export into two invented actions.
- Download phrases for HP, IPO and chart snapshots were modeled as `configure` actions instead of explicit verified export controls.
- “Make this wider” produced a resize operation with no resize value; moving used placement rather than the control value.

### Strict-but-near misses

- The four-panel market workspace routed all four commands correctly, but added an unrequested IMAP `Map` action; exact action scoring correctly marked it as a failure.
- The options workflow got all commands, entities, placement and Put mode correct, but chose the generic layout preset rather than `options`.
- GR understood Apple versus Microsoft with correlation, but emitted documentation-like feature labels instead of the canonical action contract.

## Recommended implementation order

1. Deterministically repair `IMAP` versus `MAP`, including explicit negative phrases.
2. Route export/download language through control steps before asking the model for nested configuration.
3. Canonicalize documented feature-label synonyms before strict validation, while continuing to reject unknown values.
4. Treat consequential requested mutations—alerts, chat posts, account changes—as confirmation-required or unsupported regardless of model output.
5. Improve trusted entity hydration and add explicit share-class clarification for Alphabet.
6. Add omission checking for multi-command workflows: compare requested noun phrases with produced command families before execution.
7. Re-run this unchanged 81-case corpus; do not rewrite expected answers around model behavior.

## Deterministic repair checkpoint

Implemented four safe compiler-level repairs without changing the expected corpus:

1. Explicit index/sector-wheel language routes to `IMAP`, including “not the world exchange map”; explicit venue/open-exchange language routes to `MAP`, including the inverse negative phrase.
2. MOST “by volume” deterministically selects `Active`; “dollar volume/value” selects `Value`. Any conflicting model ranking is replaced.
3. Bare “company earnings” clarifies matrix versus analyst estimates versus transcript. Named surfaces remain executable.
4. Alert creation/edit/delete language fails closed as unsupported until a confirmed interaction exists, even if the model initially returns a clarification or the speaker says “without asking again.” Read-only “show my alerts” remains executable.

Verification after repair:

- Targeted deterministic tests: passed.
- Full repository: **239/239 passed**.
- Pinned live regression cases: **5/5 exact** (`IMAP`, inverse `MAP`, MOST volume, ambiguous earnings, alert mutation).
- Pinned regression latency: p50 **865 ms**, p95 **971 ms**.
- Raw regression report: `reports/jarvis-eval-expansion-v2-repair-smoke.json`.

Next repair priority, intentionally not included in this checkpoint: trusted company hydration, canonical nested-action synonyms, deterministic export routing, and omission detection for long workflows. Those require broader changes and should remain measured against the unchanged 81-case corpus.
