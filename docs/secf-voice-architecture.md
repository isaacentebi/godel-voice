# SECF voice architecture

This layer covers the documented Securities Finder configuration without claiming a live browser binding. `src/secf-followup.mjs` converts natural speech into one atomic `search.configure` draft; `src/secf-actions.mjs` validates that draft; `src/workflow-plan.mjs` recognizes the shape and then deliberately refuses to execute it until authenticated live proof exists.

## Supported language contract

- Query: “find Goldman Sachs” or “search for lithium”.
- Exact tabs: All, Equities, Corporate Bonds, Options, Sovereign Bonds, Crypto, Index, Futures, Forex, People.
- Exact result caps: 50, 100, 250, or 500. Other values fail closed rather than being rounded.
- Venues and countries: one or more literal dynamic values. They are never guessed or remapped; the future runtime must resolve each against exactly one live Godel option.
- Trade state: hide/exclude no-trade results, or explicitly show/include them.
- Noisy speech: common forms such as “security find her”, “no trays”, “corporal bonds”, “two fifty”, and spaced “f x” are normalized.
- Contextual changes: a request such as “limit five hundred” preserves omitted query/tab/filter values only when an authoritative current configuration is supplied.

Examples that produce valid but non-executable drafts:

- “Security find her, search gold man, corporate bonds, on TRACE venue, max one hundred, hide no trays.”
- “Find lithium equities, maximum two fifty, countries Australia and Canada, hide no trades.”
- “Find Jamie Dimon in People, maximum fifty.”

## Fail-closed rules

- Two asset-class tabs in one request are contradictory.
- “Hide no trades and show no trades” is contradictory.
- A result cap other than 50, 100, 250, or 500 is malformed.
- People cannot be combined with venue, country, or no-trade filters. This is enforced in both the speech compiler and the standalone discovery/holdings normalizer.
- Unknown fields, duplicate dynamic values, control characters, overlong strings, invented actions, and partial schema objects are rejected.

## Live-binding activation gate

Runtime remains disabled. Activation requires all of the following in one authenticated Godel session:

1. Unique owned controls for query, exact tab, exact result cap, venue multi-select, country multi-select, and no-trade state.
2. Live option enumeration for venues and countries before any selection.
3. A People-tab proof that venue, country, and no-trade controls are unavailable or disabled.
4. An authoritative completed/loading result state and a row count no greater than the selected cap.
5. Read-back of every configured value after the transaction.

Only after those postconditions are captured should `assertSECFActionDisabled` be replaced by an allowlisted executor. Row context actions and person-company handoffs are separate future bindings and are not implied by search configuration.
