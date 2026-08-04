# Model evaluation

The optional evaluation harness compares intent accuracy and latency without operating Arc or Godel.

## Offline regression

```sh
npm run eval:models:offline
npm run eval:jarvis:offline-stress
```

These commands require no API key. Generated JSON is written under the ignored `reports/` directory.

## Live provider comparison

Copy `evals/data/model-eval-routes.example.json` or `evals/data/jarvis-eval-routes.example.json`, keep credentials in `.env`, and run a small smoke set before a full comparison:

```sh
npm run eval:models -- \
  --routes evals/data/model-eval-routes.example.json \
  --route groq-oss-120b \
  --ids intent-noisy-quote \
  --repeat 1 --concurrency 1
```

Compare exact workflow validity, semantic success, provider identity, p50/p95 latency, token use, and reported cost. A model-only result is not evidence that a Godel action works.

The safe runner excludes utterances, prompts, raw responses, headers, credentials, and provider error bodies from its output:

```sh
npm run eval:models:safe -- --cases /path/to/cases.json
```

Never commit generated reports or credentials.
