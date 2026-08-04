# Architecture-based adapter implementation plan

This plan turns the 59-command capability matrix into a small number of shared adapter families. The goal is not one brittle script per command. It is a fail-closed runtime where each command contributes a declarative contract and uses verified shared primitives.

The first contract batch is machine-readable in `data/adapter-contracts-v1.json`. It covers FA, HP, EQS, IPO, ANR, HDS, HALT, MOST and HMAP. HMAP `view.select` is now executable through an exact panel-scoped Map/Table control with rendered-state verification. The other contract actions remain disabled: documentation confirms their controls and values, but their exact live callbacks or unique DOM bindings have not yet been captured. The contracts therefore distinguish what can execute from what is merely documented without pretending unverified clicks work.

## Shared execution tree

```text
spoken request
└─ validated workflow step
   ├─ open/focus allow-listed CLI command
   ├─ resolve exact command window
   ├─ wait for command-specific data-ready state
   ├─ apply ordered actions
   │  ├─ canonicalize and allow-list value
   │  ├─ invoke confirmed native callback, else confirmed unique DOM control
   │  └─ verify the resulting control and data state
   ├─ optional export
   │  ├─ begin browser download listener
   │  ├─ activate exact verified download control
   │  └─ verify filename, extension, MIME and non-zero size
   └─ report opened/configured/downloaded/skipped/failed
```

Every state transition is idempotent: read current state first, skip when already correct, execute at most once, then verify. A selector that resolves zero or multiple controls fails. No fallback uses blind coordinates or visible-text guessing across the whole page.

## Binding states

- `confirmed-native-callback`: exact Godel-owned module/callback identity, validated payload and completion signal have been live-tested. Preferred.
- `confirmed-unique-dom`: an exact selector scoped to the exact window resolves once, the interaction changes state, and a separate state assertion passes. Acceptable fallback.
- `documented-unbound`: official documentation proves the control/value, but no runtime binding is known. Not executable.
- `live-observed-unbound`: the authenticated UI proves the control exists, but no exact binding is known. Not executable.
- `unverified`: semantics, bounds, format or output are still uncertain. Not executable.

Only the first two states can ever set `enabled=true`.

## Shared primitives

### Window and readiness

- `resolve_exact_panel`: use pre/post window IDs plus `data-cy-command-type`; never use a title-only guess.
- `wait_data_ready`: command-specific loading, error and empty-data handling.
- `verify_control_state`: control value is authoritative for configuration; result metadata or table shape provides a second assertion where useful.

### Controls

- `select_enum`: exact canonical values only.
- `set_range`: optional min/max, unit parsing, ordering and finite bounds.
- `set_iso_date_range`: strict ISO dates and start ≤ end.
- `set_boolean`: on/off normalization.
- `focus_and_type_trusted`: only for a verified editable inside the exact window.

### Export

- `begin_verified_download`: register the browser download event before activating the control; reject absent, empty, unexpected or overwrite-conflicting files.
- Unknown file formats remain blocked. “Export-looking” header icons in HALT and HMAP remain unsupported until a real output is observed.

## Family 1 — table, filter and export

### FA

```text
FA
├─ statement.select: Income Statement | Balance Sheet | Cash Flow
├─ periodicity.select: Quarterly | Yearly
└─ export.download: Excel | JSON
```

High-value voice: “Show Microsoft’s annual cash-flow statement and export it to Excel.”

### HP

```text
HP
├─ date_range.set: YYYY-MM-DD … YYYY-MM-DD
├─ resolution.select: 1D | 1H | 1M
│  └─ 1H/1M require an intraday entitlement
├─ page.navigate: Previous | Next
└─ export.download: Excel | JSON (all loaded rows)
```

High-value voice: “Export one-minute Bitcoin prices from yesterday to Excel.”

### EQS

```text
EQS
├─ range_filter.add
│  ├─ Market Cap
│  ├─ P/E, P/S, P/B, P/CF: Fwd or TTM
│  ├─ EPS (Fwd 12mo)
│  └─ Rev. (Fwd 12mo, USD)
├─ list_filter.add: Venue | HQ Country | Sector | Sub-Sector
├─ currency.select: dynamic values from live control
├─ primary_listings.toggle
├─ hide_no_trades.toggle
├─ screen.run | screen.clear
└─ export.download: CSV | JSON
```

Dynamic venue/country/sector items must come from the live control; the model cannot invent them. High-value voice: “Find US technology companies above $10B with forward P/E below 25, run it, and export CSV.”

### IPO

```text
IPO
├─ page.navigate: Previous | Next
├─ source_document.open: selected S-1/prospectus or announcement
└─ export.download: Excel (full list)
```

External navigation requires explicit intent and destination verification.

### ANR

```text
ANR
└─ export.download: blocked until file format is live-verified
```

### HDS

```text
HDS
├─ view.select: Table | Chart
├─ row.navigate: Previous | Next
├─ filing.open: selected holder's original 13F
└─ export.download: blocked until file format is live-verified
```

## Family 2 — market filters

### HALT

```text
HALT (singleton)
├─ tab.select: All | Active | Resumed
├─ feed.refresh
└─ export.download: unsupported; icon semantics unverified
```

Completion must use the selected tab plus authoritative updated/total/active metadata. An unchanged timestamp after a completed refresh is allowed; an assumed refresh based only on a click is not.

### MOST

```text
MOST
├─ ranking.select: Active | Gainers | Losers | Value
├─ results.select: 10 | 25 | 50 | 100
├─ market_cap.set: optional min/max with raw/K/M/B/T units
└─ sector.select
   └─ All plus the 11 officially documented sectors
```

High-value voice: “Show the top 50 technology gainers above $10B market cap.”

The offline voice/schema layer now represents this as one atomic action list with structured market-cap bounds. `results.select` remains the only production-enabled MOST action. Ranking, market-cap and sector are schema-valid but explicitly disabled until the adapter's exact control and row-metadata assertions are authenticated live; see `docs/most-voice-architecture.md`.

### HMAP

```text
HMAP
├─ universe.select: S&P 500 | DJIA (live: exact label + 500–505/30 count + changed render signature)
├─ watchlist.select: exact existing watchlist (disabled pending independent live proof)
├─ size_by.select: dynamic live enum
├─ label.select: dynamic live enum
├─ sectors.toggle: show | hide
├─ animate.toggle: on | off
├─ update_interval.set: blocked until live bounds are verified
├─ color_mode.select: Automatic | Manual
│  └─ Manual color parameters are not yet contracted
├─ view.select: Map | Table
├─ movers.toggle: open | closed
└─ export.download: unsupported; output semantics unverified
```

The documentation gives absolute percentage change and percentage change only as examples for Size By and Label. They are not treated as exhaustive enums.

## Integration sequence

1. Add a registry loader for the contract file and reject unknown commands, action IDs, operations and values.
2. Add live read-only discovery instrumentation that records candidate native callback identity, exact panel-scoped selector and completion signal without acting.
3. Verify one binding at a time in the authenticated terminal; record deployment/version evidence.
4. Flip only that action to an executable binding kind and add a fixture plus live test.
5. Implement family primitives once, then register command contracts.
6. Add browser-download verification before enabling any export.
7. Convert every live failure into a permanent contract or regression test.

Recommended order: HALT tab/refresh → MOST filters → FA statement/period → HP range/resolution → EQS filters/run → HDS view → IPO paging → verified downloads → HMAP dynamic controls. This yields visible read-only value early while leaving the most dynamic React panel until the primitives are mature.

## Completion gates for this batch

- No action becomes executable from documentation alone.
- Every allowed enum and field is present in official documentation or comes dynamically from the live control.
- Every action has an independent completion assertion.
- Export actions verify the real downloaded artifact.
- Unknown formats, slider bounds and header-icon semantics remain blocked.
- Native callbacks are preferred; unique DOM is a scoped fallback; blind CDP coordinates are forbidden.
