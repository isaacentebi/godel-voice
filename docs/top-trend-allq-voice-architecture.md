# TOP, TREND, and ALLQ voice architecture

These contracts expose three useful Godel surfaces without guessing dynamic UI state. They are intentionally runtime-disabled until a live adapter proves each transition from the Godel interface.

## TOP: exact news selection

Voice can open a ranked story in Godel's internal reader: “read the second story” or “open the selected headline.” Rank is resolved against the currently observed TOP list, and selected-story language resolves only against the currently selected row. The action carries the exact live `id`, `rank`, `headline`, `source`, and displayed `time`.

It never fuzzy-matches a remembered headline and never opens an external browser, new tab, publisher site, or Reuters site. Those requests are blocked instead of being silently converted. Spoken confirmation may mention the headline, source, and time only when those fields were observed in the live TOP panel.

## TREND: deterministic controls

Voice recognizes the documented timeframes `1H`, `24H`, `WEEK`, and `MONTH`, plus an explicit refresh. A phrase may combine one timeframe and refresh as one atomic plan. Contradictory timeframes produce no actions. Existing panel state is preserved unless the request explicitly changes it.

The documented 30-second auto-refresh is treated as panel behavior, not fabricated as a voice action. TREND is entitlement-gated; a known missing paid entitlement blocks the request.

## ALLQ: quote identity and handoff

Voice can enable or disable “active quotes only.” It can also hand the exact selected quote row to the documented destinations: quote (`Q`), chart (`G`), description (`DES`), focus (`FOCUS`), and option monitor (`OMON`).

A quote is venue-specific. A handoff requires the selected live row's `id`, normalized `ticker`, and `venue`; `active` is carried as observed state. The system does not substitute the underlying company, infer a share class, or reuse a stale selection. If selection identity is absent or malformed, the entire utterance clarifies with zero partial actions.

## Speech robustness and safety

- Common ASR errors such as “Rooters,” “all coats,” and “trendin” are normalized.
- Corrections after “wait no,” “no sorry,” “actually,” “scratch that,” “I mean,” or “rather” replace the earlier clause.
- Conflicting values clarify; they are not resolved by arbitrary ordering.
- Dynamic rows come only from authoritative live context.
- These actions do not place orders, subscribe to services, or navigate outside Godel.
- `executable_actions` remains empty and `ready_for_live_executor` remains false until live proof exists.

The machine-readable contract is in `data/top-trend-allq-nested.schema.json`; the strict parser is in `src/top-trend-allq-followup.mjs`.
