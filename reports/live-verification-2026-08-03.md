# Authenticated Arc live verification — 2026-08-03

All timings below are executor durations reported by the authenticated local handoff. Visual assertions were checked against the live Godel accessibility tree after completion.

## Passed

| Workflow | Result | Executor time | Evidence |
|---|---:|---:|---|
| Focus Earnings Matrix | Pass | 7 ms | Godel workspace active-window state changed to the exact EM window. |
| HALT → Active | Pass | 781 ms | Live counters showed Total 93 / Active 2; the rendered result contained only AEMD and ABVC. CSS selected-state was deliberately ignored. |
| HALT → All restoration | Pass | 731 ms | Full halt dataset returned in the earlier adapter verification. |
| Fresh/reused Voice screen + HMAP left + Active HALT right | Pass | 1,237 ms | Existing empty screen was reused through native screen callbacks; both panels were placed through Godel's position manager. |
| HMAP Map → Table | Pass | 913 ms | Rendered table exposed Ticker, Last, Change and Volume headers. |
| HMAP Table → Map | Pass | 885 ms | Table disappeared and the large heatmap visual returned. |
| HMAP S&P 500 → DJIA | Pass | bounded live audit | Exact S&P 500 showed 503 members and the broad S&P tile set; exact DJIA then showed 30 members and a materially different Dow tile set including BA, CAT, AXP, GS, HD, HON, AMZN, KO, NKE, MSFT, IBM, NVDA, AAPL, MRK, DIS and CVX. Production completion requires selected label, authoritative count and changed render signature. The audit stopped with DJIA + Map visible. |
| Existing HALT panel → All (model configure follow-up) | Pass | 133 ms | Protocol-4 step telemetry recorded a configure step; the live table returned the full 93-row dataset. |
| “Show active halts in that window” (deterministic fast follow-up) | Pass | 207 ms | Request bypassed the model, the active tab was focused, and AX exposed only AEMD and ABVC. |
| Meta ERN + grounded completion | Pass | 531 ms | Exact table-column extraction produced: “Meta's FY26 forward P/E is 18.4x.” Godel visibly showed FY26 18.4x and FY27 17.3x. |
| Meta EM → EBITDA | Pass | deterministic follow-up | The exact active-screen Meta Earnings Matrix selected the native EBITDA option; hidden mounted EM copies were excluded by workspace identity and exposure ranking. |
| “uh jarvis show Meta pee e multiples please” | Pass | real VoiceInk | Opened Meta Earnings Matrix. Godel rendered the read-only P/E row as Last 4Q `19.1x`, Next 4Q `16.5x`, FY 2026 `15.9x`, and FY 2027 `14.8x`. No P/E selector exists, so no selector was promoted; completion narration is grounded only from this exact labelled row. |
| MOST → 10 results | Pass | deterministic follow-up | The native 10/25/50/100 selector changed to 10 and the executor proved a non-empty rendered row count no greater than 10. |
| META + MSFT Revenue fundamentals graph | Pass | model open workflow | One native GF panel opened with both companies and Revenue series. The subsequent layout-shell mismatch was repaired through Godel workspace state. |
| Existing GF → 5Y + estimates + Operating Margin | Pass | deterministic follow-up | One phrase configured the native graph in dependency order. AX showed Operating Margin series for both META and MSFT, the 5Y control, an estimate range through Q4 '28, and no failure toast. |
| Existing AMZN GF → Quarterly + Overlay | Pass | deterministic follow-up | Workflow `76be9630aa940bac76907ff406cc5f7e` completed in 319 ms. The addressed AMZN graph rendered quarter labels (`Q2 '08` through `Q4 '28`) with both AMZN and MSFT series in one overlay. |
| Existing AMZN GF → Annual + Split + EUR | Pass | deterministic follow-up | Workflow `21af4cbc964d527613263ceffbde1937` completed in 496 ms. AX confirmed `Display currency: EUR`, fiscal-year ranges, and two distinct split-series rows with independent AMZN and MSFT values in EUR. |
| Dow IMAP → Table | Pass | 841 ms | Deterministic phrase selected DJIA, proved the 30-member universe, and rendered Godel's native Ticker/Name/Last/Change/Chg %/Volume table. Workflow `3308d34113a653cc3f849e455d8ec1fe`. |

## Failures converted into regressions or explicit limitations

| Failure | Grounded cause | Disposition |
|---|---|---|
| `make the current window bigger` could not find `focused` | Godel did not expose a reliable DOM focus flag. | “Current” now targets the executor's remembered last window; focused falls back to it. |
| HALT appeared successful while still showing all rows | Godel reused an `active` CSS token that was not a selected-state guarantee. | Removed CSS assertion; completion now requires row count to equal the requested counter. |
| New-screen request from an already empty screen failed | No native window exists on a blank screen, so window-derived workspace context is unavailable. | Reuse and rename the active empty screen through verified screen-tab callbacks. |
| Ninth Godel screen could not be confirmed | Live terminal exposes an eight-screen limit. | Reuse an empty Voice/Blank screen first; otherwise fail clearly before opening panels. |
| GF P/E comparison for META failed | Godel's live GF metric builder marks P/E, P/S, P/B and P/CF “No data available for META.” | Do not substitute another metric. Route forward P/E to ERN/EM or report the GF limitation. |
| GF metric menu could not find Operating Margin | Live button accessible text appends “Add to favorites.” | Adapter accepts the exact metric label with that verified suffix and remains panel-scoped. |
| Multi-panel GF workflow latched onto an old crowded-screen panel | A heavily populated layout made new/reused window identity ambiguous. | Prefer a confirmed fresh/reused Voice screen for complex workspaces; keep fail-closed identity assertions. |
| Persistent service became registered but stopped after a source update | The final context pipeline added new runtime imports after the first private service bundle had been installed. | Runtime synchronization now copies every required source module and command data; doctor detects checkout/build drift before delivery. Restarted service passed protocol-4 identity and zero-warning diagnostics. |
| “Show all halts in that window” initially clarified unnecessarily | The model had fresh panel context but the phrasing was common enough to resolve deterministically. | Added a sub-millisecond fast-path compiler for HALT All/Active/Resumed, HMAP Map/Table, and explicit GF ranges. |
| “Meta earnings estimates” varied between ERN and EM | The model sometimes confused Earnings Estimates with Earnings Matrix despite both commands being in context. | Added deterministic command-confusion repair: “earnings estimates” → ERN and “earnings matrix” → EM. |
| EM metric changed a hidden mounted copy | Godel keeps panels from multiple screens mounted in the document. | Panel lookup now begins with Godel's active-screen window IDs and ranks actually exposed panels before covered copies. |
| “Open a fundamentals graph…” was interpreted as an existing-panel follow-up | The new local GF parser saw the command and metrics but did not distinguish creation verbs. | `open/create/build/launch/new/pull up/bring up` bypass the follow-up fast path and retain the normal open workflow. |
| Existing GF metric follow-up tried ticker `CONTEXT` | Configure-only plans use an internal placeholder instead of a terminal security prefix. | Metric application now reads exact loaded companies from Godel's native `Add metric for SYMBOL` controls; the placeholder can never become a ticker. |
| GF custom toggle and builder wrapper were not literal HTML buttons | Godel's accessibility names were correct, while tag- and text-only DOM lookup missed the native custom control. | Exact metric lookup now uses panel-scoped accessibility labels and the unique exact `Add series` action; failures clean up the builder dialog. |

This report records observed behavior for one authenticated deployment. Godel can change; internal callback shape checks and live regressions remain required.

## CF filings bounded re-audit — 2026-08-04

- An exact security-scoped `AMZN US CF` panel rendered authoritative `Ticker / Form / Description / Date / Time` rows.
- The exact settings surface exposed `Apply`, `Reset Filters`, `Render Filings In Godel (global setting)`, filing-type search, category selectors, and the complete dynamic form list.
- The settings draft visibly proved `Forms: Include:` with exact `Form 10-Q`, `Form 10-K`, and `Form 8-K`; each matching option displayed a checkmark.
- The attempted Apply did not produce an independently matching result set. The Amazon table still contained unrelated forms including `144`, `S-4`, and `424B5`, so selected-control state alone was rejected as completion proof.
- The global Godel-render checkbox never exposed a trustworthy checked/selected state. It remains runtime-disabled.
- No filing row, Godel filing reader, EDGAR URL, external link, or download was opened. The audit stopped with the Amazon CF settings panel open, an unapplied 10-Q/10-K/8-K form draft, `Administrative` excluded in the category draft, and the underlying broad table unchanged.
- No CF runtime binding or executable contract was promoted.

## MOST overnight re-audit — 2026-08-04

- Exact ranking, count, minimum-cap, maximum-cap, sector, and table-header controls were visible in the authenticated MOST panel.
- One bounded Gainers activation visibly selected Gainers, but the live overnight table remained empty. Without changed rows or monotonic ranking evidence, ranking was not promoted.
- One sector-popup activation exposed no usable semantic option/state readback. Market-cap was not attempted because no rows existed to prove its units and bounds.
- Real noisy VoiceInk request `uh on the most active stocks window show ten results please` changed the native count from 25 to 10, then correctly failed with `Godel MOST 10 results unavailable` after roughly five seconds because completion requires at least one row. The count was restored to 25 afterward.
- Only the already verified 10/25/50/100 count remains enabled. Ranking, sector, and market-cap remain production-disabled. The live panel was left on Gainers when the timebox ended.
# HDS ownership views

- Natural opener `show me who owns Meta as a bubble view` completed through the VoiceInk delivery path in 767 ms and rendered the exact `META US` Holders bubble visualization with holder/value labels.
- Contextual follow-up `switch the Meta institutional holders to a treemap` completed locally in 172 ms and rendered the mutually exclusive Treemap state.
- Exact native view names are `Table`, `Treemap`, and `Bubble`; the earlier generic `Chart` label was incorrect.
- Restored-layout recovery is now verified: after full Godel reloads, Bubble completed in 211 ms and Table completed in 298 ms. Recovery requires one HDS title and a distinctly nearest matching-security input; ambiguous layouts still fail closed.
# EQS Run and Clear

- `run the equity screener query` completed through the real VoiceInk delivery path in 756 ms. Completion required a panel-scoped render mutation followed by a non-empty table with Ticker, Name, and Last columns.
- After manually adding the exact `Private Company` filter, `clear the equity screener filters` completed in 277 ms. A fresh accessibility read confirmed both the filter label and Remove-filter control were absent.
- One atomic spoken request, `on the equity screener set forward pee between 10 and 20 and run the screen`, completed in 1,793 ms. The live panel showed exact `P/E (Fwd)` bounds 10–20 and a populated result table whose values were within the requested range.
- The reusable portal-menu binding was then proven on a second field: `set market cap above ten billion and run the screen` completed in 1,367 ms and rendered exact `Market Cap (USD)` minimum `10000000000` with current results.
- `on the equity screener set currency to U S D and run it` completed in 1,032 ms. Before selection the adapter proved the native currency option set; completion required an independent `US Dollar` chip, and the refreshed table rendered a Currency column whose rows showed `USD`.
- `set the equity screener sector to technology and run the screener` completed in 2,852 ms. The adapter proved the native 14-sector list, committed the exact searchable option, required an independent `Technology` chip, and the refreshed table rendered a Sector column whose visible rows showed `Technology`.
- All 14 exact numeric range labels now share the strict structured range binding. For list filters, only `Currency=USD` and `Sector=Technology` are executable. Every other list value, both bottom toggles, booleans, and CSV/JSON download remain gated until their own state and artifact proofs are captured.

# SECF People search

- `on the securities finder search Jamie Dimon in people max one hundred` completed through the real VoiceInk delivery path in 768 ms. Completion required the exact query input, native `Max: 100` selected option, the independent People-only `Name / Company / Position / Email / Phone` schema without `Ticker / Venue`, and a result count no greater than 100.
- Noisy speech `security find her look for Morgan Stanley contacts show fifty` compiled locally and completed in 565 ms with exact `morgan stanley`, `Max: 50`, the People result schema, and bounded changed rows.
- The executable contract always requires `venues=[]`, `countries=[]`, and `hide_no_trade=false`; People-specific exclusions are enforced by both workflow and browser validators. Other asset-class tabs and dynamic filters remain fail-closed because Godel does not expose an independently provable selected state for them in the current surface.

# G contextual resolution

- An exact Apple TradingView chart began with interval popup `1 day` and image label `Chart for US:AAPL, 1 day`.
- After focusing that exact chart and entering TradingView's provider interval `60`, the same iframe independently exposed popup `1 hour` and image label `Chart for US:AAPL, 1 hour`.
- Production scope is deliberately only contextual `1h`. The adapter authenticates one iframe whose current popup and image interval agree, uses trusted browser input, and requires both one-hour postconditions. Ambiguous, inaccessible, or duplicate chart frames fail closed.
- Live Godel rejected inline `AAPL US G 1d`; no opening-time interval is appended to the CLI. `1m`, `5m`, `15m`, `30m`, `1d`, range, style, scale, compare, indicator, drawing, layout, snapshot, and alert actions remain disabled.
