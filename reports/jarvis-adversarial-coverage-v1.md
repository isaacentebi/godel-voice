# Jarvis adversarial voice coverage v1

This is an expandable, non-frozen evaluation corpus. It makes no model or provider calls and does not alter production behavior.

## Added coverage

- Dense MOST and EQS filter combinations, dynamic-enum ambiguity, news and filing filters.
- Holder changes, latest report date, portfolio weight and transaction-date requests.
- GF, HMS, GR, price charts and historical bars, including multi-company metrics and transcription errors such as “pee”, “e bit duh” and “fill ins”.
- Options-chain filters and ambiguous live expirations.
- Pronoun follow-ups against focused, stale, wrong and ambiguous panel context.
- Exact close targets, replacement flows, move, resize, focus, maximize, restore, export and download requests.
- Long market, research and options workspaces; twelve-step ordering, correction and over-limit behavior.
- Fail-closed cases for trading, message deletion, unverified heatmap downloads and proprietary chart studies.

## Remaining gaps

1. The semantic harness does not prove live DOM/callback behavior, browser download events, file contents or layout geometry. Those need Arc runtime traces.
2. Nested action grading stringifies object values. Structured ranges and multi-select filters therefore need a recursive canonical comparator before strict model benchmarking.
3. Context fixtures do not yet model a full conversation transcript or decaying references across several turns; they test one follow-up at a time.
4. Dynamic values—expirations, countries, venues, sources, watchlists and sectors—cannot be exhaustively enumerated offline. Live control inventories are required.
5. The corpus includes forward-looking actions that remain intentionally disabled in the production allowlist. A semantic model pass is not evidence that an adapter is executable.
6. Speech-to-text acoustic performance still needs recorded audio across microphones, accents, room noise, interruption and partial-utterance streaming. Text corruption is only a proxy.
7. Export tests distinguish supported and unsupported intent, but cannot verify overwrite protection, MIME type, non-zero files, or downloads cancelled by the browser.
8. Multi-screen stress does not measure overlap, minimum usable panel dimensions, locked layouts or persistence after a page reload.
