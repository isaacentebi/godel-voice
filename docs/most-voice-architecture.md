# MOST voice architecture

MOST uses a split capability model. The exact 10/25/50/100 result-count selector is already live-verified and remains executable. Ranking, market-cap, and sector requests are compiled and schema-validated, but cannot execute until their native Godel controls and result metadata have authenticated live proof.

## Spoken contract

- Ranking: Active, Gainers, Losers, or Value. “By share volume” maps to Active; “dollar volume” maps to Value.
- Results: exactly 10, 25, 50, or 100. Other counts fail closed and are never rounded.
- Market cap: minimum, maximum, or between bounds with raw/K/M/B/T units. Spoken thousand, million, billion and trillion normalize to K, M, B and T.
- Sector: All, Financial Services, Healthcare, Technology, Industrials, Consumer Cyclical, Basic Materials, Energy, Real Estate, Communication Services, Consumer Defensive, or Utilities.
- Context: a narrow follow-up such as “show fifty results” preserves the authoritative ranking, cap and sector in `desired_config` when `current_config` is supplied.

Noisy speech covers forms including “most actives,” “gay nerds” for gainers, “loozers,” “market cab,” “tech knology,” “bill” for billion, and spoken count phrases. An explicit correction such as “gainers, sorry, losers” selects the corrected value.

## Atomicity and fail-closed behavior

“Show fifty technology gainers above ten billion” produces one ordered draft:

1. `ranking.select = Gainers`
2. `results.select = 50`
3. `market_cap.set = minimum 10B`
4. `sector.select = Technology`

The fast path will not silently execute only the verified result count from this compound request. Because three requested controls remain unbound, it declines the entire transaction.

Conflicting rankings, conflicting sectors, unsupported counts, empty cap ranges, negative/non-finite bounds, unknown units, and inverted minimum/maximum ranges fail closed. The phrase “in the most active stocks window” is treated as panel identity, not as an instruction to reset ranking to Active.

## Live activation gates

Runtime stays disabled for `ranking`, `market_cap`, and `sector`. Each requires:

1. A unique panel-owned native control and exact selected-state readback.
2. A Godel-owned completion state or request identity, not a click or CSS class.
3. Ranking metadata matching Active/Gainers/Losers/Value.
4. Market-cap metadata plus row-level caps proving every row is within the requested bounds.
5. Sector metadata plus row-level sectors proving every non-All row matches the selected exact sector.

The standalone `extension/adapters/most.js` already models these postconditions. It must remain outside production for the three gated controls until the live callback/state seam is captured. The existing native result-count implementation is independent and remains enabled.

## Bounded overnight audit — 2026-08-04

The live MOST panel exposed exact controls for `ACTIVE / GAINERS / LOSERS / VALUE`, result count, `Min Cap`, `Max Cap`, and sector, plus the expected Ticker/Name/Last/Chg %/Chg/Vol/Vol $/M Cap/Time table schema. One bounded Gainers activation produced a visible selected tab, but the overnight feed contained zero data rows before and after the change. A single sector-menu click exposed no independently addressable option/state seam. Market-cap activation was not attempted because its row-bound completion requirement was already impossible.

A real noisy VoiceInk request, “uh on the most active stocks window show ten results please,” changed the native selector from 25 to 10 but correctly failed after about five seconds with `Godel MOST 10 results unavailable` because the table was empty. A second exact request restored the selector to 25; Gainers remained selected when the Arc timebox ended.

Therefore this audit promotes nothing: only `results.select` remains enabled. Ranking, sector, and market-cap stay schema-valid but production-disabled until a live session provides non-empty rows and the exact semantic/table proofs above.
