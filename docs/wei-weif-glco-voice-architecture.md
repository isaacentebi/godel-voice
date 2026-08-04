# WEI, WEIF, and GLCO voice architecture

These market-monitor surfaces are dynamic and mostly documented as displays. The voice layer therefore models useful selections and grounded reads, while keeping every nested mutation disabled until Godel's live controls and resulting state can be proven.

## WEI and WEIF

WEI means cash world equity indices; WEIF means equity-index futures. Noisy speech such as “fewchers” remains a WEIF disambiguation signal.

Category/region and venue selection require one exact value from the current live list or an explicit documented list supplied with the panel context. Filter and sort requests are accepted only when the current command documentation supplies that exact control vocabulary; the parser does not infer filters from visible column headings or region group labels. Sort direction must be explicit.

Active/closed state and next-open timing are narration-only facts. They require exact current rows from the addressed Godel panel, a timezone-bearing capture timestamp, and—when closed—an exact timezone-bearing next-open timestamp. Active venues must not carry a fabricated next-open value. Missing or inconsistent facts block speech.

## GLCO

Category selection requires one exact documented/live category. A commodity contract is represented by an exact ID, label, and category from the current live or documented Godel contract list. The list may carry explicit aliases, but the model cannot synthesize mappings.

This is intentionally strict for requested coal futures and FX-like instruments: terms such as NCF, NEWC, ATW, MTF, BZ1, coal, or rupiah produce no selection unless one exact identity is supplied by Godel's current/documented list. Prices and changes are spoken only from exact current `Godel GLCO panel` facts.

Corrections replace the superseded clause. Multiple uncorrected categories, unknown venues, unsupported filters/sorts, or unresolved contracts block the complete configure step. No family is runtime-enabled until live selection and rendered postconditions are verified.
