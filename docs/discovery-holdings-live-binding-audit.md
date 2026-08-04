# Discovery and holdings live-binding audit

This audit covers only the standalone `EQS`, `SECF`, `HDS`, and `HLDR` adapter. It does not claim that any nested action is live. The adapter contracts remain disabled until the exact Godel control and the resulting owned/rendered state are observed in the live terminal.

## Recommended activation order

### 1. `HDS view.select` — smallest exact primitive

Authenticated live inspection on Godel 4.5.7 found the exact controls `Download Data`, `Table`, `Treemap`, `Bubble`, and `Columns`. There is no generic `Chart` label. Bind only the exact `Table`, `Treemap`, and `Bubble` controls inside a panel whose command identity is exactly `HDS`. A successful transition must prove the selected view and mutually exclusive rendered content:

- `Table`: holder table visible; treemap and bubble graphics hidden.
- `Treemap`: full holder treemap visible; table and bubble graphics hidden.
- `Bubble`: bubble graphics with exact holder/value labels and the security in the center visible; table and treemap hidden.

This is the best first live primitive because it is read-only, reversible, has two finite values, and has an unambiguous visual postcondition. Do not activate row navigation or filing navigation at the same time.

The standalone integration seam is `createHDSViewEnvironment`. It intentionally accepts only two host callbacks:

- `selectExactView(panel, "Table" | "Treemap" | "Bubble")`: invoke Godel's exact native view callback/control inside the already-resolved HDS panel.
- `readViewState(panel)`: return Godel-owned/rendered `{ view, table_visible, treemap_visible, bubble_visible }` state.

The host must also pass a non-secret `liveProof` record from an authenticated Godel session: exact command/action, all five observed controls, the four state fields, timestamp, and Godel build. The factory rejects missing proof, contradictory visibility, and every non-view action. `CONTRACTS.HDS.enabled` remains `false`; promotion requires an actual authenticated run through all three modes. `Download Data` remains disabled until its artifact is verified.

Exact host integration still needed: expose the native HDS view selection callback (or a unique exact panel-scoped control activator) and a reader for the selected view plus three-way visibility. No selector string is assumed by the standalone adapter.

### 2. `EQS screen.run`

Bind the unique exact `Run` control inside an exact `EQS` panel. Completion must come from Godel's resulting screen state, not from a successful click. At minimum the result state must say `complete`; a live implementation should additionally capture the current request/run identity if Godel exposes one, so an old completed result cannot satisfy a new run.

Authenticated live inspection expanded the exact `Add filter` menu beyond the earlier documentation-derived contract. Its 20 labels are: `Currency`, `Venue`, `HQ Country`, `Sector`, `Sub-Sector`, `Market Cap (USD)`, `Private Company`, `P/E (Fwd)`, `P/E (TTM)`, `P/S (Fwd)`, `P/S (TTM)`, `P/B (Fwd)`, `P/B (TTM)`, `P/CF (Fwd)`, `P/CF (TTM)`, `EPS (Fwd 12mo)`, `Rev. (TTM, USD)`, `Rev. (Fwd 12mo, USD)`, `Net Inc. (TTM, USD)`, and `Net Inc. (Fwd 12mo, USD)`. The 14 numeric range fields are now enabled through one exact editor binding; the five dynamic-list fields and `Private Company` remain gated.

`src/eqs-followup.mjs` deterministically compiles exact structured drafts for all observed range fields, explicit dynamic list values, `Private Company`, primary listings, no-trade filtering, Run, and Clear. It normalizes noisy finance speech such as “forward pee,” “price to sails,” and `bill`/`million`/`trillion` units. Every draft remains `ready_for_live_executor: false` until its exact browser callback is bound.

The workflow protocol has one rigorously bounded structured-value exception: only EQS `range_filter.add` may carry `{ field, minimum, maximum }`. `field` is canonicalized against the 14 exact observed labels; both bounds must be present as keys, at least one must be a finite number, and minimum cannot exceed maximum. Server, workflow, and browser validators independently enforce the same rule. Other commands remain primitive-only. The deterministic contextual parser emits an atomic range-and-Run plan only when every requested action is in this verified subset and no range is ambiguous.

The narrow Run/Clear host seam is `createEQSRunClearEnvironment`. It requires exact `runScreen(panel)`, `clearScreen(panel)`, and `readScreenState(panel)` callbacks plus authenticated proof for unique Run/Clear controls. State must include `filters`, `status`, and `run_id`; Run succeeds only when `run_id` changes, preventing an old completed result from satisfying a new request. The seam refuses every filter mutation.

### 3. `EQS screen.clear`

Bind the unique exact `Clear` control. Completion is the authoritative active-filter collection becoming empty. This should be activated separately from filter construction. It is safe only when the user explicitly asks to clear/reset the current screener.

### 4. `SECF search.configure` — exact but not small

The current adapter deliberately treats query, asset-class tab, result cap, venues, countries, no-trade filtering, completion, and bounded rows as one transaction. It can be live-bound without inventing values, but it should not be the first binding: all selected venue/country values must come from Godel's live option lists and every resulting field must match.

The voice/schema half of this transaction is now implemented in `src/secf-followup.mjs` and `src/secf-actions.mjs`. It covers all ten tabs, only the exact 50/100/250/500 caps, noisy speech, contradictions, and People-tab exclusions. `src/workflow-plan.mjs` recognizes this structured action but explicitly rejects execution until the live proof below exists. See `docs/secf-voice-architecture.md` for the grammar and activation checklist.

For incremental activation, first refactor the standalone adapter into atomic `query.set`, `tab.select`, `results.select`, and `hide_no_trade.select` actions. That refactor is safe in this adapter, but wiring it before inspecting the live state/callback shape would be premature.

### `HLDR` — no nested primitive yet

Keep `HLDR` open-only. The live command is grounded, but no exact controls for sorting, paging, report date, portfolio weight, transaction date, view selection, or export are documented or verified. The title `HOLDERS` must never be enough to treat an `HLDR` panel as `HDS`; command metadata takes precedence and a mismatch fails closed.

## Actions that remain gated

- `EQS` list filters, currency, private-company, primary-listing-only, and hide-no-trade still need exact live option/state bindings; numeric ranges are verified.
- `EQS` CSV/JSON needs a verified browser download event, non-empty expected extension, and no overwrite.
- `HDS row.select` needs exact selected-index and holder-identity state before and after one move.
- `HDS filing.open` needs one exact selected holder plus a verified `https://sec.gov/Archives/edgar/data/...` destination.
- `HDS export` remains disabled in this adapter because the documentation does not establish the file format. The capability matrix currently labels the export as verified with an unknown format; that claim should not be used to activate the adapter until a real downloaded artifact is inspected.

## Safety corrections made during this audit

- Panel identity no longer falls back to arbitrary descendant text.
- Explicit command metadata now wins over a matching title, preventing `HLDR`/`HDS` confusion.
- An absent EQS numeric bound is no longer treated as numeric zero.
- Original-13F navigation now requires a non-empty exact selected-holder identity.
