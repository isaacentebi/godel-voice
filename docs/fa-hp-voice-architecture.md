# FA and HP voice architecture

Both readers are modeled from documented controls and remain disabled until live panel bindings and independent completion signals are proven.

## FA — Financials

- Statements: Income Statement, Balance Sheet, Cash Flow.
- Periodicity: Quarterly or Yearly.
- Export: Excel (`.xlsx`) or JSON, tied to the exact desired statement and periodicity.

Omitted state is inherited only from authoritative panel context. “Export this” therefore works only when statement and periodicity are known. Every download must be registered before the click and verified afterward for extension, MIME, non-zero size, workflow/panel identity, and non-overwriting behavior.

## HP — Historical Prices

- Date range: two valid ISO dates with start not after end.
- Resolution: 1D, 1H, or 1M. The intraday resolutions require an authoritative positive entitlement state.
- Paging: Previous or Next, exactly once.
- Export: Excel or JSON containing all currently loaded rows. The intended loaded-row count is bound into the action and checked through the download-receipt gate.

“Today”, “yesterday”, and “past/last N days” resolve only when context supplies both `current_date` and a valid IANA timezone. “Last week”, “this month”, and weekday-relative requests clarify because their calendar interpretation is not unique. Explicit dates use `YYYY-MM-DD` (or the unambiguous `YYYY/MM/DD` speech equivalent).

Corrections supersede the prior value; unresolved contradictions block the full compound request. No supported clause is executed when another clause fails.
