# Godel Voice: how to use Jarvis

This guide reflects the runtime shipped in this repository on 2026-08-04. It is written around what you can safely accomplish by voice today, not everything visible in Godel's interface.

## The short version

Keep the authenticated Godel tab visible and active in Arc, press the Godel Voice shortcut, and speak normally. You do **not** need to click Godel's “Type a command…” box. Godel Voice sends each validated command directly to that tab.

Try this first:

> “Open the market heatmap in table view on the left, and Amazon's EBITDA earnings matrix on the right.”

Then say:

> “Make the current window bigger.”

Or:

> “Close the heatmap.”

One request can open several windows. Jarvis submits them separately, in order, instead of pasting one invalid sentence into Godel.

## What the support labels mean

- **Working + configured** — Jarvis opens the panel and can operate the specific controls listed here.
- **Working open** — the command is recognized, validated and submitted through Godel's CLI. Controls inside it still need to be set in Godel, and the live panel remains subject to Godel access, entitlements and deployment changes.
- **Data-dependent** — the action works only if Godel says the company/metric has data. Jarvis does not substitute another metric.
- **Confirmation required** — the panel may change persistent or consequential state. Jarvis must not perform the mutation unattended.
- **Unavailable by voice** — Godel may display the feature, but this version has no verified adapter for it.

Every one of the 59 catalogued commands is recognized, covering 424 documented or observed feature bullets. Every command has its own parser/schema architecture: there are zero generic-catalog-only gaps. That architecture is broader than live execution. A **strict-unbound** action is understood and validated but disabled until its exact UI binding and completion proof pass. A **safety-gated** action changes persistent, external, account, communication, billing or support state and requires confirmation or remains unavailable unattended. In the newer contract registry, current status is 11 live commands, 39 strict-unbound commands and 9 safety-gated commands.

This is the exact enabled nested-control list. It is checked against the runtime contracts by the test suite:

<!-- enabled-controls:start -->
- EQS.range_filter.add
- EQS.list_filter.usd_technology
- EQS.screen.run
- EQS.screen.clear
- HDS.view.select
- MOST.results.select
- HMAP.universe.select
- HMAP.view.select
- EM.metric.select
- EM.valuation.read
- IMAP.map.configure
- N.query.set
- SECF.people_search.configure
- OMON.strike_depth.set
- G.chart.resolution.1h
- HMS.comparison.configure
<!-- enabled-controls:end -->

There are also three legacy runtime adapters not promoted into that newer contract snapshot. GF is authenticated-live for company/metric/range/estimates/periodicity/layout/currency; HALT is authenticated-live for All/Active/Resumed; and GR retains a partial legacy allowlist for legs, period and statistical controls but is marked `existing-runtime-unverified` by its newer strict compiler. The exact registry list above and this legacy distinction are both important: the first must never overclaim, while the second prevents proven working features from disappearing from the user guide.

The machine-readable reconciliation is `data/live-runtime-truth-v1.json`; the companion evidence summary is `reports/live-runtime-truth-audit-2026-08-04.md`. They record every completion postcondition, proof date, present limitation, and whether an explicit real post-code VoiceInk run is retained for that exact action family.

## Best things to try now

### Historical security comparison — Working + configured

> “Compare Amazon, Meta and Microsoft over five years as percentage change.”

The `HMS` adapter can add unique securities, choose 1M/3M/6M/YTD/1Y/5Y/All Time, choose percentage change or dollar value, and choose Normalize, Overlay or Side-by-side. Completion requires the legend, timeframe, metric and layout to agree.

### Fundamentals, ratios and halt tabs — Legacy live/partial

- “Compare Amazon, Meta and Microsoft revenue over five years, including estimates.”
- “Make that fundamentals graph annual, split, and show it in euros.”
- “Compare Apple versus Microsoft with rolling correlation and regression.”
- “Show only active market halts.”

GF can add companies, select supported and data-available metrics, set 1Y/3Y/5Y/10Y/Max, estimates, Quarterly/Annual, Overlay/Split and an offered currency. P/E/P/S/P/B/P/CF are company-dependent; forward P/E must route to EM or ERN, and EBITDA/NOPAT are not GF comparison series. HALT All/Active/Resumed has authenticated row-count proof. GR remains partial: its legacy runtime accepts its established legs, period, correlation/regression and full/filtered-data shapes, but the newer strict compiler does not claim a fresh verified binding.

### Screening and directory search — Working + configured

- “Set forward P E between 10 and 20, currency to U S D, sector to technology, and run it.”
- “Search Jamie Dimon in People, max one hundred.”

EQS supports 14 exact numeric ranges, the exact USD and Technology list values, Run and Clear. SECF supports a People query with a 50, 100, 250 or 500 result cap. Other list values and tabs remain strict-unbound.

### Maps, earnings, options and news — Working + configured

- “Open the market heatmap in table view.”
- “Show the Dow intraday map as a table.”
- “Open Amazon's earnings matrix and select EBITDA.”
- “Open Apple options and show 15 strikes.”
- “Search the Amazon news window for antitrust.”

HMAP controls the exact S&P 500/DJIA universe and Map/Table; it verifies the selected label, authoritative member count, and a changed tile/table signature. IMAP also controls S&P 500/DJIA plus Map/Table. EM selects one of its verified matrix metrics. OMON sets native strike depth in five-strike increments within the live slider bounds. News sets one exact per-window query. Wider controls in those panels remain strict-unbound.

## Chained requests and layouts

Natural multi-step requests work, up to 12 requested windows from the model and 16 validated execution steps after controls are included.

Examples:

- “Put the heatmap on the left and Amazon's earnings matrix on the right.”
- “Open Amazon description, earnings matrix, estimates, news, transcript and filings in a research layout.”
- “Create a new screen with world indices, index futures, commodities and active halts.”
- “Close the Meta earnings matrix, then open Meta's options chain on the right.”
- “Keep my existing windows and add Nvidia news in the bottom right.”

Supported placements are left, right, top, bottom, all four corners, and full screen. Presets are research, market, comparison, options, grid, and focus. The preset arranges windows created by that request; existing windows are preserved. Rearranging every pre-existing window in one instruction is not yet implemented.

When a new screen is requested, Jarvis reuses an empty Voice/Blank screen before creating another and can apply the requested name. Godel's eight-screen limit is respected. Closing an entire screen, duplicating a panel, and moving an existing panel across screens are not voice operations. The safe cross-screen fallback is to create or focus the destination screen and recreate the requested panel there.

## Follow-up commands

Short follow-ups use the current conversation/window context and often bypass the model for speed.

- “Put it on the left.”
- “Move the current window to the top right.”
- “Make it bigger.”
- “Make the chart smaller.”
- “Maximize it.”
- “Restore it.”
- “Focus the earnings matrix.”
- “Bring the heatmap to the front.”
- “Close this window.”
- “Close the Meta earnings matrix.”

`Current`, `this`, and `it` normally mean the last window Jarvis addressed. You can name a supported panel, and for common companies you can target it precisely, as in “close the Meta earnings matrix.”

Close is real and uses Godel's native window action. Jarvis refuses unattended close operations for panels that appear related to chat, notes, accounts, brokerage, orders, trades, messages, or alerts. Closing an entire Godel screen is not implemented. Godel's own undo-close shortcut remains available if you close the wrong informational panel.

## Command families: natural phrases that work

The examples below are intentionally conservative. **Working open** means Jarvis opens the panel; it does not promise to set the rich controls described in Godel's documentation.

### Company, price and fundamentals

| Command | Say something like | Status |
|---|---|---|
| `Q` | “Give me a quick quote for Nvidia.” | Working open |
| `DES` | “Open Amazon's company overview.” | Working open |
| `FOCUS` | “Put Bitcoin in a distraction-free quote window.” | Working open |
| `G` | “Open a one-hour Nvidia chart.” | Working open + verified 1-hour nested interval |
| `GF` | “Compare Amazon, Meta and Microsoft revenue for five years with estimates.” | Working + configured; data-dependent |
| `EM` | “Open Microsoft's earnings matrix.” / “Show Meta P/E multiples.” | Working open + grounded next-four-quarter P/E narration |
| `ERN` | “Show Nvidia earnings estimates.” | Working open |
| `FA` | “Open Microsoft's financial statements.” | Working open |
| `HCP` | “Show Apple's historical percentage changes.” | Working open |
| `HP` | “Open historical prices for euro-dollar.” | Working open |
| `SI` | “Show Tesla short interest.” | Working open |
| `DVD` | “Show Coca-Cola dividends.” | Working open |
| `ANR` | “Show Nvidia analyst ratings.” | Working open |

`EM` contains Godel's native historical and forward multiples table, including P/E, P/B, P/S, P/CF, EV/EBITDA, EV/Sales, EV/CF and EV/FCF. For P/E, Jarvis can read the exact `Next 4Q` value only when Godel renders the full labelled P/E row with genuine `x` values; it rejects percentages, missing horizon labels, and malformed values. These valuation rows are read-only—not selectors—and no data is reconstructed. `ERN` contains separately labelled forward P/E with estimates.

### Comparisons, quotes and market microstructure

| Command | Say something like | Status |
|---|---|---|
| `HMS` | “Compare Amazon, Meta and Microsoft over five years.” | Working + configured, partial |
| `GR` | “Apple versus Microsoft ratio with correlation and regression.” | Working + configured, partial |
| `ALLQ` | “Show every Apple listing and venue quote.” | Working open |
| `TAS` | “Open Nvidia time and sales.” | Working open |
| `FX` | “Open the currency converter and FX matrix.” | Working open |

### News, research, filings and ownership

| Command | Say something like | Status |
|---|---|---|
| `N` | “Open Amazon news.” / “Search the news for Apple trade secrets.” | Working open + verified exact per-window query |
| `NI` | “Search the news for antitrust regulation.” | Working open; free-text CLI query |
| `TOP` | “Open Reuters top news.” | Working open |
| `RES` | “Find research reports on Oracle.” | Working open; live-undocumented panel |
| `CF` | “Show Amazon company filings.” | Working open |
| `TRAN` | “Open Amazon's earnings transcripts.” | Working open |
| `HDS` | “Show Nvidia institutional holders as bubbles.” / “Switch that holders window to a treemap.” | Working open + verified Table/Treemap/Bubble views |
| `HLDR` | “Show Berkshire's latest holdings.” | Working open; live-undocumented panel |

News exact search is voice-controlled in the addressed News window, including noisy “open eye” → `OpenAI` speech. News source/language/category/include/exclude filters, filing-type filters, transcript navigation, holder-row 13F links, and unresolved exports exist in Godel but are not yet operated by voice. HDS Table, Treemap, and Bubble views are voice-controlled.

### Market discovery and macro

| Command | Say something like | Status |
|---|---|---|
| `WEI` | “Open world equity indices.” | Working open |
| `WEIF` | “Open global index futures.” | Working open |
| `IMAP` | “Show me the Dow intraday map as a table.” | Working open + verified S&P 500/DJIA and Map/Table controls |
| `HMAP` | “Switch this heatmap to the Dow Jones.” / “Use the S&P 500 in table view.” | Working + configured; verified S&P 500/DJIA universe and Map/Table controls |
| `GLCO` | “Open global commodities.” | Working open |
| `MOST` | “Open the most active stocks, then show 10 results.” | Working + result count |
| `MOSO` | “Show the most active options.” | Working open; live-undocumented panel |
| `TREND` | “Show what is trending on Godel.” | Working open |
| `HALT` | “Show active market halts.” | Working + configured for All/Active/Resumed |
| `WJI` | “Open the Wojak sentiment index.” | Working open |
| `MAP` | “Show which world exchanges are open.” | Working open; live-undocumented panel |
| `IPO` | “Show upcoming IPOs.” | Working open |

### Search, screening and watchlists

| Command | Say something like | Status |
|---|---|---|
| `SECF` | “On the securities finder search Jamie Dimon in people, max one hundred.” | Working open + exact People query/result-cap configuration |
| `EQS` | “Open the equity screener.” / “Set forward P E between 10 and 20.” / “Set currency to U S D.” / “Set sector to technology and run it.” | Working open + 14 numeric ranges + exact USD/Technology filters + verified Run/Clear |
| `QM` | “Open quote monitor.” | Working open; watchlist changes are stateful |

Godel's securities finder can now run exact People-directory queries with a spoken 50, 100, 250, or 500 result cap. People searches always reject venue, country, and no-trade filters. Other SECF asset tabs and all dynamic filters remain unavailable until their selected state is independently provable. Godel's equity screener can run and clear the query, set any of the 14 exact numeric ranges, select USD currency, and select the Technology sector. Those two list values are deliberately exact: every other currency, sector, venue, country, subsector, boolean, and toggle remains unavailable until its own native option/state proof is captured. Quote Monitor watchlist edits also remain unavailable.

### Options, calculators and systematic tools

| Command | Say something like | Status |
|---|---|---|
| `OMON` | “Open Nvidia's option chain with 15 strikes.” | Working open + verified strike depth |
| `OVME` | “Open the option valuation calculator.” | Working open |
| `CALC` | “Open the finance calculator.” | Working open |
| `KELLY` | “Open the Kelly criterion simulator.” | Working open; live-undocumented panel |
| `PAT` | “Find historical patterns for Nvidia.” | Working open; live-undocumented panel |
| `PRT` | “Open systematic pattern rankings for Apple.” | Working open; live-undocumented panel |

Strike depth is voice-controlled in five-strike increments within Godel's live slider bounds. Calls/puts, expiry, Greeks, Black-Scholes inputs, Kelly inputs, and pattern settings still need to be selected manually. A request such as “Nvidia calls only, next monthly expiry, with delta and gamma” will open `OMON`, but those inner settings are not guaranteed.

### Account, settings and communication

| Command | Say something like | Status |
|---|---|---|
| `AUM` | “Show connected brokerage account value.” | Working open, read-only use only |
| `BROK` | “Open the brokerage connection manager.” | Confirmation required for changes |
| `CHAT` | “Open Godel chat.” | Working open; sending/editing requires confirmation |
| `NOTE` | “Open my notes.” | Working open; edits/deletion are stateful |
| `AL` | “Show my alerts.” | Working open; create/edit/delete requires confirmation |
| `PDF` | “Open Godel settings.” | Working open; changing persistent settings requires explicit intent |
| `ACM` | “Open account management.” | Unavailable unattended for profile/billing actions |
| `ENT` | “Show data entitlements.” | Unavailable unattended for subscribe/unsubscribe |
| `ERR` | “Open the bug report form.” | Unavailable unattended for submission |

Jarvis does not trade, connect or disconnect brokerages, alter billing, change subscriptions, send messages, delete notes, or submit reports unattended.

### Help and Godel-specific pages

| Command | Say something like | Status |
|---|---|---|
| `HELP` | “Open Godel help.” | Working open |
| `CHANGE` | “Show the latest Godel changes.” | Working open |
| `CITADEL` | “Open the Citadel overview.” | Working open; live-undocumented panel |

## Downloads and exports

No voice download is enabled today: this is not yet a fully verified saved-file workflow. The nine modeled surfaces are FA XLSX/JSON, HP XLSX/JSON, EQS CSV/JSON, IPO XLSX, News article PDF, chart image, and unresolved-format ANR, HDS and GF exports. Export-looking controls in other panels are not treated as downloads.

The receipt architecture must register the workflow, step, panel, command, requested format and source tab before activating a control. It then requires a completed non-empty file, matching extension/MIME and a unique filename; it never silently overwrites. Only a verified receipt may announce “downloaded” and name the file. The attempted IPO XLSX live proof failed to establish a trustworthy completed artifact, so IPO remains disabled along with the other eight surfaces.

## VoiceInk and model setup

Use a VoiceInk mode named **Godel Voice** with website trigger `app.godelterminal.com`, Parakeet V2 real-time transcription, AI Enhancement off, output **Custom Command**, the absolute path to `bin/voiceink-deliver`, and shortcut **Control–Option–G**. The local compiler—not VoiceInk—turns the transcript into a validated Godel workflow.

Run `npm install`, `npm run setup`, and `npm run doctor` from a clone of the repository. Copy `.env.example` to the ignored `.env`, add your own OpenRouter key, then restart after changes with `npm run service:restart`. The default route is OpenRouter → Cerebras → `openai/gpt-oss-120b`, pinned to Cerebras with provider fallback disabled. On the current 26-case hard-request benchmark it measured 518 ms p50 / 787 ms p95. The validation-gated fallback uses the same model pinned to Groq only after a transport failure, empty response, or locally rejected schema/plan; Groq measured 1,356 / 2,309 ms but had stronger strict and exact-action scores. Production allows one 1.6-second Cerebras attempt and, only when validation requires it, one 3.2-second Groq attempt within a five-second combined ceiling. These budgets can be changed with the `VOICE_LLM_PRIMARY_*`, `VOICE_LLM_FALLBACK_*`, and `VOICE_LLM_ROUTE_CEILING_MS` settings in `.env`. GLM-4.7 is not in the production route because it was slower, costlier, less accurate, malformed more often, and recovered none of the rejected Cerebras plans.

Load `extension/` as an unpacked Arc/Chromium extension and reload the authenticated Godel tab once. The repository contains no credential: each user supplies private provider credentials in ignored local configuration.

## Jarvis voice responses

ElevenLabs completion speech runs after the Godel workflow acknowledgement, so it does not delay the command. It can say concise confirmations such as “Done. Meta's earnings matrix is ready.” Duplicate acknowledgements do not produce duplicate speech, and failed or cancelled workflows do not announce success.

Jarvis reads a small allowlist of grounded panel facts, not arbitrary screen text. Current examples include an exact labelled ERN forward P/E, the exact EM P/E multiples row, DES trailing/forward multiples, and HALT counters. It speaks a value only when the addressed panel, field label, period, unit and plausible value all verify; percentages cannot masquerade as `x` multiples. A request such as “Meta's latest EPS was…” is not spoken unless an extraction adapter proves that exact value and period.

If ElevenLabs is unavailable, the browser voice is the fallback. Keep the ElevenLabs key and voice ID in the ignored local `.env`; never paste credentials into extension files or commit them.

## Speaking naturally

You do not need ticker-perfect English. Common company names are resolved locally, and unfamiliar names are handed to Godel's own security search. If Godel presents more than one plausible security, Jarvis stops instead of guessing.

Natural forms that are expected:

- Fillers: “Hey, um, pull up Amazon earnings.”
- Corrections: “Amazon—no, sorry, Meta earnings matrix.”
- Chaining: “Heatmap left, active halts right, and Reuters top news underneath.”
- Pronunciation noise: “micro soft,” “meta platforms,” “S and P,” or a ticker spoken as letters.
- Context: “Make that bigger,” “move it right,” or “close the previous chart.”

For a materially ambiguous security or conflicting request, expect one short clarification instead of a risky guess.

## Safety rules you should expect

- Informational windows and read-only layouts can open immediately.
- A close must be explicit and targets one exact informational panel.
- Existing windows remain in place unless you ask for a rearrangement.
- Unknown commands, actions, metrics and values are rejected locally even if a model produces them.
- Ambiguous securities stop for clarification.
- Data unavailable in Godel remains unavailable; Jarvis never fabricates it.
- Messages, alerts, notes, settings, brokerage, account, billing, subscription and support mutations require explicit intent and, where consequential, confirmation.
- Trades and financial transactions are never executed unattended.

## Troubleshooting

### “Godel Voice stopped: Extension context invalidated”

Reload **Godel Voice Executor** on Arc's extensions page, then refresh the Godel tab. This usually happens after an extension update while the old page is still open.

### I spoke, but nothing happened

Make sure the authenticated Godel tab is visible and active. You do not need to click the command box. Then run `npm run doctor` from the project folder to check the local service and configuration.

### The panel opened but its filter did not change

That panel is probably **Working open**, strict-unbound, or safety-gated. The machine-checked registry list near the top is authoritative for newer controls. GF and HALT additionally have authenticated legacy-live proof; GR has a partial legacy runtime path. Other list-valued screener filters, booleans/toggles, wider chart/options/news/filings controls, and downloads remain fail-closed until exact bindings are proven.

### Jarvis chose no company

Godel may have returned multiple matches. Repeat with a ticker, venue, asset class, or fuller company name—for example, “Lantheus Holdings US equity earnings matrix.”

### The requested P/E graph failed

GF ratio series are company- and data-dependent, and its P/E series is not verified as forward. For a single company's current or forward P/E, open `DES`, `ERN`, or `EM`. For multi-company P/E, GF works only when Godel itself exposes P/E for every requested company; it failed live for META and correctly did not substitute another measure.

### “Export this” failed

That is expected: all nine download surfaces are disabled until a command-specific browser receipt proves the resulting artifact. IPO XLSX was attempted and failed this proof, so it was not promoted.

### The screen is crowded

Say “create a new screen with…” or explicitly place panels in zones. Jarvis preserves existing windows by default and will not silently close them to make space.

### Jarvis is silent

The Godel work may still have completed. Check the visible completion message. For ElevenLabs, verify `GODEL_VOICE_TTS_PROVIDER`, `ELEVENLABS_API_KEY`, and `ELEVENLABS_VOICE_ID` in the ignored `.env`. The browser speech fallback is used when premium speech is not queued.

### Something failed halfway through a long request

Required steps stop the workflow safely. Explicitly optional steps can be skipped while completed panels remain open. Normal diagnostics record workflow and step IDs, timing, provider, and failure reason without the raw spoken transcript. If private failure learning is explicitly enabled with `GODEL_VOICE_LEARN_FAILURES=true`, only failed compiler phrases are stored locally in a bounded, redacted, git-ignored file so they can become future zero-model phrases.

## A useful mental model

Think of Jarvis today as three things:

1. A natural-language launcher for all 59 known Godel commands.
2. A reliable multi-window and layout operator.
3. A machine-checked set of 16 current contract controls, plus authenticated legacy GF/HALT and partial legacy GR adapters.

The command catalogue is broad already. The remaining work is to turn each rich Godel panel from **Working open** into **Working + configured**, one verified adapter at a time.
