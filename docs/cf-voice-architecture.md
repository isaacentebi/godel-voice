# CF filings voice architecture

CF is modeled as two read-only actions: configure the filings feed, or open one exact filing row. Both are intentionally runtime-disabled until Godel callbacks and completion state are live-proven.

## Grounded surface

- Scope: Global, one resolved Security, or one exact Watchlist.
- Filing types: `10-K`, `10-Q`, `8-K`, `Proxy`, `13F`, and `S-1`.
- Reader: Godel or EDGAR.
- Exact row opening requires a live `row_id` or SEC accession number plus ticker, form, filed date, and company.
- EDGAR is external navigation and must be explicitly requested.

The parser accepts common transcription noise such as “ten kay”, “ten cue”, “eight kay”, “thirteen eff”, “ess one”, and “proxey”. A correction such as “ten K—no, sorry—ten Q” supersedes the first form. Omitted fields inherit authoritative `current_config`; “open this” inherits only an authoritative `selected_filing`.

## Deliberate exclusions

CF documentation and the current live audit do not establish paging, date filtering, search, or file export/download. These utterances produce blockers. They never become guessed clicks. A compound request is atomic: if any clause is ambiguous or unsupported, no configuration step is emitted.

Changing the reader to EDGAR is not inferred from words like “website” or “source”. It requires the word EDGAR, and opening also requires an exact selected filing identity. Godel remains the default reader.

## Activation checklist

1. Bind Global/Security/Watchlist scope to exact authenticated controls.
2. Read the live filing-type menu, then prove selection and Apply state transitions.
3. Capture stable filing row identity and prove exactly one matching row opens.
4. Prove Godel reader completion separately from EDGAR external navigation.
5. Keep export absent unless documentation and a verified download receipt are added.
