import test from "node:test";
import assert from "node:assert/strict";
import { fetchCompletionWithRetry } from "../src/compiler.mjs";

function response(payload, status = 200) {
  return new Response(typeof payload === "string" ? payload : JSON.stringify(payload), {
    status, headers: { "content-type": "application/json" }
  });
}

test("retries one empty provider completion and returns the valid response", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1
      ? response({ choices: [{ message: { content: "" } }] })
      : response({ choices: [{ message: { content: "{\"kind\":\"execute\"}" } }] });
  };
  try {
    const result = await fetchCompletionWithRetry({ url: "https://provider.test", headers: {}, body: {}, retries: 1, retryBaseMs: 0 });
    assert.equal(calls, 2);
    assert.equal(result.retryCount, 1);
    assert.equal(result.attemptLatenciesMs.length, 2);
    assert.equal(result.providerLatencyMs, result.attemptLatenciesMs[1]);
    assert.match(result.payload.choices[0].message.content, /execute/);
  } finally { globalThis.fetch = original; }
});

test("aborts a stalled provider request at the configured ceiling and reports bounded diagnostics", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, options) => new Promise((_, reject) => {
    options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
  });
  try {
    await assert.rejects(fetchCompletionWithRetry({
      url: "https://provider.test", headers: {}, body: {}, retries: 0, timeoutMs: 10
    }), error => {
      assert.ok(["AbortError", "TimeoutError"].includes(error.name));
      assert.equal(error.inference.timeout_ms, 10);
      assert.equal(error.inference.max_attempts, 1);
      assert.equal(error.inference.attempt_latencies_ms.length, 1);
      return true;
    });
  } finally { globalThis.fetch = original; }
});

test("retries throttling but never retries a permanent client error", async () => {
  const original = globalThis.fetch;
  let throttled = 0;
  globalThis.fetch = async () => {
    throttled += 1;
    return throttled === 1
      ? response("slow down", 429)
      : response({ choices: [{ message: { content: "{}" } }] });
  };
  try {
    const recovered = await fetchCompletionWithRetry({ url: "https://provider.test", headers: {}, body: {}, retries: 1, retryBaseMs: 0 });
    assert.equal(recovered.retryCount, 1);
    let permanent = 0;
    globalThis.fetch = async () => { permanent += 1; return response("bad request", 400); };
    await assert.rejects(fetchCompletionWithRetry({ url: "https://provider.test", headers: {}, body: {}, retries: 2, retryBaseMs: 0 }), /Provider error 400/);
    assert.equal(permanent, 1);
  } finally { globalThis.fetch = original; }
});
