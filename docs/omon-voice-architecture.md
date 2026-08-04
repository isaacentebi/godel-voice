# OMON option-chain voice architecture

OMON is a read-only market-data surface. Voice may configure or navigate the option chain, but this architecture has no order action and rejects buy, sell, submit, cancel, and exercise language.

## Capability boundary

The exact native total strike-depth slider is the only live-bound nested action. It retains the existing authenticated panel, live min/max/step, independent label, and rendered-row postconditions. Every other action is parsed and validated but remains runtime-disabled until a live native binding is proven:

- mode: Both, Calls, or Puts;
- one exact live expiration identity;
- months out;
- documented asymmetric strikes above and below spot;
- show/hide Delta, Gamma, Vega, Theta, Rho, Lambda, and Epsilon;
- a dynamic ordered subset of exact live columns;
- exact selected-contract handoff to FOCUS, G, or OVME.

An expiration is never inferred from “next month.” It must match one identity or alias supplied by the loaded chain's `live_expirations`. Columns likewise come from `live_columns`. A handoff requires `selected_contract` with its native id, expiration, strike, and Call/Put identity; merely saying a strike or expiry cannot synthesize a row.

## Entitlement and atomicity

Configuration requires either an explicitly confirmed option entitlement or an existing authenticated OMON panel. If a request mixes the live strike-depth action with any unbound or blocked action, the strike slider is not moved alone. The whole sentence remains a candidate until every requested action is executable.

“Fifteen strikes” means the verified native total-depth control. “Five above and three below” is the separately documented asymmetric model and remains unbound. “Fifteen around spot” is rejected as ambiguous.

## Remembered state

The compiler accepts `current_state.mode` and `current_state.per_mode`. Calls and Puts keep separate expiration, horizon, strike, Greek, and column settings. Switching modes restores that mode's remembered configuration and changes only fields explicitly requested by the user.

Spoken corrections after “wait no”, “actually”, “scratch that”, “I mean”, or “rather” replace the superseded clause. Uncorrected mode or visibility contradictions ask for clarification.
