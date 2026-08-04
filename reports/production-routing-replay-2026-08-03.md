# Production routing replay

Date: 2026-08-03

Corpus: the unchanged 30-case strict HDS/EQS set. This replay applies the actual routing order to the frozen pinned Cerebras GPT-OSS outputs: deterministic contextual compiler first, deterministic safety repair second, then the model result. It does not rewrite expected outputs around model mistakes.

| Lane | Exact cases |
|---|---:|
| Deterministic command/context compiler | 24 |
| Deterministic missing-context clarification | 1 |
| Pinned Cerebras GPT-OSS-120B | 4 |
| Total | **29/30 (96.7%)** |

The one retained failure is `he-eqs-run-clear-sequence`: “run this screener then clear it after I see the results.” A normal ordered workflow would clear immediately after results render and would not give the person time to inspect them. The case remains aspirational rather than pretending that immediate execution satisfies a human-delay instruction.

Important boundaries:

- This is a replay of frozen live model outputs, not a claim that every future stochastic response is identical.
- Browser success still requires each enabled adapter's native postcondition. A correct semantic route can still fail safely if Godel's current UI does not expose the exact expected state.
- The validation-gated GLM second stage is not credited here. The 96.7% figure therefore does not depend on an oracle choosing whichever model happened to be right.

Current hot path evidence:

- HDS restored Table/Bubble: 211–298 ms.
- EQS P/E range + Run: 1,793 ms; Market Cap range + Run: 1,367 ms.
- GF Quarterly/Overlay: 319 ms; Annual/Split/EUR: 496 ms.
- OMON 10↔15 strike depth: 741–875 ms; idempotent: 357 ms.
- Model fallback benchmark: Cerebras GPT-OSS p50 454 ms, p95 821 ms.
