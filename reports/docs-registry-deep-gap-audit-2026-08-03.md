# Official docs and registry deep-gap audit

Date: 2026-08-03

This is a fresh read-only audit of the current official Godel command pages, the canonical registry, and adapter contracts. The machine-readable result is `data/docs-registry-gap-inventory-2026-08-03.json`. No runtime implementation was changed.

## Result

Command discovery is complete: **59 canonical commands**, **424 catalogued feature bullets**, **47 commands with official pages**, and **12 live-undocumented commands**. All officially published aliases found in the audit are already represented: GIP/GP, CN/NH, OPT/CALL/PUT, SEARCH/TK, and TR. There are **no newly missing canonical commands or aliases**.

The remaining gap is depth. The inventory records **26 documented-but-unbound action groups** spanning nested filters, multi-step dialogs, handoffs, settings and mutations. It also records **nine download surfaces**: eight official and unbound, plus GF as live-observed but artifact-unverified.

## Most consequential discoveries

- **QM is a workflow, not a simple list.** Batch import has two entry points, exchange suffix resolution, deduplication, a 400-item cap, progress/skipped accounting, and a final delta toast. Sorting is a three-state cycle and watchlist order is account-wide.
- **News has two different state domains.** Search/watchlist/ticker/date/pause are per-window. Source/category/language/include/exclude/class-action filters are account-global, tri-state, and saved explicitly. A safe adapter must never clear or save one domain while intending to change the other.
- **G and OMON have useful direct grammar.** G accepts 1m/5m/15m/30m/1h/1d at launch and aliases GIP/GP. OMON aliases OPT/CALL/PUT, remembers separate layouts by Calls/Puts/Both mode, debounces chain settings, and can hand the exact selected contract to FOCUS, G or OVME.
- **SECF has mode-dependent filters.** The People tab changes the schema and disables venue, country and no-trade controls; generic table automation would be unsafe without tab-aware assertions.
- **Settings and mutations are broader than the current contract vocabulary.** PDF, NOTE, CHAT, BROK and ENT contain multi-step, persistent or consequential actions. Read-only navigation should be separated from confirmed writes.

## Verified versus documentation-only

The machine file deliberately uses separate top-level collections. `verified_runtime_snapshot` contains only enabled adapter-contract actions with implementation evidence. `documented_unbound` contains no enabled claims and no inference from prose to runtime support. Official docs establish that a control exists; they do not establish a unique DOM target, callback identity, postcondition, or deployment success.

At audit time, the verified snapshot contains **eight enabled action bindings across six commands**: EQS range/Run/Clear; HDS view; MOST result count; HMAP view; EM metric; and IMAP map configuration. Every new discovery in this report remains unbound.

## Downloads

Documented surfaces: FA Excel/JSON, HP Excel/JSON, EQS CSV/JSON, IPO Excel, News article PDF, G image snapshot, ANR table download, and HDS holder-table download. ANR and HDS do not name a format. GF has a previously observed chooser but no official page or completed artifact evidence.

None is promoted by this audit. Activation requires a pre-registered browser download, a non-empty artifact, extension/MIME validation, scope/count checks where possible, overwrite protection, and reporting the final filename.

## Recommended next order

1. Bind QM batch import with exact progress and delta assertions.
2. Bind News local filters separately from account-global filter Save/Cancel.
3. Bind G launch resolution and safe read-only chart configuration before alert creation.
4. Bind OMON chain configuration and exact-contract handoff.
5. Bind SECF tab-aware search configuration.
6. Build the shared verified-download primitive, then activate one command at a time.

## Sources

Primary sources were the [official command index](https://godelterminal.com/docs), individual official command pages under `https://godelterminal.com/docs/commands/<code>`, `data/commands.json`, and `data/adapter-contracts-v1.json`. The live-undocumented classification is preserved for Q, MOSO, HLDR, NI, RES, GF, PAT, PRT, MAP, CITADEL, KELLY and ERR; this audit does not invent documentation for them.
