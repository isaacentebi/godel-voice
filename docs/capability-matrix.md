# Godel Voice capability and adapter matrix

`data/capability-matrix.json` is the machine-readable execution audit for all 59 canonical commands. It is deliberately normalized against `data/commands.json`: join the two files by `code`. The registry remains authoritative for each command's intent, feature vocabulary, constraints and documentation status; the matrix adds execution syntax, current adapter coverage, window behavior, safety, export/download behavior, evidence and natural voice examples.

## What “supported” means

Three states must not be conflated:

1. **CLI open support** — every allow-listed command can be opened through the terminal.
2. **Nested configuration support** — only GF, HMS and GR currently have partial post-open adapters.
3. **Documented UI capability** — the model may know that a feature exists even though the extension cannot yet operate it.

The matrix's `coverage` field records the second state. A command marked `open-only` is not allowed to receive invented post-open actions. An `unknown` window model means the runtime must compare window identity before and after execution instead of guessing whether Godel created or reused a panel.

## Evidence hierarchy

1. Official Godel command documentation and keyboard-shortcut reference.
2. A control observed in the authenticated terminal and recorded with a capture date.
3. Current extension implementation (`extension/content.js`, `extension/main-world.js`, `extension/background.js`, `extension/core.js`).
4. Live autocomplete for commands with no public documentation page.

Live-only commands remain CLI-open-only until their controls are verified. An icon that looks like Export is not treated as a file download until a real browser download event and output file have been observed.

## Window control

Godel officially documents focus cycling, close, undo-close, move, edge snap, resize and resize-to-edge shortcuts. Godel Voice additionally has a verified native geometry transition: it resolves the exact `[id$="-window"]` root, obtains Godel's position-manager singleton, calls `setWindowPosition`, and verifies the resulting rectangle. This is materially safer than CSS rewriting or blind drag coordinates.

Still unverified are native create/switch/name/close-screen actions, cross-screen window movement, independent z-order control and window duplication. The matrix marks these as unknown rather than silently substituting a different behavior.

## Command-inside-command transitions

The top-level `cross_command_transitions` list captures high-value flows that are easy to miss when auditing only the CLI index:

- DES quick actions to G, N, CHAT, FA, EM and ANR.
- ALLQ row actions to Q, G, DES, FOCUS and OMON.
- OMON contract actions to FOCUS, G and OVME.
- Shared QM watchlists consumed by N and HMAP.
- Chart alerts flowing to AL and chart embeds flowing to CHAT.
- HDS rows opening original 13F filings.
- IPO, CF and TRAN external-document or website transitions.

These transitions are separately labeled as documented, confirmed native, DOM-only, unknown or safety-gated. The existence of a UI link does not imply that Godel Voice may activate it automatically.

## Export and download audit

Verified native outputs are:

| Command | Output | Control and scope | Adapter feasibility |
|---|---|---|---|
| FA | Excel or JSON | Header download after statement and period selection | Stable unique button + browser download event |
| ANR | Format not documented | Download icon for ratings table | Feasible after file-type verification |
| HDS | Format not documented | Download button for holders table | Feasible after file-type verification |
| N | PDF | Current open article only, not the news feed | Stable reader control + download event |
| EQS | CSV or JSON | Export current completed screen | Stable control + download event |
| G | Image snapshot | TradingView camera / snapshot flow | Prefer embedded TradingView API; otherwise verified toolbar flow |
| HP | Excel or JSON | Every loaded row after range/resolution selection | Stable toolbar control + download event |
| IPO | Excel | Full IPO list from bottom-table control | Stable control + download event |

HMAP, HALT, WJI, CHAT and GF expose controls observed as “export” in the live interface, but their output semantics or formats are not sufficiently verified. They remain disabled for voice export until a real output is captured. CF/IPO/TRAN links that open EDGAR, a prospectus, an announcement or a company website are external navigation, not downloads.

Every export adapter should:

1. Configure the panel first and wait for its data-ready signal.
2. Resolve exactly one download control inside the exact command window.
3. Begin a browser download listener before activating the control.
4. Verify filename, non-zero size and expected file type.
5. Report the saved filename without overwriting an existing file silently.

## Portability prerequisites

- Arc or another supported Chromium browser with the unpacked extension enabled for `app.godelterminal.com`.
- The local handoff service and VoiceInk custom-command hook.
- Provider credentials stored in an ignored environment file, never in extension source or version control.
- An authenticated Godel session and any command-specific paid plan/feed entitlement.
- Download permission for export workflows.

The matrix records command-specific prerequisites such as HP intraday entitlement, article-reader state for N PDF, and data availability for company tables.

## Known registry reconciliation gaps

- `NI` is observed in Godel's own changelog expression syntax as `NI [FREE TEXT]`. This should be treated as a suffix query, not a query placed before the command.
- Official SECF documentation verifies both bare `SECF` and `<QUERY> SECF`; the registry's query-before-command rendering is correct for SECF.
- GF is live-only. Its native adapter is real, but export format and metric availability must be confirmed from the live panel per company.

These are recorded as gaps rather than “fixed” in the registry because this audit was intentionally limited to new `data/`, `docs/` and test files.
