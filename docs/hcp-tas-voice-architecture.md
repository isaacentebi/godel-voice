# HCP and TAS voice architecture

This slice models two stateful Godel panels without pretending that unverified browser automation is production-ready. Both command families are accepted by the strict planner but deliberately runtime-disabled until their exact controls and postconditions are proven live.

## HCP — historical prices

Supported voice intents are the native presets `1W`, `1M`, `3M`, `6M`, and `1Y`; an explicit custom ISO date range; and `Previous` or `Next` paging. Each visible page is treated as at most 100 rows. Relative phrases such as “recently” are not converted into guessed dates.

HCP may narrate open, high, low, close, and volume only when the caller supplies exact rows captured from the current Godel HCP table. Every row must have a real ISO date, non-negative finite numbers, the exact source label `Godel HCP table`, and internally consistent OHLC values. Missing or invalid rows block narration instead of inviting the model to estimate prices.

Corrections such as “one month—no, sorry, three months” select the corrected range. Contradictory ranges or page directions block the entire configure step. A valid paging request can coexist with a valid range request, but any blocker makes the combined step non-executable.

## TAS — time and sales

TAS columns are dynamic. The model is therefore never given a static list to hallucinate from. Each voice edit requires two authoritative snapshots from the current panel:

- the current ordered visible columns plus current price-flash and millisecond-toggle values;
- the exact live column vocabulary currently offered by Godel.

Voice can show or hide one exact column, move one visible column before or after another visible column, toggle price flashing, and toggle millisecond timestamps. Unrelated columns and toggles are preserved. Unknown, ambiguous, already-visible, already-hidden, or final-column removal requests block execution. Corrections use the final corrected clause; contradictory on/off requests block the whole configure step.

## Live-enablement gate

Before either family can execute, live verification must establish stable targets and postconditions: selected HCP range/page plus exact rendered row changes; and TAS ordered columns plus both toggle states after mutation. Until then these parsers produce inspectable drafts for evaluation, not browser actions.
