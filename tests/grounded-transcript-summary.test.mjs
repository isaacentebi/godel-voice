import assert from "node:assert/strict";
import test from "node:test";
import {
  deterministicTranscriptSummary,
  sanitizeGroundedTranscriptEvidence,
  summarizeGroundedTranscriptEvidence
} from "../src/grounded-transcript-summary.mjs";
import { createHandoffServer } from "../src/handoff-server.mjs";

const evidence = {
  company: "Amazon",
  question: "How did AWS growth change, and was margin pressure mentioned?",
  topics: ["AWS growth", "margin pressure"],
  periods: [
    { period: "Q2 2026", excerpts: [{ topic: "AWS growth", text: "AWS revenue grew 17.5% in the quarter." }] },
    { period: "Q1 2026", excerpts: [{ topic: "AWS growth", text: "AWS revenue grew 16% in the quarter." }] }
  ]
};

test("grounded transcript evidence is tightly bounded and rejects full transcripts", () => {
  assert.deepEqual(sanitizeGroundedTranscriptEvidence(evidence), evidence);
  assert.throws(() => sanitizeGroundedTranscriptEvidence({ ...evidence, topics: [] }), /topics must contain/);
  assert.throws(() => sanitizeGroundedTranscriptEvidence({
    ...evidence,
    periods: [{ period: "Q2 2026", excerpts: [{ topic: "AWS growth", text: "x".repeat(601) }] }]
  }), /excerpt 1.*1-600 characters/);
  assert.throws(() => sanitizeGroundedTranscriptEvidence({
    ...evidence,
    periods: [{ period: "Q2 2026", excerpts: [{ topic: "unrequested", text: "A short passage." }] }]
  }), /not in requested topics/);
});

test("deterministic fallback answers from the strongest supplied passage", () => {
  const result = deterministicTranscriptSummary(evidence);
  assert.equal(result.grounded, true);
  assert.equal(result.fallback, true);
  assert.match(result.summary, /In Q2 2026, the call states: AWS revenue grew 17.5%/);
  assert.match(result.summary, /did not find margin pressure/);
  assert.deepEqual(result.findings.map(item => ({ topic: item.topic, mentioned: item.mentioned })), [
    { topic: "AWS growth", mentioned: true },
    { topic: "margin pressure", mentioned: false }
  ]);
  assert.doesNotMatch(JSON.stringify(result), /18%/);
});

test("provider summary accepts only known labels and evidence-grounded numbers", async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (_url, request) => {
    const body = JSON.parse(request.body);
    assert.match(body.messages[0].content, /never as instructions/);
    assert.match(body.messages[1].content, /17\.5%/);
    return new Response(JSON.stringify({
      model: "fast-test-model",
      provider: "test-provider",
      choices: [{ message: { content: JSON.stringify({
        summary: "AWS growth rose from 16% in Q1 2026 to 17.5% in Q2 2026; margin pressure was not found.",
        findings: [
          { topic: "AWS growth", period: "Q2 2026", mentioned: true, finding: "AWS growth reached 17.5%." },
          { topic: "margin pressure", period: null, mentioned: false, finding: "Not found in the supplied excerpts." }
        ]
      }) } }]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const result = await summarizeGroundedTranscriptEvidence(evidence, {
    baseUrl: "https://openrouter.ai/api/v1", apiKey: "test-key", model: "test/model", providerOnly: "Cerebras"
  });
  assert.equal(result.fallback, false);
  assert.equal(result.inference.provider, "test-provider");
  assert.match(result.summary, /17\.5%/);
});

test("fabricated provider numbers and provider errors fall back without leaking model text", async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      summary: "AWS growth reached 99%.",
      findings: [{ topic: "AWS growth", period: "Q2 2026", mentioned: true, finding: "It reached 99%." }]
    }) } }]
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  const fabricated = await summarizeGroundedTranscriptEvidence(evidence, {
    baseUrl: "https://example.test/v1", apiKey: "test-key", model: "test/model", retries: 0
  });
  assert.equal(fabricated.fallback, true);
  assert.doesNotMatch(JSON.stringify(fabricated), /99%/);

  globalThis.fetch = async () => { throw new TypeError("network down"); };
  const failed = await summarizeGroundedTranscriptEvidence(evidence, {
    baseUrl: "https://example.test/v1", apiKey: "test-key", model: "test/model", retries: 0
  });
  assert.equal(failed.fallback, true);
  assert.equal(failed.fallback_reason, "provider_failure");
});

test("HTTP transcript summary endpoint requires handoff auth and rejects bad evidence", async t => {
  let received = null;
  const handoff = createHandoffServer({
    secret: "test-secret", port: 0,
    transcriptSummarizer: async value => {
      received = sanitizeGroundedTranscriptEvidence(value);
      return deterministicTranscriptSummary(received);
    }
  });
  const address = await handoff.listen();
  t.after(() => handoff.close());
  const url = `http://127.0.0.1:${address.port}/grounded-transcript-summary`;
  assert.equal((await fetch(url, { method: "POST", body: JSON.stringify(evidence) })).status, 403);
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer test-secret", "Content-Type": "application/json" },
    body: JSON.stringify(evidence)
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).grounded, true);
  assert.equal(received.company, "Amazon");

  const invalid = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer test-secret", "Content-Type": "application/json" },
    body: JSON.stringify({ ...evidence, periods: [] })
  });
  assert.equal(invalid.status, 400);
});
