# Godel Voice Specification

Provider-neutral natural-language compiler foundation for Godel Terminal.

It separates four jobs that should not be conflated:

1. VoiceInk (or another recorder) transcribes speech.
2. An LLM selects a documented Godel intent using the compact catalogue.
3. Local validation rejects invented commands, arguments and nested features.
4. A scoped Arc extension sends browser input directly to the addressed Godel tab and performs allowlisted post-open UI actions.

## Coverage

- 47 commands from Godel's official public command index.
- 12 additional commands observed in the live terminal but not yet fully documented.
- 69 accepted command tokens after documented aliases are included.
- Nested features are represented explicitly. Examples include News source/language/keyword filters, active-versus-resumed halt tabs, option-chain mode and Greeks, chart resolutions, screener fields, market-heatmap controls and earnings-matrix metrics.
- Live-only commands are marked `live-undocumented`; the compiler is forbidden from inventing arguments for them.

Run `npm run build` to regenerate the compact catalogue, source manifest and size report. The current compact catalogue is approximately 3.4K tokens, and the complete system prompt is approximately 4.2K tokens.

## Files

- `data/commands.json`: human-readable source of truth with intents, aliases, constraints and nested features.
- `data/catalog.min.txt`: generated always-loaded context for the model.
- `data/intent.schema.json`: strict provider-facing JSON Schema.
- `data/voiceink-system-prompt.txt`: generated prompt ready for a VoiceInk AI Enhancement profile.
- `data/eval-cases.json`: initial natural-language evaluation set and confusion cases.
- `data/noisy-eval-cases.json`: complete command coverage using fillers, misspellings, phonetic ASR errors and self-corrections.
- `data/sources.md`: coverage audit linking documented commands to Godel's official pages.
- `src/compiler.mjs`: OpenAI-compatible provider client, validator and terminal renderer.
- `src/consume-intent.mjs`: validates JSON already produced by VoiceInk's enhancement model.
- `src/automation-plan.mjs`: converts a validated intent into the `GV1:` browser handoff format.
- `extension/`: unpacked Manifest V3 Arc extension; initially automates HMS, GR and GF.
- `bin/voiceink-deliver`: VoiceInk Custom Command that validates and queues a plan on localhost without controlling the keyboard.
- `src/handoff-server.mjs`: authenticated loopback-only handoff between VoiceInk and the Godel tab.
- `src/prompt.mjs`: grounded command-compiler instructions.
- `tests/registry.test.mjs`: coverage, compactness, alias and rendering tests.

## Intent representation

The compiler distinguishes terminal syntax from UI work. For example:

```json
{
  "kind": "execute",
  "confidence": 0.98,
  "command": "HALT",
  "security": null,
  "arguments": [],
  "post_open_actions": [
    {"feature": "tab", "operation": "select", "value": "Active"}
  ],
  "clarification": null,
  "reason": "User requested currently active U.S. market halts."
}
```

The terminal renderer outputs `HALT`. A later UI executor selects the documented **Active** tab. It does not falsely generate `HALT ACTIVE`, because `Active` is a UI feature rather than a documented CLI argument.

## Provider configuration

The client uses the OpenAI-compatible `/chat/completions` contract. Configure any compatible provider:

```sh
export VOICE_LLM_BASE_URL="https://api.groq.com/openai/v1"
export VOICE_LLM_API_KEY="..."
export VOICE_LLM_MODEL="..."
npm run compile -- "open Amazon's earnings matrix"
```

Other base URLs:

- Cerebras: `https://api.cerebras.ai/v1`
- OpenRouter: `https://openrouter.ai/api/v1`

For OpenRouter, optional attribution headers can be set with `OPENROUTER_SITE_URL` and `OPENROUTER_APP_NAME`.

### OpenRouter provider pinning

Copy `.env.example` to `.env` and supply an OpenRouter API key. The checked-in example selects `openai/gpt-oss-120b`, allows only the `groq` provider, requires support for JSON output, and disables provider fallback. This guarantees that a successful completion was served by Groq rather than silently routed elsewhere. JSON-object mode is used for provider compatibility; the complete local validator still enforces the intent schema before any terminal command can be rendered. Change `OPENROUTER_PROVIDER_ONLY` to `cerebras` to prefer its lower latency instead.

The local `.env` file is intentionally ignored by Git. Never commit API keys.

Strict JSON Schema is the default. If a chosen model/provider only supports JSON-object mode:

```sh
export VOICE_LLM_RESPONSE_FORMAT="json_object"
```

The full schema remains in the cached system prompt in either mode.

## VoiceInk handoff

VoiceInk does not need to host the intent model. Its Godel Mode can use any transcription model and deliver the final transcript to this local compiler through stdin. The compiler intentionally accepts either command-line text or stdin.

Set the Godel Mode output to **Custom Command** and use:

```sh
/Users/isaacentebi/Documents/Codex/2026-08-03/ok/outputs/godel-voice-spec/bin/voiceink-deliver
```

VoiceInk can send either its plain transcription or an enhancement model's final JSON through stdin. Plain speech is compiled through the configured OpenRouter model; precompiled JSON is only validated locally. The result becomes a `GV1:` plan and is queued through an authenticated server bound only to `127.0.0.1`. The server starts on demand.

The visible Godel tab polls for a plan. Its Arc extension verifies the sender URL and uses Chromium's tab-addressed debugging API to deliver input to that tab alone. It does not use AppleScript, macOS Accessibility, global keystrokes, the clipboard, or Computer Use, so input cannot spill into another application.

### One-time local setup

```sh
cd /Users/isaacentebi/Documents/Codex/2026-08-03/ok/outputs/godel-voice-spec
npm run setup
```

Then open Arc's extensions page and reload **Godel Voice Executor** once. Version 0.3 requests the Chromium `debugger` permission because its `Input` domain provides tab-addressed key and mouse events. Arc may display a brief debugging notice while a plan is executing; the extension detaches after every input batch.

Load `extension/` as an unpacked extension in Arc. Its host access is limited to Godel plus the loopback handoff at `127.0.0.1:17841`.

Version 0.1 deliberately automates only:

- HMS: add securities and select comparison settings.
- GR: set buy/sell legs and relationship settings.
- GF: add companies/metrics and select fundamental-chart settings.

If a panel or control cannot be found uniquely, execution stops and shows a visible error rather than clicking by coordinates.

## Safety and unresolved securities

Common, unambiguous company names are resolved through a small deterministic local alias table. For everything else, the intent retains the spoken company name with `needs_resolution: true`. The Arc extension searches that name through Godel's own command-bar security results, requires a unique match, lets Godel fill its canonical identifier/venue/asset-class prefix, validates the filled value, and only then appends and submits the requested command. Multiple matches stop execution instead of choosing silently.

Opening a Godel window is treated differently from consequential activity inside it. Sending chat messages, modifying subscriptions or billing, connecting brokerages, changing profiles, submitting bug reports and mutating alerts require explicit intent and an execution-time confirmation layer.

## Development

```sh
npm run build
npm test
npm run eval:noisy
```

No API key is required for building or testing the registry. A key is only needed to run a live model evaluation.

## Next phase

1. Add a friendly choice prompt for genuinely ambiguous Godel security matches.
2. Run the evaluation set against future candidate models on Cerebras, Groq and OpenRouter.
3. Continue measuring exact-command accuracy, clarification quality and p50/p95 latency.
4. Add panel adapters beyond the initial HMS, GR and GF allowlist.
5. Expand regression fixtures as Godel changes individual widget controls.
