# Godel Voice capability audit and roadmap

Captured 2026-08-03 from Godel's official documentation, the live terminal catalogue, and the current Godel Voice implementation.

## Executive conclusion

Godel Voice should not become a bag of spoken shortcuts. Its strongest form is a native Godel workflow composer:

> Natural request → one or more verified Godel commands → exact nested settings → a finished research workspace.

The current compact model context already covers all 59 canonical commands in roughly 5,700 prompt tokens. The next major limitation is execution, not model knowledge: a plan can currently contain only one command, and only GF, HMS, and GR have partial nested automation.

The highest-value work, in order, is:

1. Multi-command workflows with step-by-step execution and visible status.
2. Finish and harden GF, HMS, and GR comparison adapters.
3. Natural-language News filters.
4. Natural-language Equity Screener construction.
5. Watchlist creation followed by HMAP/N/QM workflows.
6. Options-chain configuration and Black-Scholes workspaces.
7. Linked single-company research workspaces.
8. Search, filings, transcripts, holders, exports, alerts, and notes.

## What is already native in Godel

Godel's public command reference documents 47 commands. Twelve additional commands are visible in the live terminal but do not currently have full public pages: Q, MOSO, HLDR, NI, RES, GF, PAT, PRT, MAP, CITADEL, KELLY, and ERR. Live-only commands should remain capability-gated and conservative.

Important native primitives:

- A CLI opens a command window.
- Many windows expose rich state after opening: filters, tabs, dates, metrics, modes, layouts, exports, searches, and linked security selection.
- Chart windows can be color-linked so a G, DES, N, and OMON stack follows the same active ticker. [G documentation](https://godelterminal.com/docs/commands/g)
- Watchlists are global and feed QM, N, and HMAP. [QM documentation](https://godelterminal.com/docs/commands/qm)
- News has both per-window filters and persistent global filters. [N documentation](https://godelterminal.com/docs/commands/n)
- The Equity Screener stacks forward/trailing valuation, size, venue, country, sector, and subsector filters. [EQS documentation](https://godelterminal.com/docs/commands/eqs)
- SECF searches instruments and people across asset classes, venues, and countries, then launches security commands from a result. [SECF documentation](https://godelterminal.com/docs/commands/secf)

## Recommended architecture

### 1. Workflow plan v2

Replace the single-command plan with an ordered list of native steps:

```text
workflow
  step 1: open HMAP and select S&P 500
  step 2: open MOST and select Technology gainers, market cap > 10B
  step 3: open HALT and select Active
  step 4: open TOP
```

Each step should report `opened`, `configured`, `skipped`, or `failed`. A failure in one optional panel should not erase the panels already created.

### 2. Command adapters

Continue using command-specific allow-listed adapters that call Godel-owned state transitions where possible. Do not create a generic DOM robot. Every adapter should provide:

- schema of supported actions;
- value validation;
- idempotency;
- data-availability checks;
- completion checks;
- cleanup of dialogs after failure;
- one visible live verification.

### 3. Read-only versus stateful actions

- Read-only configuration can execute immediately: filters, chart ranges, tabs, columns, searches, layouts.
- Explicit user requests may create watchlists, notes, or alerts.
- Delete, send-message, billing, entitlement, brokerage, profile, and subscription actions require confirmation at the action boundary.
- Brokerage must remain read-only; Godel documents BROK as a connection manager, not a trading interface.

### 4. Observability

Add a compact “last voice action” log showing:

- transcription;
- interpreted workflow;
- model/provider and latency;
- command entered;
- every nested step and its result;
- exact Godel rejection, such as “P/E unavailable in GF.”

This removes the ambiguity between transcription errors, model errors, delivery failures, and Godel data limitations.

## Priority 0 — finish the foundation

### Multi-command queue

This is the most important feature. It enables requests like:

- “Open today’s heatmap and Amazon’s earnings matrix.”
- “Build me an Amazon research screen with chart, description, earnings matrix, estimates, news, transcript, holders, short interest, and filings.”
- “Give me the morning market cockpit: heatmap, Reuters Top News, technology gainers, active halts, index futures, and commodities.”

### Stabilize existing comparisons

- GF: companies, Revenue and margin metrics, ranges, estimates, overlay/split, style, axes, scale, transforms, graceful unavailable-metric behavior.
- HMS: multiple securities, timeframe, change-percent/dollar-value mode, normalize/overlay/side-by-side.
- GR: buy/sell legs, period, correlation toggle/window, regression toggle, full/filtered data.

## Priority 1 — highest payoff nested features

### News (`N` and `NI`)

Why: one request can replace a large, stateful filter panel.

Examples:

- “Open Amazon news before January 2024 containing AWS or Bedrock.”
- “Show news for my hyperscalers watchlist, English only, hide class actions, exclude Zacks, include guidance and capex.”
- “Open two news windows: my watchlist with text-to-speech, and broad global discovery without speech.”
- “Pause this feed.”

Important distinction: per-window search/watchlist/date filters are safe and local; advanced source/language/category/include/exclude filters persist globally and should be previewed before saving. Godel supports up to 20 include strings and 20 exclude strings. [N documentation](https://godelterminal.com/docs/commands/n)

### Equity Screener (`EQS`)

Why: it is almost designed for natural language.

Examples:

- “Find US technology companies above $10 billion market cap with forward P/E below 25 and forward revenue above $5 billion.”
- “Screen Japanese primary listings with trailing P/B below 1.5 and no stale/untraded securities.”
- “Show healthcare companies with forward P/S between 2 and 8; export the results.”

Native filters include forward and trailing P/E, P/S, P/B, P/CF, forward EPS, forward revenue, market cap, venue, HQ country, sector, subsector, currency, primary listings, and active-trade status. [EQS documentation](https://godelterminal.com/docs/commands/eqs)

### Watchlists + heatmaps (`QM` → `HMAP` / `N`)

Why: spoken lists and themes are far easier than repeated ticker search.

Examples:

- “Create a Hyperscalers watchlist with Amazon, Microsoft, Meta, Alphabet, Oracle, and Alibaba; open it in the heatmap.”
- “Add Nvidia, Broadcom, AMD, TSMC, ASML, and Micron to Semis; show the table sorted by percent change.”
- “Open news scoped to my Biotech watchlist.”

QM supports batch import, international venue suffixes, up to 400 securities, global watchlist tabs, persistent columns, sorting, and ticker-click behavior. HMAP can map any watchlist, choose size/label metrics, sectors, animation/update interval, colors, Map/Table, and Movers. [QM documentation](https://godelterminal.com/docs/commands/qm), [HMAP documentation](https://godelterminal.com/docs/commands/hmap)

The offline QM compiler now covers exact create/switch/rename/delete/reorder flows, resolved and deduplicated ticker membership, dynamic columns, scaling, and three-state sort. These remain non-executable until persistent account-wide postconditions are live-proven. Group headers and within-tab ticker ordering are not treated as current capabilities.

### Options workspace (`OMON` + `OVME` + `G`)

Examples:

- “Open Nvidia’s option chain, calls only, next monthly expiration, 15 strikes around spot, with IV, delta, gamma, vega and theta.”
- “Open this contract in a chart and Black-Scholes calculator.”
- “Price an Apple 250 call, 45 days out, at 30% volatility and a 4.5% risk-free rate.”

OMON supports Both/Calls/Puts, expiration, months out, strikes around spot, columns, Greeks, and opening a contract in FOCUS/G/OVME. OVME supports spot, strike, time, rate, dividend yield, volatility, theoretical price, implied volatility and Greeks. [OMON documentation](https://godelterminal.com/docs/commands/omon), [OVME documentation](https://godelterminal.com/docs/commands/ovme)

### Linked company research workspace

Example:

- “Build an Amazon research workspace: daily chart, description, earnings matrix, estimates, news, transcripts, holders, short interest and filings; link everything to the same ticker.”

This combines G, DES, EM, ERN, N, TRAN, HDS, SI, and CF. It is much more valuable than automating every control inside each window immediately. Godel's chart documentation explicitly recommends linked G, DES, N and OMON windows. [G documentation](https://godelterminal.com/docs/commands/g)

### Instrument and people finder (`SECF`)

Examples:

- “Find Goldman Sachs corporate bonds trading on TRACE; hide instruments with no trades.”
- “Find Japanese equities, maximum 500 results, primary live listings.”
- “Search Godel’s people directory for analysts named Ben Reitzes.”

SECF supports asset-class tabs, max results, multi-select venues/countries, active-trade filtering, people contact fields, live quotes, and row-to-command actions. [SECF documentation](https://godelterminal.com/docs/commands/secf)

## Priority 2 — strong specialist workflows

### Financials, estimates and exports

- `EM`: choose Sales, EBITDA, Net Income, EPS, balance-sheet or cash-flow metrics; Values/Growth chart; YoY/PoP; native trailing and forward multiple table. [EM documentation](https://godelterminal.com/docs/commands/em)
- `FA`: Income Statement, Balance Sheet, Cash Flow; quarterly/yearly; Excel/JSON export. [FA documentation](https://godelterminal.com/docs/commands/fa)
- `HP`: date range, daily/hourly/minute OHLCV, paging, range statistics, Excel/JSON export; supports equities, FX, bonds, crypto, futures and indices. [HP documentation](https://godelterminal.com/docs/commands/hp)
- `ERN`: consensus range, analyst count, forward P/E, EPS YoY and beat/miss history. [ERN documentation](https://godelterminal.com/docs/commands/ern)
- `DES`: current snapshot with trailing/forward P/E, ownership, dividends, beta and short interest. [DES documentation](https://godelterminal.com/docs/commands/des)

Examples:

- “Open Microsoft’s earnings matrix on EBITDA, growth view, year over year.”
- “Show Amazon’s annual cash-flow statement and export it.”
- “Export one-minute Bitcoin prices from yesterday.”

### Filings, transcripts and ownership

- `CF`: global/security/watchlist filings, filing-type filters, Godel reader or EDGAR.
- `TRAN`: company or global transcript index, historical paging, full speaker turns and Q&A. [TRAN documentation](https://godelterminal.com/docs/commands/tran)
- `HDS`: owner table, original 13F, treemap, export. [HDS documentation](https://godelterminal.com/docs/commands/hds)
- `HLDR`: latest holdings owned by a fund/company; live-only and should be conservative.
- `ANR`: analyst ratings and targets, upgrade/downgrade history, export.
- `SI`: date range, historical short interest, days to cover, volume, refresh. [SI documentation](https://godelterminal.com/docs/commands/si)
- `DVD`: trailing/forward yield, growth, payment frequency, historical yield and dividend dates. [DVD documentation](https://godelterminal.com/docs/commands/dvd)

### Market-discovery cockpit

- `HMAP`: live watchlist/index heatmap.
- `IMAP`: S&P 500/DJIA sector wheel, sector drilldown, sub-industries, movers, table. [IMAP documentation](https://godelterminal.com/docs/commands/imap)
- `MOST`: Active/Gainers/Losers/Value, result count, market-cap range and sector. [MOST documentation](https://godelterminal.com/docs/commands/most)
- `HALT`: All/Active/Resumed, reason codes and refresh. [HALT documentation](https://godelterminal.com/docs/commands/halt)
- `TOP`: Reuters-ranked Top 15 with TTS.
- `TREND`: Godel search activity by 1H/24H/week/month.
- `WEI` / `WEIF`: world indices and index futures.
- `GLCO`: global commodity futures.
- `IPO`: upcoming/recent IPOs, offer details, aftermarket performance, S-1/prospectus and export. [IPO documentation](https://godelterminal.com/docs/commands/ipo)

Example:

- “Morning market cockpit: S&P heatmap, technology gainers above $10B, active halts, Reuters top news, index futures and energy commodities.”

### Relative-value and venue workflows

- `GR`: prices, ratio, rolling correlation and regression with beta, alpha, R², Pearson r, errors and p-value. [GR documentation](https://godelterminal.com/docs/commands/gr)
- `HMS`: multi-security price/change comparison.
- `ALLQ`: share-class/composite/venue tree, active quotes only, bid/ask, row actions. [ALLQ documentation](https://godelterminal.com/docs/commands/allq)
- `TAS`: trade tape, millisecond timestamps, columns, condition and venue codes. [TAS documentation](https://godelterminal.com/docs/commands/tas)
- `FX`: amount conversion and live cross-rate matrix with direct/inverse/USD-cross resolution. [FX documentation](https://godelterminal.com/docs/commands/fx)

## Priority 3 — useful but lower-frequency

- `CALC`: standard and TVM finance calculator; PV, RATE, PMT, FV, NPER, APR/EAR, payments/year, begin/end timing. [CALC documentation](https://godelterminal.com/docs/commands/calc)
- `FOCUS`, `Q`: concise streaming quote views.
- `HCP`: historical percentage changes and OHLCV.
- `MAP`: world exchange opening status; live-only.
- `AUM`: global/personal connected brokerage AUM.
- `WJI`: chat-derived sentiment gauge.
- `MOSO`: most-active options; live-only.
- `RES`: research reports; live-only.
- `NI`: free-text News search; live-only but simple.
- `CHANGE`, `HELP`: navigation/reference only.

## Stateful or consequential features

These are worthwhile, but need explicit-intent and confirmation rules:

- `AL`: create/edit/delete one-shot desktop alerts; price, change or change-percent conditions and sounds. [AL documentation](https://godelterminal.com/docs/commands/al)
- `NOTE`: create, rename, edit and delete persistent rich-text notes; autosave. [NOTE documentation](https://godelterminal.com/docs/commands/note)
- `CHAT`: read/search can be automated; sending, editing, deleting, reacting, DMs and group changes require explicit intent. Godel supports ticker pills, chart embeds, mentions and emotes. [CHAT documentation](https://godelterminal.com/docs/commands/chat)
- `PDF`: persistent themes, fonts, animations, grid/zoom, terminal key, command titles, breaking-news settings, ticker-click behavior and pinned commands. [PDF documentation](https://godelterminal.com/docs/commands/pdf)
- `BROK`: brokerage connection/reconnection/disconnection.
- `ACM`: account/profile/billing/subscription.
- `ENT`: paid entitlements and subscription changes.
- `ERR`: external support submission.

The last four should never run unattended.

## Live-only experiments to defer

- `PAT`: historical pattern matching and forward-return forecast.
- `PRT`: batch/systematic pattern ranking.
- `CITADEL`: vendor-specific overview.
- `KELLY`: Kelly betting simulation.

They may be interesting, but undocumented interfaces are more likely to change. Add them only after the documented workflows are reliable.

## Complete command disposition

| Command | Capability | Recommendation |
|---|---|---|
| Q | Quick quote | Open-only; low priority |
| DES | Company snapshot | P1 linked workspace |
| FA | Statements/export | P2 nested adapter |
| ERN | Estimates/beat-miss | P1 linked workspace; P2 dates |
| EM | Fundamentals/estimates/multiples | P1 linked workspace; P2 nested adapter |
| SI | Short interest | P2 dates/refresh |
| GR | Ratio/correlation/regression | P0 finish adapter |
| ANR | Ratings/targets/export | P2 linked workspace/export |
| DVD | Dividends/yield history | P2 |
| QM | Watchlists/streaming quotes | P1 full adapter |
| FOCUS | Minimal live quote | Open-only |
| TAS | Trade tape | P2 settings |
| HCP | Historical changes/OHLCV | P3 |
| WEI | World indices | P2 cockpit |
| WEIF | Index futures | P2 cockpit |
| IMAP | Sector wheel/drilldown | P2 cockpit |
| HMAP | Index/watchlist heatmap | P1 full adapter |
| GLCO | Commodities | P2 cockpit |
| FX | FX matrix/converter | P2/P3 converter adapter |
| MOST | Activity/gainers/losers/value | P2 cockpit/filter adapter |
| MOSO | Active options | P3, live-only |
| HDS | Institutional holders/treemap | P2 |
| HLDR | Fund/company holdings | P3, live-only |
| N | News and filters | P1 full adapter |
| NI | News text search | Open now; P3 live-only |
| TOP | Reuters Top 15 | P2 cockpit |
| RES | Research reports | P3, live-only |
| TREND | Godel search trends | P3 |
| HALT | Active/resumed halts | P2 cockpit |
| ALLQ | Venue/listing quotes | P2 |
| SECF | Instrument/person finder | P1 full adapter |
| WJI | Chat sentiment | Open-only |
| EQS | Equity screener | P1 full adapter |
| OMON | Option chain/Greeks | P1 full adapter |
| OVME | Black-Scholes calculator | P1/P2 adapter |
| CALC | Scientific/TVM calculator | P3 |
| BROK | Brokerage connections | Defer; confirmation required |
| AUM | Connected brokerage AUM | P3 read-only |
| G | TradingView chart | P1 linking/range/style |
| HMS | Multi-security comparison | P0 finish adapter |
| HP | Historical prices/export | P2 adapter |
| GF | Fundamental comparison | P0 finish adapter; live-only |
| CF | SEC filings | P2 filters/reader |
| IPO | IPO pipeline/performance | P2 export |
| TRAN | Earnings transcripts | P2 navigation/search |
| PAT | Pattern search | Defer; live-only |
| PRT | Systematic patterns | Defer; live-only |
| MAP | Venue-hours map | P3; live-only |
| CITADEL | Citadel overview | Defer; live-only |
| KELLY | Kelly simulation | Defer; live-only |
| HELP | In-terminal help | Open-only |
| CHAT | Rooms/search/messages | P2 read/search; gate writes |
| ACM | Account/billing | Defer; confirmation required |
| PDF | Persistent settings | P3; confirmation for changes |
| AL | Desktop alerts | P2; explicit intent/confirmation |
| NOTE | Persistent notes | P2; explicit intent/confirmation |
| ENT | Paid entitlements | Defer; confirmation required |
| CHANGE | Changelog | Open-only |
| ERR | Bug/support submission | Defer; confirmation required |

## Suggested build sequence

### Milestone A — reliable voice core

1. Workflow plan v2 with multiple commands.
2. Per-step status log and exact error reporting.
3. Modal cleanup and recovery.
4. Finish GF/HMS/GR.
5. Add linked-window colors and optional layout placement.

### Milestone B — research power

1. N filters.
2. EQS screen builder.
3. QM watchlist builder.
4. HMAP configuration.
5. Single-company linked research workspace.

### Milestone C — specialist tools

1. OMON + OVME.
2. SECF.
3. EM/FA/HP configuration and export.
4. CF/TRAN/HDS/SI/DVD.
5. Market cockpit adapters.

### Milestone D — controlled state changes

1. Alerts.
2. Notes.
3. Read-only Chat search.
4. Persistent settings with previews.

Do not prioritize account, billing, entitlements, brokerage connections, support submissions, or undocumented pattern tools until the read-only research workflows are dependable.
