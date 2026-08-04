# Jarvis hard live-model comparison — 2026-08-04

This was a bounded planning benchmark, not a Godel runtime test. It used 26 hard cases that are not handled entirely by the deterministic fast path: 20 executable plans, three clarifications, and three unsupported requests. The set includes four multi-command workflows, eleven entity-heavy requests, seven disambiguations, four safety cases, and noisy/corrected speech. Each route ran once at concurrency one through OpenRouter with provider fallback disabled.

| Route | Strict exact | Command | Exact actions | Entity | Well formed | p50 | p95 | Prompt / completion tokens | Measured cost |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Cerebras GPT-OSS-120B | 15/26 (57.7%) | 90.0% | 57.1% | 75.0% | 100% | 518 ms | 787 ms | 208,456 / 10,555 | $0.0809 |
| Cerebras GLM-4.7 | 11/26 (42.3%) | 70.0% | 57.1% | 58.3% | 76.9% | 2,094 ms | 7,338 ms | 159,148 / 21,101 | $0.4161 |
| Groq GPT-OSS-120B | 16/26 (61.5%) | 80.0% | 71.4% | 75.0% | 96.2% | 1,356 ms | 2,309 ms | 200,682 / 7,007 | $0.0289 |

## Decision

Keep Cerebras GPT-OSS-120B as the hot path. It was roughly 2.6× faster at the median than Groq and had perfect response well-formedness. Keep the local schema, entity, action, and safety validators as mandatory gates.

Do not use GLM-4.7 as the default validation fallback. It did not recover any of the three Cerebras OSS plans rejected by local plan validation, produced six malformed/empty responses, was materially less accurate, about four times slower at p95, and about five times as expensive on this sample.

If a second provider is desired, use Groq GPT-OSS-120B only after a transport failure, empty response, or local schema/plan rejection. It had the best strict and exact-action score, but higher latency. Do not call it after a valid Cerebras plan merely to vote: that adds latency and cost without a trustworthy judge.

The three completed reports cost $0.5259 in total. An earlier GLM orchestration attempt generated no report; any provider charge from that aborted attempt is unknown and is not included. One repeat is directional evidence, not a stability estimate. No Arc session was used, so runtime execution accuracy remains unmeasured.
