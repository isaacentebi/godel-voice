# G chart voice architecture

This module treats chart opening and chart manipulation as two different surfaces.

## What is safe now

One contextual operation is live: changing one exactly targeted, already-open `G` chart to `1h`. The adapter first authenticates one TradingView iframe whose interval popup and chart-image label agree, sends the provider's trusted `60` keyboard interval, and succeeds only when the popup reads `1 hour` and the image label ends in `, 1 hour`.

Inline opening syntax such as `AAPL US G 1d` was rejected in the live terminal, so voice does not append any interval to a `G` CLI command. The other documented interval names remain parser vocabulary but are runtime-disabled until separately proven.

Everything else inside TradingView remains a candidate until its exact live control and completion signal are proven. This includes every other resolution, preset/custom range, chart style, scale, comparison symbols, indicators, drawings-toolbar visibility, layouts, snapshots, and alerts. The compiler never guesses an indicator or saved-layout name: it accepts only an exact item supplied in `live_indicators` or `live_layouts`. A comparison accepts only a pre-resolved security supplied in `resolved_securities`.

## Atomic compounds

A sentence can produce several ordered candidate actions, but no supported fragment is executed alone when another fragment is unbound, blocked, contradictory, or awaiting confirmation. “Open a one-hour chart and add RSI” therefore does not silently open only the one-hour chart. The caller must either execute the whole verified plan or explain the unsupported part.

Explicit contradictions clarify instead of guessing. Spoken corrections after “wait no”, “actually”, “scratch that”, “I mean”, or “rather” use the corrected clause.

## Account and artifact safety

Saving the current layout and creating an alert are account mutations and always require confirmation. Saying “confirm” inside the original request records the words but does not bypass the separate confirmation gate. Snapshots remain unbound until a real non-empty image or provider URL is observed; the parser's `PNG` value is only the intended artifact contract.

## Context contract

`compileGChartVoice(context, utterance)` accepts:

- `opening: true` identifies a new chart request but never enables rejected inline interval syntax.
- `resolved_securities`: exact `{ticker, spoken_name, aliases}` identities.
- `live_indicators`: exact names read from the current TradingView indicator list.
- `live_layouts`: exact names read from the current layout menu.

It returns candidate actions, blockers, confirmation state, optional CLI arguments, and explicit readiness flags. `ready_for_live_executor` is true only for a standalone contextual `1h` action; mixed or unproven requests fail closed atomically.
