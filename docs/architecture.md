# Architecture

Godel Voice is a local voice layer for Godel Terminal. It keeps provider credentials on the Mac and treats model output as a proposal, never as executable browser code.

## Request flow

1. OpenAI Realtime or VoiceInk captures the request.
2. Deterministic parsers handle common commands and follow-ups immediately.
3. A configured language model handles requests that need broader intent understanding.
4. The local compiler produces a small, typed workflow.
5. Independent validators reject unknown commands, ambiguous targets, unsafe actions, and unsupported panel controls.
6. The Arc extension executes approved operations through Godel's command interface and allow-listed panel adapters.
7. Jarvis speaks only after Godel returns a verified completion result.

## Repository map

- `bin/` — setup, diagnostics, background service, and VoiceInk handoff.
- `data/` — command catalogue, schemas, capability contracts, and evaluation fixtures.
- `extension/` — Arc extension, Godel bridge, panel adapters, layout, and Realtime client.
- `src/` — parsers, compiler, workflow validation, model routing, service, and speech.
- `tests/` — offline regression and safety suite.
- `evals/` — optional benchmark generators.
- `docs/` — user, architecture, adapter, and evaluation documentation.

## Safety boundary

The extension cannot run arbitrary selectors or JavaScript supplied by a model. Each nested action must have:

- a known command and action name;
- a validated payload;
- one exact target panel;
- a stable Godel-owned control or callback;
- an observable completion condition.

Unsupported actions fail closed. Trading, money movement, account and billing changes, and unattended communication are outside the execution allowlist.

## Local state

Credentials live in the ignored `.env` file. Setup creates an ignored localhost secret and extension configuration. Runtime logs, queues, generated evaluation reports, and learned failure samples are also ignored.
