# Live runtime truth audit — 2026-08-04

This is the offline reconciliation of what Godel Voice can actually operate inside an already-open Godel panel. The machine-readable authority is `data/live-runtime-truth-v1.json`.

## Bottom line

- Current contract controls: **16**.
- Disabled nested contract actions: **78**, all fail-closed.
- Legacy runtime adapters kept separate: authenticated GF, authenticated HALT, and partial/unverified GR.
- Mixed requests are atomic: if one requested nested action is unbound, no verified sibling action may execute.
- A documented feature, visible button, successful click, CSS class, or draft setting is never sufficient completion proof.

## Current contract controls

| Control | Required completion proof | Live proof | Real post-code VoiceInk? | Main limitation |
|---|---|---|---|---|
| EQS range filter | exact field and displayed min/max; optional fresh Run | 2026-08-03 | Yes | 14 exact numeric fields only |
| EQS USD/Technology list filter | authenticated menu, exact chip, optional matching result rows | 2026-08-03 | Yes | no other dynamic values |
| EQS Run | fresh mutation plus non-empty Ticker/Name/Last table | 2026-08-03 | Yes | stale results rejected |
| EQS Clear | every exact Remove-filter control disappears | 2026-08-03 | Yes | addressed panel only |
| HDS view | exactly one verified Table/Treemap/Bubble rendering | 2026-08-03 | Yes | restored panel identity must be unique |
| MOST result count | native count plus 1..N rendered rows | 2026-08-03 | Attempted; correctly failed overnight | empty market is not success |
| HMAP universe | exact target member count, changed count, and changed render signature when available | 2026-08-04 | Yes | live 30→503 member transition completed in 983 ms |
| HMAP view | exact table headers or large map without table | 2026-08-03 | No | one fast follow-up action at a time |
| EM metric | exact native option plus reloaded matrix | 2026-08-03 | No | multiples are read-only rows |
| EM valuation read | one exact Multiples row, labelled horizons and row-correct x/% units | 2026-08-04 | Yes | read-only; missing or ambiguous rows fail closed |
| IMAP index + view | exact index/member evidence plus requested map/table | 2026-08-03 | No | sector/sort disabled |
| News query | exact per-window query, clear affordance, exact table or valid zero state | 2026-08-03 | Yes | global filters/pause/article/PDF disabled |
| SECF People search | query/max plus People-only schema and bounded rows | 2026-08-03 | Yes | no venues/countries or other tabs |
| OMON strike depth | slider and N Strikes agree; table signature changes | 2026-08-03 | Yes | other option controls disabled |
| G contextual 1h | same iframe says 1 hour in popup and image label | 2026-08-04 | No | 1h only |
| HMS comparison | legend, timeframe, metric and layout all match | 2026-08-03 | No retained explicit run | exact supported securities only |

“No” in the VoiceInk column is deliberately conservative. It does not mean the underlying adapter lacks live proof; it means the retained evidence is manual, deterministic, direct-workflow, or model-open rather than an explicit real post-code VoiceInk delivery of that exact action family.

## Legacy runtime, not counted in the 16

- **GF — authenticated legacy-live.** Companies, supported/data-available metrics, range, estimates, Quarterly/Annual, Overlay/Split and offered currency have grounded render postconditions. P/E-like metrics remain company-dependent; no substitute is permitted. GF export is not a verified download.
- **HALT — authenticated legacy-live.** All/Active/Resumed completion uses authoritative counters and row populations, never Godel's misleading generic `active` CSS token. Refresh/export remain disabled.
- **GR — partial existing runtime, unverified in the newer strict audit.** The legacy allowlist covers legs, period, correlation/regression and full/filtered data, but no fresh authenticated completion proof is retained. It must not be counted as a current contract control.

## Reconciliation findings

- `extension/core.js` and `src/workflow-plan.mjs` independently validate the enabled command/feature/value shapes.
- `src/control-followup.mjs` uses bounded deterministic parsers where available. Absence of a fast path does not broaden execution; the validated workflow path still applies.
- `data/adapter-contracts-v1.json`, the enabled list in `docs/user-guide.md`, and `data/nested-capability-inventory-v2.json#live_runtime_cross_reference` contain the same 16 identifiers.
- Every current control has a command-specific executor and content-based postcondition in the truth JSON.
- Every disabled contract remains a non-executable binding kind. The tests enumerate all disabled actions rather than sampling them.
- HMAP explicitly demonstrates the atomic rule: a live view request combined with an unbound sector request yields no executable actions.

## Failed audits that remain disabled

- **CF forms/Godel reader:** exact 10-Q/10-K/8-K draft chips were readable, but Apply left unrelated Amazon 144, S-4 and 424B5 rows; the Godel-reader checkbox had no trustworthy selected state.
- **News Pause:** the installed runtime rejected the action, so provisional work was reverted. Query-only remains the production boundary.

No Godel UI was touched during this truth audit.
