# Godel command and feature coverage gap audit

Date: 2026-08-03

Scope: all 59 canonical commands, their 423 catalogued feature bullets, nested controls, filters, exports/downloads, multi-step combinations and contextual voice follow-ups. The active HDS integration was inspected only at the registry level and deliberately excluded from new fixtures and implementation recommendations in this pass.

## Executive finding

The command-opening layer is broad; the nested Jarvis layer is not yet broad.

- Canonical commands: **59/59 registered**.
- Commands classed `open-only`: **52/59 (88.1%)**.
- Commands classed `partial-nested`: **7/59 (11.9%)**.
- Catalogued feature bullets: **423**.
- Modeled adapter actions: **87** across 41 commands.
- Centrally enabled adapter actions: **4**: EM metric, MOST result count, HMAP Map/Table and composite IMAP index/view.
- Disabled/unbound adapter actions: **83**.
- Export status: 8 verified, 5 observed-unverified, 9 unknown and 37 with none documented.

This does not mean only four nested interactions work in the current checkout. It means the central capability artifacts lag newer live work. For example, GF company/metric/range/estimate control has live verification and tests elsewhere, but the adapter contract still labels its composite action `live-observed-unbound` and the capability matrix does not enumerate it. This drift is itself a P0 audit gap because Jarvis cannot make trustworthy capability decisions from contradictory sources.

## Prioritized gaps

### P0 — correctness, safety and registry truth

1. **Synchronize capability truth.** Reconcile `capability-matrix.json`, `adapter-contracts-v1.json`, inventories, live-verification report and actual installed callbacks. GF and newer IMAP work are the clearest drift examples.
2. **Unify export truth.** ANR and HDS are labelled `verified` in the matrix while their contracts still have unresolved formats and disabled bindings. A verified export should require format, download event, non-empty artifact, scope and overwrite policy.
3. **Centralize consequential-action gating.** QM mutations, G/AL alerts, BROK, CHAT, ACM, PDF, NOTE, ENT and ERR must share confirmation or unsupported semantics before any nested implementation.
4. **Canonicalize nested action vocabulary.** The live eval repeatedly understands requests but emits documentation labels instead of adapter labels. One canonical schema must map synonyms before validation without accepting invented values.
5. **Add workflow omission checks.** Long dictated desks can silently omit requested panels. Compare extracted requested nouns against emitted command families before execution.

### P1 — highest-value Jarvis capabilities

1. **EQS:** numeric range filters and Run/Clear are now live; remaining work is stacked dynamic list/boolean filters and verified CSV/JSON download.
2. **News:** local source/language/category/date/watchlist/keyword/class-action filters, pause/resume, article opening, TTS and verified article PDF. Keep global saved filters gated.
3. **Options:** OMON expiry/depth/columns/Greeks and exact selected-contract handoff to G/FOCUS/OVME; OVME complete calculator inputs.
4. **Charts:** G interval/style/range/scale/indicator/snapshot and safe alert boundary; HMS full members/timeframe/metric/layout; GF display style/axis/scale/transform and verified export.
5. **Market discovery:** MOST ranking/cap/sector, HMAP universe/dynamic metrics/sectors/animation/update/color/movers, IMAP sector drill/back/sort, SECF complete query/tab/max/venue/country filters.
6. **Research tables:** FA statements/periodicity/export, ERN date range, EM growth/chart/series, SI range/refresh, CF filing/watchlist filters, HP range/resolution/paging/export.

### P2 — valuable follow-up depth

- DES related-panel navigation; FOCUS flashing/popout; TAS milliseconds and column controls; HCP custom dates.
- FX converter/inversion; TREND timeframe/refresh; HALT refresh; ALLQ active-only and row actions.
- AUM Global/Personal and refresh; IPO paging/prospectus/export; TRAN Q&A and older paging; KELLY inputs.
- QM watchlist and column management only after a confirmation design exists.

### P3 — obscure/open-only discovery

Q, WEI, WEIF, GLCO, MOSO, WJI, RES, HLDR, PAT, PRT, MAP, CITADEL, HELP and CHANGE are reasonable open-only commands until live controls are discovered. Their immediate need is better intent coverage and post-open summaries, not guessed UI automation. DVD is primarily read-only despite many displayed fields.

## Command-by-command audit

| Command | Current class | Most important remaining capability |
|---|---|---|
| Q | Open-only | Grounded quote summary; no documented controls |
| DES | Open-only | Same-security related opens: G/N/CHAT/FA/EM/ANR |
| FA | Open-only | Statement, periodicity, Excel/JSON |
| ERN | Open-only | Date range and grounded estimate/forward-P-E narration |
| EM | Partial | Growth basis, chart mode, estimates visibility, live revenue variants |
| SI | Open-only | From/to dates and refresh |
| GR | Partial | Legs, period, correlation window and regression as one verified transaction |
| ANR | Open-only | Resolve contradictory export status/format |
| DVD | Open-only | Mostly grounded reading; no clear nested control |
| QM | Open-only/gated | Watchlist CRUD, ticker import and column management with confirmation |
| FOCUS | Open-only | Flash toggle and pop-out |
| TAS | Open-only | Milliseconds and column visibility/order |
| HCP | Open-only | Preset/custom date ranges and paging |
| WEI | Open-only | Grounded regional/index summary |
| WEIF | Open-only | Region navigation and grounded YTD summary |
| IMAP | Partial | Sector drill/back and member sorting need live binding |
| HMAP | Partial | Universe, metrics, sectors, animation, update rate, color and movers |
| GLCO | Open-only | Commodity-group navigation and spoken summaries |
| FX | Open-only | Currency selection, amount and inversion |
| MOST | Partial | Ranking, min/max cap and sector |
| MOSO | Open-only | Discover filters/contract navigation; currently undocumented |
| HDS | Active separate work | Registry/export truth still inconsistent; excluded from fixtures here |
| HLDR | Open-only | Only latest holdings known; discover table controls/export |
| N | Open-only | Extensive per-window filters and article PDF/TTS |
| NI | Open-only | Query works; add correction and handoff to N filters |
| TOP | Open-only | Article navigation, keyboard control and TTS |
| RES | Open-only | Discover report filters/reader/export |
| TREND | Open-only | 1H/24H/WEEK/MONTH and refresh |
| HALT | Open-only in matrix | Tab/refresh implementation truth and export icon verification |
| ALLQ | Open-only | Active-only and Q/G/DES/FOCUS/OMON row actions |
| SECF | Open-only | Query/tab/max/venue/country/no-trade filters |
| WJI | Open-only | Grounded sentiment narration; export icon unverified |
| EQS | Open-only | Full filter stack, Run/Clear and CSV/JSON |
| OMON | Open-only | Mode, expiry, months, strikes, columns, Greeks and contract handoff |
| OVME | Open-only | Full pricing inputs, IV solve and Greeks |
| CALC | Open-only | Scientific and TVM key/value/solve workflow |
| BROK | Gated | Connection lifecycle only with explicit confirmation |
| AUM | Open-only | Global/Personal and refresh |
| G | Open-only | Style/range/scale/indicators/drawings/snapshot; alert gated |
| HMS | Partial | Members, timeframe, metric and layout |
| HP | Open-only | Dates, 1D/1H/1M, paging and Excel/JSON |
| GF | Partial in practice, stale artifacts | Style/axis/scale/transform and verified export |
| CF | Open-only | Filing/watchlist filters, Select All/Apply and reader destination |
| IPO | Open-only | Paging, prospectus navigation and Excel |
| TRAN | Open-only | Search, company/quarter/year, Q&A and older paging |
| PAT | Open-only | Live syntax/parameters remain undocumented |
| PRT | Open-only | Live syntax/parameters remain undocumented |
| MAP | Open-only | Venue details/hours after correct MAP/IMAP routing |
| CITADEL | Open-only | No known nested surface |
| KELLY | Open-only | Starting balance, probability and bet sizing |
| HELP | Open-only | Section/command navigation if useful |
| CHAT | Open-only/gated | Read-only search first; all posting/group mutations confirmed |
| ACM | Gated | Read-only invoices possible; profile/billing/subscription mutations confirmed |
| PDF | Gated | Settings inspection read-only; every change confirmed |
| AL | Gated | List/read alerts; create/edit/delete confirmed |
| NOTE | Gated | Open/read note; create/edit/save/delete confirmed |
| ENT | Gated | Read entitlements; subscribe/unsubscribe unsupported unattended |
| CHANGE | Open-only | Grounded latest-version summary |
| ERR | Gated | Open form only; submission unsupported unattended |

## New evaluation fixture

`data/jarvis-capability-gap-cases-v1.json` adds **43 strict cases** without changing runtime behavior or weakening expected outcomes. It includes:

- 33 high-value nested command families.
- More than 25 contextual configure steps.
- At least six explicit export/download controls.
- Three long multi-panel workflows.
- Confirmation/unsupported expectations for consequential mutations.
- No HDS commands or HDS adapter/test changes.

The fixture is intentionally aspirational: an executable expectation means the desired Jarvis semantics, not a claim that a binding is currently production-ready. Runtime readiness remains separately governed by adapter contracts and postcondition evidence.

## Recommended execution sequence

1. Registry-truth reconciliation and shared action canonicalization.
2. Export router and artifact verifier for already documented formats.
3. EQS + News, because they unlock the largest filter surface.
4. OMON/OVME + chart family, because they create the most impressive voice workflows.
5. Market-map and finder filters.
6. Research-table follow-ups.
7. Safe settings/watchlist/note mutations only after a reusable confirmation flow exists.
