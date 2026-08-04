# SI short-interest voice architecture

SI is a reported-data reader, not a real-time short-position feed. FINRA publishes short-interest data twice monthly. “Latest” means the latest authoritative report shown by Godel; it never means today or right now.

## Display controls (disabled)

- Exact ISO `from` and `to` dates, with `from <= to`.
- Latest Report Date.
- Short Interest.
- Short Ratio / Days to Cover.
- Average Daily Volume.
- Refresh/check for a new report.

These controls remain disabled until exact live bindings prove the chosen range/fields and a refresh proves a changed request or report identity. Relative date phrases clarify rather than guessing boundaries.

## Grounded narration

Narration accepts only exact Godel SI panel facts: report date, short-interest shares, days to cover, average-daily-volume shares, and a confirmed latest-report identity. Values must be non-negative and structurally valid. Missing, stale/unconfirmed, corrupt, or model-supplied facts produce no narration.

Noisy “short in-ter-est”, “day two cover”, and corrections are normalized. Contradictions and unsupported real-time language block the full compound request.
