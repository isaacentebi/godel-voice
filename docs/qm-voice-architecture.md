# QM voice architecture

Quote Monitor is persistent account state, not a disposable window configuration. This architecture can represent the complete documented workflow, but no nested QM action is runtime-enabled until Godel's account-owned callbacks and authoritative persisted state are live-proven.

## Strict action tree

### Watchlists

- Create, switch, rename, delete, and reorder exact watchlists.
- Switch is read-only and does not ask for mutation confirmation.
- Create, rename, delete, and reorder require explicit confirmation.
- Reorder is relative and deterministic: move an exact watchlist Before or After another exact watchlist.
- Completion must prove the active identity or exact tab order and then prove that synchronized order from another QM instance/account state reader.

Delete is always called out separately as destructive. A phrase such as “delete Junk watchlist” produces a blocked draft until the user explicitly confirms that exact watchlist identity.

### Securities

- Add, remove, or batch-import into an exact target watchlist.
- Securities use the standard `{spoken_name,ticker,venue,asset_class,needs_resolution}` identity shape.
- Common known companies and explicit known tickers resolve deterministically; duplicates collapse by ticker, venue, and asset class in mention order.
- Unknown company names remain unresolved. The transaction cannot proceed until Godel autocomplete resolves them uniquely.
- Batch import accepts at most 400 input items. A later binding must additionally verify that the final account watchlist does not exceed Godel's 400-security limit and must report accepted, skipped, duplicate, and unresolved counts.
- Every membership mutation requires explicit confirmation and exact before/after membership proof.

### Table configuration

- Visible columns and column order use exact dynamic names returned by the live Columns control.
- Widths are attached to an exact visible column and structurally bounded; the live control must supply its real bounds.
- Scale is represented as a percentage but cannot execute until the exact live control and bounds are observed.
- Sort is three-state: Ascending, Descending, or Off, always attached to an exact column. Completion requires both the persisted sort marker and semantically ordered rendered values.
- Columns, widths, scale, and sort are treated as persistent mutations and require confirmation.

## Unsupported requests

Group headers and arbitrary within-watchlist ticker reordering appeared as user feature requests, not verified current Godel capabilities. The voice parser recognizes these requests so they receive an explicit unsupported result; it does not manufacture actions for them.

## Atomicity and contradictions

A compound request such as “create AI Basket and add Nvidia, Meta, and Microsoft” is one transaction. It must not create an empty watchlist if security resolution or membership mutation cannot finish. Missing confirmation, unresolved securities, create/delete conflicts, add/remove conflicts, contradictory sort directions, duplicate dynamic columns, and malformed values null the entire configure-step draft.

Example understood draft:

> “Quote monitor, create a watchlist called AI Basket and add Nvidia, Meta, and Microsoft; confirm.”

The draft remains disabled despite confirmation. Confirmation satisfies the safety contract; it does not substitute for a verified runtime binding.

## Activation checklist

1. Exact QM panel and account identity.
2. Exact live watchlist names before switch/rename/delete/reorder.
3. Atomic create-and-populate or compensating rollback proven against account state.
4. Godel autocomplete resolution for every unresolved security, including venue suffixes.
5. Before/after membership and count proof, plus batch accepted/skipped/duplicate accounting.
6. Exact live column inventory, widths, scale bounds, and three-state sort controls.
7. Persistence verified after reopening QM, and synchronized watchlist order verified in another open QM instance.
8. Deletion bound to a fresh confirmation for the exact current watchlist identity.

Until all relevant postconditions exist, `src/qm-actions.mjs` validates then `src/workflow-plan.mjs` rejects execution with a schema-valid/not-live-enabled error. `src/qm-followup.mjs` supplies the natural-language draft, and `data/qm-nested.schema.json` is the provider-facing contract.
