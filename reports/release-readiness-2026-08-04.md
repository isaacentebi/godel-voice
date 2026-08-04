# Godel Voice release-readiness audit — 2026-08-04

## Verdict

**Offline portable artifact: PASS. Live Arc activation: PASS. Git-clone release: PENDING COMMIT.**

The source, generated knowledge, extension, service tooling and package boundary pass the offline release checks. A final Arc run also reloaded the unpacked extension, started a fresh authenticated Godel document, delivered a VoiceInk-equivalent phrase through the real handoff, and verified HMAP changed from DJIA/30 members to S&P 500/503 members. A Git-based release is not complete until the current modified and new project files are intentionally committed; most of this implementation is currently a working-tree change. Live Godel behavior still depends on the external site and account entitlements.

## Results

| Check | Result | Evidence |
|---|---|---|
| Secret-content scan | PASS | The final package candidate has zero OpenRouter-shaped keys, generic secret-key literals, bearer-token literals or private-key blocks. The one prior secret-shaped redaction fixture was replaced with an unmistakably synthetic token while preserving the test. |
| Private runtime state | PASS | `.env`, handoff secret, queue, PID, logs and `extension/config.local.js` are ignored and excluded from the package. Only `.env.example` is tracked among those names. |
| Local private permissions | PASS | `.env`, handoff secret, queue, extension-local config and runtime logs are mode 600; the local log directory is mode 700. Setup now enforces private `.env` and extension-config modes, and doctor detects regressions. |
| Runtime-log privacy | PASS | Five local log files / 110 JSONL records parsed with zero forbidden structured fields such as transcript, plan body, compiled marker, terminal command, API key, bearer token or secret. Logs remain local and unpackaged. |
| Downloaded/user artifacts | PASS | No XLS/XLSX, PDF, CSV, MP3, WAV, M4A, WebM or TGZ artifact is included in the package candidate. Download-receipt source/tests are code, not downloaded data. |
| Package boundary | PASS | `npm pack --dry-run --json` succeeds for `godel-voice-spec@0.10.0`. The explicit file allowlist retains source, schemas, docs, tests, evidence reports and public config examples while excluding local extension config and private state. |
| Checkout portability | PASS | Setup, delivery, doctor and service scripts derive the checkout from their own script location; no developer-specific absolute path occurs in packaged source/docs/tests/reports. The macOS service copies a minimal runtime into the user's Application Support folder. |
| LaunchAgent safety | PASS | The plist is generated at install time, XML-escapes paths, contains no API key or handoff secret, is mode 600, and starts the copied runtime with its ignored environment file. Runtime directories are mode 700 and sensitive runtime files/logs are mode 600. |
| Process/port safety | PASS | The service replaces or stops only a process proven to be this checkout/runtime and refuses an unrelated listener on port 17841. Delivery and doctor verify protocol, instance and build identity. |
| Generated artifacts | PASS | Catalogue, intent schema, workflow schema, VoiceInk prompt and build manifest were regenerated. A second build changed none of their hashes. Manifest reports 59 canonical commands, 69 accepted tokens, 47 documented commands and 12 live-undocumented commands. |
| Version/build identity | PASS | `package.json` and the extension manifest both report version 0.10.0. Handoff protocol is version 4; runtime build identity is content-derived and doctor confirms the running service matches this checkout. |
| Automated verification | PASS | `npm run build`, all 771 tests and `npm run doctor` pass. Doctor reports zero warnings. |
| Git distribution | PENDING | The working tree contains many intentional modified/new project files. They must be reviewed and committed before another person's `git clone` can reproduce this build. No commit or push was performed by this audit. |
| Live browser verification | PASS | Workflow `6ba44cbc2d2b142eadcdecb996d65332` was leased by the visible Arc tab and completed in 983 ms. Godel visibly changed HMAP from DJIA/30 members to S&P 500/503 members. |

## Packaging detail

The package allowlist intentionally includes:

- `README.md`, `.env.example` and `package.json`;
- executable setup, doctor, service and VoiceInk handoff scripts;
- command data, schemas, compact catalogue and generated prompt;
- public extension source plus `config.local.example.js`;
- implementation source, tests, documentation and reproducibility reports.

It intentionally excludes:

- `.env` and every non-example environment file;
- `.godel-voice-secret`, queue and PID state;
- `extension/config.local.js`;
- runtime logs, coverage, dependencies, archive files and downloaded artifacts.

The local checkout still contains ignored private runtime files because this machine is configured and running. They were not deleted, are permission-restricted, are not tracked and are not part of the package candidate.

## Exact external prerequisites

### Required for command execution

1. Node.js 22 or newer.
2. An authenticated Godel Terminal account open in a visible, active Arc tab at `app.godelterminal.com`.
3. An OpenRouter API key stored only in ignored `.env`. The default route uses Cerebras `openai/gpt-oss-120b`; transport/schema-plan failures may fall back to the same model on Groq.
4. Run `npm install`, `npm run setup`, then `npm run doctor` from the cloned/expanded project.
5. In Arc, load `extension/` as an unpacked extension. After every extension update, reload **Godel Voice Executor** and then refresh the authenticated Godel tab. This is also the recovery for “Extension context invalidated.”
6. In VoiceInk, create **Godel Voice** with website trigger `app.godelterminal.com`, Parakeet V2 real-time transcription, AI Enhancement off, output set to Custom Command, and the absolute path to `bin/voiceink-deliver`. Set the shortcut to **Control–Option–G**.

### Optional premium Jarvis voice

Browser speech works without an ElevenLabs account. Premium voice additionally requires both `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` in ignored `.env`, with `GODEL_VOICE_TTS_PROVIDER=elevenlabs`. Restart the service after changing `.env`. Missing premium credentials must never block Godel execution; the browser voice remains the fallback.

## Recommended final smoke test

After the Arc reload, keep the Godel tab visible and active; do not click the command box. Press Control–Option–G and say:

> “Open the S and P 500 heatmap in table view on the left, and Amazon's EBITDA earnings matrix on the right.”

Then say:

> “Make the current window bigger.”

Finally, explicitly close one informational panel. Confirm the panels open separately, the nested controls apply, the native layout changes, one completion acknowledgement is spoken, and no other application receives text.
