# Chart, graph and options capability audit

This pass covers `G`, `GF`, `HP`, `FA`, and `OMON`/`OPT`. The structured inventory is in `data/chart-options-capability-inventory-v2.json`; the conservative contextual parser is `src/chart-options-followup.mjs`.

The parser is intentionally not wired into the live workflow validator. It separates actions that the existing GF native adapter can perform from documented-but-unbound controls and explicit blockers. This prevents a phrase such as “make it annual and split it” from being reported as complete merely because matching buttons were clicked.

## Grounded capability trees

- `G`: resolution, range, chart style, scale, indicators, and snapshot. All nested controls remain documented/unbound. Indicator names must be discovered from TradingView's live list.
- `GF`: add company, range, consensus estimates, supported metrics, periodicity, Overlay/Split, per-series style/axis/scale/transform, and export chooser. Add-company, range, estimate state, and the allowlisted metric builder have native implementations. Metric availability is company-dependent. Other controls remain live-observed/unbound.
- `HP`: ISO date range, 1D/1H/1M resolution, paging, and Excel/JSON. Intraday resolutions require entitlement; downloads require an artifact gate.
- `FA`: statement, Quarterly/Yearly, and Excel/JSON. These are documented but not live-bound.
- `OMON` / `OPT`: exact native strike depth is live-verified and executable. Both/Calls/Puts, expiration, months out, asymmetric strikes above/below spot, Greek visibility, ordered columns, and selected-contract handoff to FOCUS/G/OVME remain documented/unbound.

## Important blockers

1. GF's P/E series is not verified as forward or trailing. “Forward P/E” is blocked and should route to `EM` or `ERN`.
2. GF metrics can be unavailable for a company; the adapter must verify the resulting series and reject unavailable-data banners.
3. TradingView indicators, option expirations, and option-chain columns are dynamic live vocabularies.
4. “Fifteen strikes around spot” is ambiguous. The user must specify above and below, or Godel's exact control semantics must be captured.
5. FA/HP exports and chart snapshots are documented, but browser download/artifact verification is not wired.
6. GF's native export chooser is observable; its resulting artifact types are not verified.
7. OMON is strictly read-only market-data navigation. Nothing in this family may place an order.

## Contextual examples

- “Make this a one-hour candle chart for six months on log scale.”
- “Add Microsoft and show five years of operating margin with estimates.”
- “Switch these historical prices to one-minute rows and export every loaded row to Excel.”
- “Make this the annual cash-flow statement and export JSON.”
- “Calls, three months out, ten strikes above and five below, with delta, gamma, vega and theta.”
- “Open the selected contract in Black-Scholes.”

The parser returns `ready_for_live_executor=true` only when every generated action is backed by the existing source-verified GF adapter and there are no blockers. It never labels G, HP, FA, or OMON nested actions as live-capable.
