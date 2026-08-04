# ERN earnings-estimates voice architecture

ERN separates **what the panel should display** from **what Jarvis may say aloud**.

## Display intent (disabled)

- Exact ISO date range, start not after end.
- Quarterly or Annual.
- Analyst Count, Low EPS, High EPS, Average EPS, Forward P/E, EPS YoY, Earnings History, Estimate vs Actual, and Beat/Miss Percentage.

These are strict display/table selections. They remain runtime-disabled until exact controls and independent table postconditions are live-proven. Omitted display fields are retained from authoritative panel context. Fiscal phrases such as “last year”, “next quarter”, or “through 2028” clarify because they do not identify unambiguous calendar boundaries.

## Grounded narration (forward P/E only)

The existing ERN reader may narrate forward P/E only from exact labeled facts extracted from the current Godel panel, such as `{period: "FY26", value: "18.4x"}`. Values are validated as plausible displayed multiples. With no fact, Jarvis says nothing and asks for panel data; it never estimates a number.

The other fields are modeled as read requests but have no grounded reader yet. “What is average EPS?” therefore cannot be answered from pretrained knowledge. “Show the average EPS column” remains a disabled display intent.

Noisy “earnins esty mates”, “pee e”, and “e p s” are normalized. Corrections supersede prior choices; direct contradictions and ambiguous periods block the full compound request.
