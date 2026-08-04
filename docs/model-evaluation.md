# Repeated model and latency evaluation

The model harness measures the voice compiler as a complete intent/workflow component. It does not send anything to Arc or Godel.

## Jarvis stress suite (v1)

`data/jarvis-eval-cases-v1.json` is an expandable, schema-versioned stress corpus for mixed command/control workflows, existing-panel follow-ups, screen-capacity outcomes, unavailable-data honesty, noisy transcription, and long compound requests. Its schema is `data/jarvis-eval.schema.json`; its small pinned live partition is `data/jarvis-eval-split-v1.json`.

This suite is deliberately separate from `model-eval-split.json`. It is not frozen, must not be used to tune or restate the historical frozen dev/holdout result, and its scores must always be reported under the Jarvis v1 name.

Version-2 cases enable strict ordered-step scoring. They independently score commands, window controls, existing-panel configuration, exact nested actions, entities, queries, arguments, and placement. Runtime expectations are three-state: expected, observed, and pass. A model-only run leaves runtime evidence unobserved and does not pretend live execution passed. End-to-end success exists only when execution evidence is attached.

The Arc executor publishes a sanitized local context heartbeat containing only allowlisted command codes, ticker tokens, connection state, and focused/last panel identity. It never publishes panel text. The local compiler uses the context only while it is fresh (15 seconds), allowing real follow-ups such as “add Microsoft to that” while stale or ambiguous references still clarify.

Run the pinned profile with `npm run eval:jarvis:pinned`. It pins OpenRouter to Groq, disables provider fallbacks, uses concurrency one, and allows a larger completion budget for long workflows.

## What it measures

Each route report contains independently scored command, semantic full-workflow, executable-plan, nested-action, entity, clarification, and well-formed-output accuracy. Semantic scoring never hides adapter gaps: a correct requested action can pass workflow/action scoring while executable-plan scoring fails because the runtime adapter remains unavailable. It also reports overall semantic exact success, observed provider identity, provider-pin compliance, latency p50/p90/p95/max, prompt and completion tokens, and provider-reported cost. On a newly created blank screen, `preserve_existing` has no observable effect and is treated as semantically equivalent; it remains exact on an existing screen.

The main corpus contains realistic noise, pronunciation errors, self-corrections, multiple independent windows, multi-security panels, optional steps, explicit placement, new-screen requests, obscure commands, missing context, unsupported capabilities, and adversarial requests. Every future production failure should become a permanent case.

## Safe offline check

```sh
npm run eval:models:offline
```

This runs deterministic fixtures three times with warmup and concurrency. It requires no API key and makes no network requests. The JSON report is written to `reports/model-eval-offline.json`.

## Private spoken-model tournament

`evals/jarvis-spoken-benchmark-v1.mjs` emits 164 strict cases designed around real dictation failures: pronunciation noise, false starts, company-to-ticker resolution, contextual follow-ups, ordered multi-window workflows, layout controls, VIX/macroeconomic desks, ambiguity, and unsupported or unsafe requests. It is generated rather than hand-copied so whole utterance families stay internally consistent and easy to extend.

Use the privacy-preserving runner for live model comparisons:

```sh
npm run eval:jarvis:spoken:emit > /tmp/jarvis-spoken-v1.json
npm run eval:models:safe -- \
  --cases /tmp/jarvis-spoken-v1.json \
  --routes data/jarvis-model-routes-2026-08-04.json \
  --route cerebras-oss-120b,groq-oss-120b,google-gemini-3.6-flash \
  --repeat 1 --concurrency 4 --request-timeout-ms 6000 \
  --output reports/jarvis-spoken-model-tournament.json
```

The safe report contains case IDs, exact-plan/semantic scores, coarse failure classes, provider identity and latency. It intentionally excludes utterances, prompts, raw responses, error bodies, headers and credentials, and is written with private file permissions. Provider routes remain pinned with OpenRouter fallback disabled so quality and latency are attributed to the named endpoint.

## Live comparison

Copy `data/model-eval-routes.example.json` to a private routes file if you want to change it. Each OpenRouter route must name exactly which provider is allowed and must disable fallback. This prevents a benchmark labelled Cerebras from silently running somewhere else.

Start with a tiny smoke subset:

```sh
npm run eval:models -- \
  --routes data/model-eval-routes.example.json \
  --route groq-oss-120b \
  --ids intent-noisy-quote,workflow-market-left-research-right \
  --repeat 1 --warmup 0 --concurrency 1 \
  --output reports/model-eval-smoke.json
```

Then run a statistically useful pass only after checking current provider pricing:

```sh
npm run eval:models -- \
  --routes data/model-eval-routes.example.json \
  --route groq-oss-120b,cerebras-oss-120b,cerebras-glm-4.7 \
  --repeat 5 --warmup 2 --concurrency 4 \
  --output reports/model-eval-comparison.json
```

Supported flags are `--cases`, `--routes`, `--route`, `--ids`, `--split-file`, `--partition`, `--repeat`, `--warmup`, `--concurrency`, `--retries`, `--retry-base-ms`, `--output`, `--offline`, and `--fixtures`. The frozen production split is `data/model-eval-split.json`; tune against `--partition dev` and run `--partition holdout` only at a milestone. Availability failures are reported separately from malformed model output. When retries are enabled, primary latency includes backoff and all attempts; provider latency reports the final request alone.

## Reading results

- Prefer exact workflow/action/entity accuracy over a model that merely chooses the right top-level command.
- Compare p90 and p95, not only p50; voice interfaces feel broken when tail latency is high.
- Production routing is deliberately stricter than exploratory evaluation. Deterministic local parsing runs first. Remaining language requests give Cerebras one 1,300 ms attempt; only a transport failure, timeout, or rejected local plan can use the 3,500 ms Gemini fallback. The combined route ceiling is 4,800 ms. `VOICE_LLM_PRIMARY_*`, `VOICE_LLM_FALLBACK_*`, and `VOICE_LLM_ROUTE_CEILING_MS` tune these limits. If retries are enabled, their request timeouts and backoff are divided inside the same route budget rather than multiplying the ceiling.
- Provider pin failure invalidates a provider-specific result.
- Compare warm and cold runs separately. Warmups are excluded from all recorded metrics.
- Keep response format, reasoning level, temperature, maximum tokens, and corpus identical for a fair model comparison.
- Provider-reported cost can be absent. A null average means the route did not return cost data, not that it was free.

The harness redacts secret-looking keys and OpenRouter-style API keys before writing reports. Routes reference the environment variable holding a key; keys never belong in route or report files.
