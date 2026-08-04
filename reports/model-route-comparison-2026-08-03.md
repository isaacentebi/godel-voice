# Godel Jarvis model-route comparison

Date: 2026-08-03

Frozen corpus: 30 strict HDS/EQS cases, including noisy speech, exact views, Run/Clear, and every live-observed numeric screener field. Each route was pinned through OpenRouter to one provider with fallbacks disabled, temperature 0, and one measured pass.

| Route | Strict | Exact actions | Executable | p50 | p95 | Cost / 30 |
|---|---:|---:|---:|---:|---:|---:|
| Cerebras · GPT-OSS-120B | 20.0% | 59.3% | 67.9% | **454 ms** | **821 ms** | $0.084 |
| Groq · GPT-OSS-120B | 23.3% | 55.6% | 64.3% | 913 ms | 1,315 ms | **$0.028** |
| Cerebras · GLM-4.7 | **70.0%** | **70.4%** | **71.4%** | 2,099 ms | 7,130 ms | $0.489 |

## Decision

Use deterministic adapters first. They compile the 14 noisy EQS range cases exactly without any model and retain strict browser postconditions.

Use Cerebras GPT-OSS-120B as the default model fallback. It is roughly twice as fast as Groq on this corpus and has slightly better action/executable scores, even though its full strict score is three points lower.

Keep GLM-4.7 as a validation-gated second-stage resolver, not the default hot path. Its large quality gain comes with about 4.6× median latency, 8.7× p95 latency, and 5.8× the cost of Cerebras GPT-OSS on this run. The local router now invokes it only when GPT-OSS is malformed or produces an execute-shaped response that cannot pass plan validation; valid plans, clarifications, and explicit unsupported decisions do not pay the second call.

Current local configuration is OpenRouter → Cerebras → `openai/gpt-oss-120b`, provider-pinned with fallbacks disabled.

Raw reports:

- `reports/hds-eqs-groq-full-2026-08-03.json`
- `reports/hds-eqs-cerebras-oss-full-2026-08-03.json`
- `reports/hds-eqs-cerebras-glm-full-2026-08-03.json`
