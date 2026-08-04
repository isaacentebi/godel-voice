# Nested capability inventory audit

This audit covers five high-value families: maps/heatmaps, screeners, holdings/filings, exports/downloads, and workspace/layout controls. The machine-readable inventory is `data/nested-capability-inventory-v2.json`.

The inventory is deliberately descriptive. It does not register adapters or make documented controls executable. Each nested action is assigned one of these states:

- `source-verified`: implemented in this repository with an explicit state assertion; deployment still needs normal runtime verification.
- `candidate-disabled`: a fail-closed adapter exists, but its action remains unallowlisted until exact live verification.
- `documented-unbound`: official documentation establishes the feature, not its safe runtime binding.
- `live-observed-unbound`: the authenticated UI establishes that a control exists, but not its full semantics.
- `open-only` or `unsupported`: no nested execution is claimed.

## Material inventory expansion

### Maps and heatmaps

`IMAP` is decomposed into index, view, movers, sector, sub-industry, and member-sort actions. Index and Map/Table are live-verified. Sector drilldown is observed but unbound because the authenticated UI exposes unlabeled sector graphics and one combined summary node rather than a unique exact-text control. Table sorting now has a fail-closed candidate: it requires one exact live table/header, a semantic arrow or `aria-sort` direction, at least two parseable rows, and monotonic rendered values. It is not voice-allowlisted until one live sort completes.

`HMAP` records universe, size, label, sectors, animation, update rate, color mode, Map/Table, Movers, and ticker quick-actions independently. Only Map/Table has source and live evidence. Dynamic metric and watchlist values must come from the live menu rather than the language model.

`MAP` remains open-only. World-venue drilldown is not promoted from a live-only command description.

### Screeners and discovery

`EQS` preserves each valuation/fundamental range field and separates list filters, currency, primary listings, stale/no-trade exclusion, Run, and Clear. This supports natural requests involving several filters without collapsing them into an opaque string.

`SECF` is decomposed into query, asset class, result limit, venues, countries, no-trade filtering, and exact result quick-actions. Venue/country values are dynamic live enums.

`MOST` covers ranking, result count, market-cap bounds, and sector, making spoken discovery requests such as “top fifty technology gainers above ten billion” structurally representable.

### Holdings and filings

`HDS` records Table/Chart, exact holder selection, and original 13F navigation separately. `CF` records security/watchlist/global scope, filing types, and Godel-versus-EDGAR rendering. External destinations require explicit intent and identity verification.

`HLDR` remains open-only. There is no grounded evidence for portfolio-weight ranking, report date, transaction date, sorting, paging, or export filters, even though those would be valuable.

### Exports

The audit distinguishes documented formats from executable download verification. FA, HP, EQS, IPO, News article PDF, and chart snapshot formats are documented, but command-specific activation and artifact verification remain unbound. ANR and HDS formats remain unresolved. GF exposes an observed chooser, but the produced artifact is not verified. Export-looking header icons in HMAP, HALT, WJI, and CHAT remain unsupported.

### Layout and workspace

The inventory captures all implemented presets, nine placement zones, larger/smaller resize, maximize, restore, focus, targeted safe close, fresh-screen create/reuse, screen focus/rename, and native screen/full-layout export callbacks. It also records two real boundaries: closing an entire screen and moving an existing window between screens are not verified.

## Missing command families

1. A generic sortable/filterable table adapter. Table schemas and completion signals differ too much to generalize safely.
2. Dynamic popover discovery. Watchlists, map metrics, venues, countries, sectors, and subsectors need exact live vocabulary capture.
3. Verified download runtime. A browser download listener, artifact checks, extension/MIME validation, and overwrite protection must be wired per command.
4. Rich latest-holdings analysis. HLDR has no grounded nested controls.
5. Cross-screen window transfer and native screen close.
6. Manual heatmap color-scale parameters and bounds.
7. World-venue map drilldown.

## Tests added

`tests/nested-capability-inventory.test.mjs` checks family coverage, canonical command joins, action/state/evidence completeness, the no-documentation-only-promotion rule, IMAP exact-live gating, export blocking, exact workspace enums, natural-language examples, and explicit missing-family coverage.

`tests/imap-adapter.test.mjs` verifies the live IMAP index/view adapter plus the unallowlisted sort candidate: exact panel scope, enums, idempotency, semantic sort direction, monotonic rows, numeric-unit parsing, ambiguity rejection, and panel-only queries.
