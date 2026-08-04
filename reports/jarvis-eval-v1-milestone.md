# Jarvis evaluation v1 milestone

Date: 2026-08-03

This is a new stress line. It does not replace, revise, or extend the frozen 36/37 benchmark.

## Coverage added

- 24 version-2 cases with strict ordered-step scoring.
- Mixed command and window-control requests, including close/open/resize/maximize/export ordering.
- Contextual existing-panel follow-ups through a new `configure` step.
- Screen-limit, blank-screen reuse, locked-screen, and insufficient-space runtime expectations.
- Data-unavailable outcomes that explicitly forbid metric substitution.
- Noisy transcription, corrections, phonetic errors, punctuation loss, and spoken ticker letters.
- Long workflows up to the 12-step model boundary.

## Latest pinned live result

Route: `openai/gpt-oss-120b` through OpenRouter pinned to Groq, fallbacks disabled, structured output, concurrency 1, completion budget 1,800 tokens.

- 5 cases × 2 repeats = 10 attempts.
- Semantic exact pass: 10/10 (100%).
- Availability: 10/10.
- Clarification: 2/2.
- Configure follow-up: 2/2.
- Exact nested actions: 8/8.
- Exact ordered steps: 8/8.
- p50: 1,666 ms; p90: 4,896 ms; p95/max: 5,065 ms.
- Availability and malformed-output handling: 10/10.
- Executable adapter readiness: 6/8 (75%); semantic understanding is ahead of live-verified nested bindings.
- Exact-output stability: 1/5 cases. Several successful attempts varied in nonessential inferred layout/reason fields, so exact stability remains a real weakness even when semantic grading passes.

The earlier 900-token cap truncated a ten-step request after two steps. The Jarvis route now uses 1,800 tokens; this fixed truncation in successful attempts but raises tail latency for long requests.

The first pinned run was 9/10 because Groq returned empty message content on one long-workflow repeat. Production inference now retries empty content, throttling, transient network failures and 5xx responses once with a tight bounded backoff. The repeated pinned run reached 10/10; ordinary successful requests do not pay retry latency, while p95 reflects the reliability protection in the tail.

## Engineering changes driven by failures

- Added deterministic retention of explicitly spoken Calls/Puts for OMON.
- Added deterministic retention of HMAP Table view.
- Normalized inconsistent named control targets and safely binds the single resolved security when present.
- Added a first-class configure-existing-panel plan. It reuses only allowlisted HMS, GR, GF, HALT, and HMAP adapters, verifies the targeted panel type/security, and fails closed for every other command.
- Connected real VoiceInk follow-ups to a sanitized local Arc context heartbeat. Only allowlisted command codes and ticker tokens persist, and context expires after 15 seconds.
- Added one bounded production retry for transient provider failures and recorded `retry_count` in inference telemetry.

## What this result does not prove

- Runtime scenarios remain expectations unless a live executor attaches execution evidence.
- OMON Calls/Puts is semantically recognized, but its nested browser adapter is not yet allowlisted; plan readiness correctly reports this gap.
- The five-case pinned slice is diagnostic, not by itself a 95% production claim.
- Exact-output instability and provider tail latency require continued repeated evaluation.
