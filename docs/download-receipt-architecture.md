# Verified download receipt architecture

Godel Voice distinguishes **opening an export control** from **producing a verified artifact**. The latter is unavailable for every command until that exact command passes a live proof.

## The nine documented surfaces

| Command | Artifact | Expected formats | Activation |
|---|---|---|---|
| FA | financial statement | XLSX, JSON | disabled pending live proof |
| HP | all loaded OHLCV rows | XLSX, JSON | disabled pending live proof |
| EQS | completed screener results | CSV, JSON | disabled pending live proof |
| IPO | full IPO list | XLSX | disabled pending live proof |
| N | current open article | PDF | disabled pending live proof |
| G | chart snapshot | image; exact format unresolved | disabled pending live proof |
| ANR | analyst ratings table | unresolved | disabled pending live proof |
| HDS | holder table | unresolved | disabled pending live proof |
| GF | fundamentals chart/data chooser | unresolved | disabled pending live proof |

`extension/download-receipts.js` is the shared fail-closed gate. The background worker listens for browser downloads, but an unregistered download remains completely unrelated to Jarvis and is never renamed, verified, or claimed.

## Required sequence

1. Resolve one exact live panel and exact export control.
2. Pre-register one expected artifact with the initiating workflow ID, step ID, panel ID, command, format, source tab, and optional data scope.
3. Only after registration succeeds, activate that verified export control.
4. Bind the first new browser download from that exact Godel tab to the receipt. A second pending registration for the same tab is rejected, eliminating ambiguous correlation.
5. Ask the browser to use `conflictAction: "uniquify"`; Jarvis never silently overwrites an existing filename.
6. On completion, query the browser's final download record and require: file exists, extension matches, MIME is allow-listed for that extension, and size is greater than zero.
7. Mark the receipt `verified` or `failed`. Speech may say “downloaded” only for `verified`, and should report the final filename.

Registrations expire after 30 seconds and cannot capture a later unrelated download. Browser failures, missing files, empty files, unknown MIME values, or mismatched extensions all fail closed.

The last 100 receipts are persisted in extension-local storage, including a pending or in-progress receipt. This preserves the workflow/panel binding if Chrome suspends and restarts its background worker between activation and completion. No transcript, API key, or downloaded file contents are stored.

## Per-command activation gate

A surface can be enabled only with a checked-in `live_proof` containing:

- the canonical command;
- the exact observed export-control identity;
- every format actually produced and verified;
- the proof timestamp;
- repeated evidence that the resulting file belongs to the addressed panel and requested data scope.

Documentation alone cannot satisfy this gate. Formats omitted by official documentation remain disabled until observed and verified. Enabling one command does not enable any other command, even if its button looks identical.

## Safest first live target

Test `IPO` first. It is read-only, exports a full list, has one documented format (XLSX), and therefore has the smallest ambiguity surface. The later live test should open a uniquely addressed IPO panel, pre-register XLSX, activate the exact Excel control, confirm overwrite uniquification, and verify a non-empty XLSX with the workbook MIME. Only then should the static IPO gate be promoted.

Do not start with GF, G, ANR, or HDS: their final format or control semantics are unresolved. Do not start with EQS because the exported rows must additionally be proven to correspond to the completed filtered screen.
