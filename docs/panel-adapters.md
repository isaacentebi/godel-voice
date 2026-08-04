# Godel panel adapters

Godel Voice has two execution layers:

1. The validated plan opens a documented Godel CLI command.
2. A command-specific adapter applies allow-listed actions inside the opened panel.

The page bridge is intentionally not a general-purpose remote control. A plan can invoke only commands and features allowed by `extension/core.js`, and the page bridge can invoke only action names explicitly implemented by the selected adapter.

## Adapter contract

An internal adapter is registered in `extension/main-world.js`:

```js
registerAdapter("GF", {
  expandRoot(root) {
    return root;
  },
  async run(root, action, payload) {
    if (action === "setRange") {
      // Validate payload, locate Godel's owned callback, invoke it, and return.
      return;
    }
    throw new Error("Unsupported action");
  }
});
```

Each adapter must:

- validate every payload before touching Godel state;
- expose named operations rather than selectors or arbitrary JavaScript;
- require an exact addressed panel;
- use Godel-owned state transitions when available;
- fail visibly when callbacks, controls, or data are ambiguous;
- remain idempotent where practical;
- add unit tests and one live Arc verification for every new action family.

## Adding a command

1. Add its nested features to the command registry and the `FEATURES` allowlist in `extension/core.js`.
2. Add its panel title and action translation in `extension/content.js`.
3. Register the internal adapter in `extension/main-world.js` when Godel callbacks are required. Simple, stable controls may remain in the isolated content layer.
4. Add noisy natural-language cases for the new feature.
5. Verify the generated plan, the newly opened panel, and every resulting state change.

## Current internal adapter

`GF` supports adding US companies; native Revenue, Gross Margin, Operating Margin, Net Margin, R&D as % of Revenue, SG&A as % of Revenue and Return on Equity; data-gated P/E, P/S, P/B and P/CF; 1Y/3Y/5Y/10Y/Max; and consensus estimates. HMS has a verified exact-DOM/trusted-input path for membership, timeframe, percent/dollar mode, and normalize/overlay/side-by-side. The isolated execution layer also has partial GR support.

`HMAP` supports two verified nested actions: selecting the exact `S&P 500`/`DJIA` index universe and switching between `Map`/`Table`. The adapter resolves exactly one visible button inside the exact HMAP window and is idempotent. Universe completion requires the requested selected label, the authoritative member count (`500`–`505` for S&P 500 or exactly `30` for DJIA), and a materially changed tile/table render signature. Table verification requires the member-table headings (`Ticker`, `Last` or `Price`, `Change`, and `Volume`). Map verification requires a large heatmap/treemap visual and the absence of the member table. Watchlist selection, size and label metrics, sector grouping, animation, refresh interval, manual color controls, Movers, tile actions, and the export-looking header control remain disabled until their live callback and completion shapes are captured.

`N` supports one verified per-window action: setting the exact News query. It requires exactly one visible `Search exact term` input inside the addressed News panel, applies the query through the native input/Enter path, and waits for the local delete affordance plus the exact `Headline / Date / Time / Ticker / Source` result table. A rendered zero-result state is valid. It never opens or changes source, category, language, include/exclude, breaking-alert, or other account-global filters.

`LAYOUT` accepts only validated rectangles for an exact Godel window. It invokes Godel's internal position-manager singleton, so moves and resizes flow through Godel's React state and normal persistence. The fallback is never raw CSS.

`LAYOUT` also exposes native focus, maximize, restore and safe close operations. Focus uses Godel's workspace-provider `setActiveWindowId`; maximize/restore uses the position manager's `fullScreen` toggle and verifies its native `previous` geometry; close invokes the exact React callback behind the unique `data-cy-close-window="true"` control. Windows whose command type suggests chat, notes, accounts, brokerage, orders, trades, messages or alerts are rejected by the unattended close adapter.

`WORKSPACE` uses the same Godel provider context for fresh-screen creation and the screen tab component's native `onSelect` and `onEdit` callbacks for focus and rename. Every layout and screen record is shape-checked before mutation, and a changed provider shape fails closed. Native full-screen and full-layout JSON export callbacks are also exposed. The executor does not provide a universal panel download action: the live audit found a verified data-export callback only for Graph Fundamentals, so `export this` opens GF's native export chooser and rejects panels without that exact control.

The control-only GV2 step contract is `{kind:"control", operation, target, value}`. Operations are `move`, `resize`, `maximize`, `restore`, `focus`, `close`, and `export`; targets are the last-created window, the focused window, or the most recently addressed instance of a command. These steps do not need an LLM when the deterministic follow-up parser recognizes the phrase.

The handoff protocol leases each request to a stable per-tab client, checks cancellation between workflow steps, and acknowledges completion, failure or cancellation with duration. Completion emits a portable `godel-voice:completion` event. Optional browser speech is scheduled after acknowledgement and never delays the workflow; set `spokenFeedback: false` in `config.local.js` to mute it.

The `GV2:` protocol executes up to 12 ordered commands with per-step failure behavior and placement hints. The architecture can add chart, news, screener, options and other panel adapters without changing that workflow protocol.

Actions that send messages, create alerts, change accounts, connect brokerages, alter billing, or perform trades are outside the unattended allowlist.

## Complete 59-command capability contract

`data/adapter-contracts-v1.json` now represents every canonical command exactly once. It is a capability specification, not a claim that every documented control is already automated. Each nested action records its value shape, safety boundary, prerequisites, preferred binding, completion assertion, and official or live evidence. The activation gate remains strict: documentation proves that a feature exists, but only a captured callback or unique stable control plus a live completion assertion can make it executable.

The current coverage classes are:

- **Live enabled:** `HMAP.universe.select` and `HMAP.view.select`, each with an exact unique live-tested binding and independent content-based proof of completion.
- **Documented, fail-closed:** read-only filters and configuration trees for `FA`, `ERN`, `EM`, `SI`, `GR`, `ANR`, `QM`, `FOCUS`, `TAS`, `HCP`, `IMAP`, `HMAP`, `FX`, `MOST`, `HDS`, `N`, `NI`, `TOP`, `TREND`, `HALT`, `ALLQ`, `SECF`, `EQS`, `OMON`, `OVME`, `CALC`, `AUM`, `G`, `HMS`, `HP`, `GF`, `CF`, `IPO`, `TRAN`, `PAT`, `PRT`, `KELLY`, `HELP`, `PDF`, and `CHANGE`. Verified actions may be live while the remaining actions in the same contract stay disabled. For IMAP, index and Map/Table are live; table sorting is a tested but unallowlisted candidate and sector drilldown remains unbound.

`CF` remains fully fail-closed after the 2026-08-04 authenticated re-audit. Exact 10-Q/10-K/8-K draft selection was readable, but Apply left unrelated Amazon forms in the rendered table, and the global Godel-reader checkbox exposed no reliable selected state. Neither the feed configuration nor reader preference is executable until both the control transition and refreshed security/form-constrained rows can be proven together.
- **Open-only:** `Q`, `DVD`, `WEI`, `WEIF`, `GLCO`, `MOSO`, `HLDR`, `RES`, `WJI`, `MAP`, and `CITADEL`. Their documented surfaces either contain no nested control or only ambiguous row navigation.
- **Sensitive/manual gated:** `BROK`, `CHAT`, `ACM`, `AL`, `NOTE`, `ENT`, and `ERR`. Brokerage connections, communications, billing/account changes, alert/note mutations, subscriptions, and support submissions are never unattended. `AUM` is separately modeled as sensitive read-only data.

### High-value trees captured for Jarvis

- **Research and valuation:** earnings estimates and matrix modes, financial statement/period selection, dividend and holder views, filings filters, transcripts, analyst ratings, fundamental graphs, and exports where the native format is known.
- **Screening and discovery:** the full equity screener range/list filter grammar, securities finder tabs and dynamic lists, most-active ranking/count/market-cap/sector controls, trend timeframes, IPO paging, and news search/filter grammar.
- **Charts and comparisons:** chart resolution/range/style/scale and snapshot, HMS multi-security membership/timeframe/metric/layout, GR legs/period/correlation/regression, GF companies/metrics/transforms/axes/scales, and market-map view configuration.
- **Options and quantitative tools:** option-chain mode/expiry/strike depth/Greeks/columns and contract handoff, Black–Scholes inputs and solve target, Kelly simulation inputs, calculator expressions, pattern searches, and systematic batch patterns.
- **Live-market workflows:** short-interest ranges, time-and-sales columns, historical ranges and paging, active quote filters, halt tabs/refresh, commodity/index/forex views, and read-only AUM refresh.
- **Workspace and preferences:** quote-monitor watchlist/ticker management, FOCUS pop-out, and terminal preferences are described with persistent-mutation safety. Existing native layout/screen control remains documented earlier in this file because it is workspace infrastructure rather than one of the 59 CLI contracts.

QM now has a strict offline voice/schema architecture for watchlist lifecycle, confirmed ticker membership and 400-item imports, dynamic columns, scale, and three-state sorting. Every nested action remains disabled pending account-state proof; group headers and within-watchlist ticker reorder remain explicitly unsupported because they are feature requests rather than verified capabilities. See `docs/qm-voice-architecture.md`.

Dynamic menus are intentionally not guessed. Currency lists, venues, countries, sectors, watchlists, expirations, columns, news sources/categories/languages, pattern grammar, and export choices must be read from the live control before activation. Downloads additionally require a browser download event, expected file type, non-zero content, and overwrite protection.
