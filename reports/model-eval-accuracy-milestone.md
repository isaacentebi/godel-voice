# Godel Voice model accuracy milestone

Date: 2026-08-03
Route: `openai/gpt-oss-120b` through OpenRouter, pinned to Groq, provider fallback disabled
Corpus: frozen 28-case development partition plus untouched 9-case holdout

## Results

| Measure | Development | Holdout | Combined |
|---|---:|---:|---:|
| Exact semantic result | 28/28 (100%) | 8/9 (88.9%) | 36/37 (97.3%) |
| Command sequence | 23/23 | 7/7 | 30/30 (100%) |
| Step/order/layout structure | 25/25 | 7/7 | 32/32 (100%) |
| Nested actions | 5/5 | 2/3 | 7/8 (87.5%) |
| Entity resolution | 16/16 | 6/6 | 22/22 (100%) |
| Clarification | 2/2 | 1/1 | 3/3 (100%) |
| Valid structured output | 28/28 | 9/9 | 37/37 (100%) |
| Provider availability | 28/28 | 9/9 | 37/37 (100%) |
| Executable plan where applicable | 20/20 | 6/6 | 26/26 (100%) |

The combined exact semantic target exceeds 95% without changing holdout expectations or accepting partial commands. The holdout alone remains 88.9% because one Apple calls-chain request omitted the requested `Calls` nested action. This is retained as a real failure.

End-to-end model/compiler latency across the final 37 requests was p50 1,103 ms, p90 1,978 ms, p95 2,378 ms, and max 2,783 ms. Average prompt usage was about 6,888 tokens, average completion usage about 303 tokens, and total provider-reported cost about $0.0268.

## Failure taxonomy and changes

- **Entity determinism:** trusted resolved entities now hydrate a required primary security. Multi-security HMS, GR, and GF use the first mentioned verified entity as primary while retaining later entities as actions. Berkshire Class B and Bitcoin have deterministic common aliases.
- **Prompt/workflow semantics:** the prompt now distinguishes supported layout metadata from unsupported commands, carries a single named company across related steps, clarifies context-free “that/it” follow-ups, preserves active-halts state in long workflows, and fails closed on credentials, trades, raw network/shell requests, and invented commands.
- **Deterministic voice repair:** the exact documented `HALT` Active tab is restored when speech explicitly says “active halts,” even if a long model response omits the setting.
- **Grader correctness:** `preserve_existing` is ignored only when a new blank screen makes it observationally irrelevant. It remains exact for existing screens. Provider outages are separated from malformed model output.
- **Runtime validation:** HALT Active originally remained an executable-plan gap. A separate implementation track subsequently added a panel-scoped, idempotent adapter with selected-state assertion and a narrow documented allowlist. The two affected workflows were rerun after that change and both produced executable plans; the targeted evidence is retained separately rather than rewriting the earlier full-dev report.
- **Holdout model miss:** the Apple calls-chain case omitted OMON `mode=Calls`. No post-holdout prompt rule or deterministic repair was added for that case.

## Reliability finding

A concurrent Groq run produced 13 upstream HTTP 429 failures. The harness now reports availability separately, supports bounded exponential retries, and measures end-to-end latency including retry backoff. The final evidence used concurrency 1, two allowed transient retries, and 1.5-second initial backoff; no request required a reported availability failure.

## Evidence

- Development: `reports/model-eval-dev-final2.json`
- Holdout: `reports/model-eval-holdout-final.json`
- Original cross-provider baseline: `reports/model-eval-live-comparison.json`
- Frozen split: `data/model-eval-split.json`
- HALT runtime regression: `reports/model-eval-halt-runtime-regression.json`
- Regression suite: 88/88 tests passing after final integration

Production recommendation remains Groq GPT-OSS-120B with provider pinning, fallback disabled, low concurrency, and bounded transient retries. Exact semantic and executable production success is 36/37 (97.3%); the sole retained miss is the omitted OMON Calls nested setting in holdout.
