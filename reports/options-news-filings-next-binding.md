# Options, News and Filings: next safe binding

**OMON strike depth and News exact per-window query are now production-bound and live-verified.**

In the authenticated Godel option-chain panel, the strike-depth control is a native slider. A live Increment changed its numeric value from 10 to 15, changed a separate rendered label from `10 Strikes` to `15 Strikes`, and rerendered the table over a wider strike range. This is substantially safer than inferring success from a click or CSS class.

The isolated candidate remains a strict test seam in `extension/adapters/omon.js`. Production now binds the same capability through `extension/main-world.js#runOMON` and `extension/content.js#executeOMON`. It requires:

- the exact OMON panel root;
- live slider minimum, maximum and step;
- Godel's owned strike-depth setter;
- an authoritative state reader for slider value, label and rendered strike-row count;
- a completion wait that reruns all assertions.

It accepts only `strike depth.set`. It rejects wrong panels, values outside the live min/max/step, expiry/Greek/column guesses, inconsistent labels and option tables that did not rerender. Production reads the live slider bounds. Because Godel's restored DOM includes structural rows in addition to contract rows, the authoritative rerender check is a changed exact option-table signature rather than a guessed row formula.

Authenticated live proof on 2026-08-03:

- AAPL 10 → 15 through the native range event path: completed in 875 ms through the natural VoiceInk delivery path.
- AAPL 15 → 10: completed in 741 ms through the natural VoiceInk delivery path.
- An idempotent 15 request completed in 357 ms in the direct workflow test.
- Accessibility state independently showed `slider Value: 15` with `15 Strikes`, then `slider Value: 10` with `10 Strikes`.

## Why not activate the other candidates first?

| Surface | Current evidence | Decision |
|---|---|---|
| OMON expiration | Dates and arrows are visible | Defer until the native callback and exact selected-expiry state are captured |
| OMON Calls/Puts/Both | Calls and Puts table regions are visible | Current build exposes no unique mode selector |
| OMON Greeks/columns | Documented | No exact live control captured |
| News exact query | Bound and live-verified | Unique `Search exact term` input, local delete affordance, exact News table; 207–208 ms |
| News date/watchlist/pause | Strong typed standalone contract | Still needs exact callbacks and authoritative state |
| News article PDF | Artifact contract exists | Needs opened-article identity plus browser download receipt |
| CF filing types | Strong transaction contract | Needs dynamic live menu, Apply request identity and refreshed result proof |
| CF render in Godel/EDGAR | Documented persistent preference | Keep blocked from unattended voice |

## Activation sequence

1. Capture News date/watchlist/pause only as separate per-window actions with their own rendered state proof.
2. Capture CF filing types only as one atomic select-types → Apply → result-refresh transaction.
