# Maps, news and market-data nested-control audit

Official documentation was re-audited on 2026-08-03 for IMAP, HMAP, MOST, N, HALT and CF.

| Command | Grounded nested surface | Implementation state | Deliberate blockers |
|---|---|---|---|
| IMAP | S&P 500/DJIA, Map/Table, sector drill/back, sortable member table | Index and Map/Table are live-verified. Table sort has a fail-closed candidate adapter but is not voice-allowlisted. | Sector slices currently expose unlabeled graphics plus a combined summary, so drilldown lacks an exact hit target; no documented export; Top Gainers/Losers are result panels, not a selector |
| HMAP | Index/watchlist universe, Size By, Label, sectors, animation/update, automatic/manual color, Map/Table, sortable table | Existing Map/Table is live-enabled; remaining controls modeled in standalone adapter | Watchlists/metrics must come from live menus; manual color parameters and export semantics unverified |
| MOST | Active/Gainers/Losers/Value, 10/25/50/100, min/max cap, 11 sectors | Standalone adapter with row-metadata assertions | Parent must capture live callback/state before enabling |
| N | Per-window query, watchlist, All/Before date, clear, pause, sortable feed; PDF export for an opened article | Standalone typed adapter with verified-download receipt contract | Advanced sources/categories/languages/text/class-action filters are global account settings and remain manual; PDF needs live download-event verification and overwrite protection |
| HALT | All/Active/Resumed, refresh, authoritative total/active/update metadata | Tabs already live-enabled; standalone refresh contract requires changed timestamp or native request completion | No documented export; row click follows a user-configurable default command and is not safe without resolving that destination |
| CF | Global/company/watchlist scope, filing-type live menu, Select All, Apply | Standalone typed adapter; live binding pending | “Render Filings in Godel” is global; no direct download/export documented |

## Follow-up contract

All modeled actions are addressable against an exact focused or command/security panel. Dynamic watchlists, sectors, metrics and filing types must be read from that panel’s live control; a model-supplied value not present there is rejected. A control selection is never completion by itself: adapters require result metadata such as member count, table headers/sort, filtered filing types, news result count, halt counters, or a non-empty PDF receipt.

## Activation blockers

1. For IMAP sector drilldown, capture a Godel-owned callback or a uniquely sector-labelled hit target. For the other exact panels, capture their owned callbacks/state and wire them into their adapter environments.
2. Live-test every action family in Arc, including idempotence and stale/ambiguous panels.
3. For News PDF, observe a browser download event and verify filename, `application/pdf`, non-zero bytes and overwrite protection.
4. Keep News Advanced filters and CF Render preference out of unattended voice until the user explicitly opts into persistent account changes.
5. HMAP manual color parameters and header export icon remain unsupported because the official page does not define their value/output contract.

## Documentation edge cases captured

- IMAP is index-only: spoken company names must not be rendered as an IMAP CLI prefix. Index and Map/Table switching are verified live. Sector drilldown re-scopes both Top Gainers and Top Losers, but the authenticated accessibility surface currently exposes unlabeled graphics and one combined sector-summary node, so guessing coordinates is forbidden. Table sorting is the next candidate because the live header exposes an exact arrow state and the complete rows can be checked for monotonic order. The docs do not establish that sub-industries themselves are clickable.
- HMAP supports S&P 500, DJIA and existing QM watchlists. Size and label vocabularies are dynamic, the update interval must stay inside live slider bounds, and Manual color is only a mode until its parameter contract is captured.
- News Clear resets only per-window query/symbol/watchlist/date state. It must not erase global filters. Global Save, Clear Filters and Set to Recommended are persistent account changes and remain manual. PDF exports only the currently opened article—not the feed.
- News supports multiple windows with different local filters and TTS state. Free/anonymous tiers have instance limits, so a multi-window workflow must surface a capacity failure rather than silently reuse the wrong window.
- HALT covers U.S. markets only and is singleton. Active and Resumed completion must be checked against rendered row statuses; counts alone are insufficient.
- CF filing types are a dynamic live list (including NT forms), while Render Filings in Godel is a global preference. EDGAR navigation is not a download and requires explicit external-navigation intent.
