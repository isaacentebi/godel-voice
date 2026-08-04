# FOCUS, alerts, and settings voice architecture

All nested actions here remain runtime-disabled until their native controls and postconditions are proven live.

## FOCUS

Every action binds to one exact resolved security. Voice may turn price flashing on or off and explicitly pop the same security into a native window. A popout is never inferred from “open” or “show.” Quote narration is limited to requested, observed fields from the matching Godel FOCUS panel: last, change, percentage change, bid, ask, volume, and day low/high. Missing or mismatched facts are never filled from memory.

## Alerts (`AL`)

Opening/listing existing alerts and explicitly reading authenticated rows are read-only. Creating, editing, deleting, enabling, or disabling an alert produces a sanitized confirmation proposal only; no mutation enters the unattended action list. Create requires an exact security plus a positive price and `above`, `below`, or `at`. Every other mutation requires one exact selected live alert. Conflicting mutation verbs yield no proposal.

## Preferences (`PDF`)

Godel's `PDF` command is its persistent settings panel—it is not a PDF file operation. File/download phrasing is rejected here.

The key allowlist covers theme, font, table animation, grid snapping and size, terminal zoom, help/popout icons, terminal key, DES default chart, command titles, breaking news, ticker-click behavior, pinned commands, and external-link trust. Boolean changes are explicit. Dynamic values must match exactly one option observed in the live settings control. Relative zoom and vague pinning are rejected.

Every preference change is a persistent, account-scoped confirmation proposal. External-link trust uses a separate explicit trust-change confirmation class. Corrections replace superseded clauses; contradictions and any unresolved value make the compound request atomic and non-executable.
