# Architecture

Godel Voice is a local voice layer for Godel Terminal. It keeps provider credentials on the Mac and treats model output as a proposal, never as executable browser code.

## Request flow

1. OpenAI Realtime or VoiceInk captures the request.
2. Deterministic parsers handle common commands and follow-ups immediately.
3. A configured language model gets one bounded attempt only when the local parser cannot resolve the intent.
4. The local compiler produces a small, typed workflow.
5. Independent validators reject unknown commands, ambiguous targets, unsafe actions, and unsupported panel controls.
6. The workflow is bound to one background-minted Godel-tab owner and one document generation.
7. Only that exact Arc document may lease, execute, heartbeat, or acknowledge the workflow.
8. The extension operates through Godel's command interface and allow-listed panel adapters, then verifies rendered postconditions.
9. Jarvis speaks only after the exact executor returns a verified completion result.

## Reliability model

Jarvis has one armed Godel owner at a time. Starting it in another Godel tab revokes the old session instead of allowing two tabs to race for a global queue. Context is private to that owner, survives a normal reload, and cannot be used by a stale document generation. A request with no valid owner fails closed rather than waiting for whichever tab becomes focused next.

Every completed voice turn crosses four independent gates:

1. transcription completed;
2. a typed workflow passed local validation;
3. the exact Godel executor verified its visible result;
4. one grounded spoken response was requested.

The lifecycle benchmark reports each stage separately. Simulated provider audio or a simulated Godel executor is labelled as such and is never counted as live end-to-end proof.

## Repository map

- `bin/` — setup, diagnostics, background service, and VoiceInk handoff.
- `catalog/` — command registry, intent schemas, and verified capability contracts.
- `extension/` — Arc extension, Godel bridge, panel adapters, layout, and Realtime client.
- `src/commands/` — command-specific intent parsers, normalizers, and safety rules.
- `src/` — shared compiler, workflow validation, model routing, local service, and speech.
- `tests/` — offline regression and safety suite.
- `evals/` — evaluation datasets and optional benchmark runners.
- `docs/` — focused user, architecture, adapter, and evaluation documentation.

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
