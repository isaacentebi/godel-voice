# Standalone nested adapters

These UMD modules are deliberately not loaded by the extension manifest until their live Godel bindings and completion assertions are verified.

## MOST

`most.js` publishes `globalThis.GodelVoiceMOSTAdapter`. Its factory accepts an optional environment:

```js
const adapter = GodelVoiceMOSTAdapter.createMOSTAdapter({
  setControl(panel, key, exactValue) {},
  readControl(panel, key) {},
  readResultMetadata(panel) {
    return {
      ranking: "Gainers",
      limit: 50,
      sector: "Technology",
      minimum_market_cap: "10B",
      maximum_market_cap: null,
      rows: [{ sector: "Technology", market_cap: 2.5e11 }]
    };
  },
  async waitForCompletion(assertion) { return assertion(); }
});
```

`panel` must be the exact MOST window. The adapter supports:

- `ranking.select`: `Active`, `Gainers`, `Losers`, `Value`
- `results.select`: `10`, `25`, `50`, `100`
- `market_cap.set`: optional minimum/maximum in raw, K, M, B or T units
- `sector.select`: `All` or one of the 11 documented sectors

The default DOM binding accepts only unique, exact, panel-scoped controls. Selected state must be explicit (`aria-selected`, `aria-pressed`, `aria-checked`, checked input, or exact `data-state`); CSS classes never count. Completion also requires authoritative result metadata. A click alone, ambiguous control, missing row metadata, or mismatched results fails closed.

For live integration, capture Godel's owned MOST state/callback and supply the three environment readers/writers above. Do not synthesize metadata by copying the requested value. It must come from Godel's resulting state or rendered result rows.

`src/most-followup.mjs` now compiles the full natural-language transaction and `src/most-actions.mjs` enforces the exact enums and structured cap shape. Only `results.select` is promoted to the production workflow; any compound request containing ranking, market-cap, or sector fails closed as a whole. See `docs/most-voice-architecture.md`.

## IMAP, HMAP, News, HALT and CF

`market-news.js` publishes `globalThis.GodelVoiceMarketNewsAdapters`. Create one exact-command adapter with `createAdapter(command, environment)`. The environment must expose Godel-owned `setControl`, `readControl`, `availableOptions`, `readResultMetadata` and `waitForCompletion` bindings; HALT refresh and News article PDF additionally use `refresh` and `downloadArticlePdf`.

Dynamic watchlists, sectors, metrics and filing types are accepted only when returned by `availableOptions`. Persistent News Advanced filters and CF's global Render preference are deliberately blocked. A News PDF is successful only with an opened article plus a non-empty `application/pdf` receipt. See `reports/maps-news-market-data-audit.md` for the activation matrix.

## EQS, SECF, HDS and HLDR

`discovery-holdings.js` publishes `globalThis.GodelVoiceDiscoveryHoldingsAdapters`. These contracts remain disabled. `createHDSViewEnvironment` is the narrow integration seam for the first candidate: it requires an authenticated-session live-proof record, an exact native Table/Treemap/Bubble selector callback, and an authoritative three-way view/visibility reader; it refuses all other HDS actions. The next activation order is HDS Table/Treemap/Bubble, EQS Run, EQS Clear, then the full SECF configuration transaction. HLDR remains open-only. See `docs/discovery-holdings-live-binding-audit.md` for the required postconditions and known blockers.

`createEQSRunClearEnvironment` is the isolated seam for the first EQS controls. It needs exact Run/Clear callbacks and authoritative `filters`, `status`, and changing `run_id` state. It refuses filter actions. `src/eqs-followup.mjs` prepares deterministic structured EQS drafts, but deliberately does not promote them into the executable scalar workflow allowlist.

SECF has the same strict split: `src/secf-followup.mjs` compiles natural language and `src/secf-actions.mjs` validates one complete `search.configure` transaction, while `src/workflow-plan.mjs` refuses execution. The adapter remains the only future live seam and must enumerate dynamic venue/country values, enforce People-tab exclusions, read back every control, and prove the completed row count respects 50/100/250/500. See `docs/secf-voice-architecture.md`.
