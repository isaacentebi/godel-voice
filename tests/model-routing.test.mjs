import assert from "node:assert/strict";
import test from "node:test";
import { compileWorkflowWithValidatedFallback } from "../src/model-routing.mjs";

const executable = model => ({ workflow: { kind: "execute" }, plan: { steps: [] }, inference: { model } });

test("accepts a validated fast-model plan without paying fallback latency", async () => {
  const calls = [];
  const routed = await compileWorkflowWithValidatedFallback("open Meta description", {
    compile: async (_text, options) => { calls.push(options); return executable("fast"); },
    context: { focused_panel: null }, fallbackModel: "slow"
  });
  assert.equal(routed.escalated, false);
  assert.equal(routed.result.inference.model, "fast");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].timeoutMs, 1_300);
  assert.equal(calls[0].retries, 0);
});

test("treats locally invalid executable plans as terminal instead of model-repairable", async () => {
  const calls = [];
  const routed = await compileWorkflowWithValidatedFallback("complex request", {
    compile: async (_text, options) => {
      calls.push(options);
      return { workflow: { kind: "execute" }, plan: null, plan_error: "invented action" };
    },
    fallbackModel: "slow", fallbackProviderOnly: "cerebras"
  });
  assert.equal(routed.escalated, false);
  assert.equal(routed.primary_error, "invented action");
  assert.equal(calls.length, 1);
  assert.equal(routed.routing.attempts[0].status, "accepted");
});

test("retries a timed-out primary once on the same pinned route within the bounded remaining budget", async () => {
  const calls = [];
  const routed = await compileWorkflowWithValidatedFallback("slow primary", {
    compile: async (_text, options) => {
      calls.push(options);
      if (!options.model) await new Promise(resolve => setTimeout(resolve, 30));
      return executable(options.model ?? "primary");
    },
    fallbackModel: "slow",
    fallbackProviderOnly: "groq",
    primaryModel: "fast",
    primaryProviderOnly: "cerebras",
    primaryTimeoutMs: 10,
    fallbackTimeoutMs: 40,
    routeCeilingMs: 45
  });
  assert.equal(routed.escalated, true);
  assert.equal(routed.routing.attempts[0].status, "timeout");
  assert.equal(routed.routing.attempts[0].timeout_ms, 10);
  assert.ok(calls[1].timeoutMs <= 35);
  assert.equal(calls[1].retries, 0);
  assert.equal(calls[1].model, "fast");
  assert.equal(routed.routing.attempts[1].requested_provider, "cerebras");
});

test("bounds fallback latency and attaches secret-free route diagnostics to the error", async () => {
  await assert.rejects(compileWorkflowWithValidatedFallback("both routes stall", {
    compile: async () => new Promise(resolve => setTimeout(() => resolve(executable("late")), 50)),
    fallbackModel: "slow",
    primaryTimeoutMs: 5,
    fallbackTimeoutMs: 8,
    routeCeilingMs: 20
  }), error => {
    assert.equal(error.code, "MODEL_ROUTE_TIMEOUT");
    assert.equal(error.routing.attempts.length, 2);
    assert.equal(error.routing.attempts[1].status, "timeout");
    assert.equal(error.routing.ceiling_ms, 20);
    assert.doesNotMatch(JSON.stringify(error.routing), /sk-/);
    return true;
  });
});

test("preserves deliberate clarification and unsupported decisions without retrying", async () => {
  for (const kind of ["clarify", "unsupported"]) {
    let calls = 0;
    const routed = await compileWorkflowWithValidatedFallback("ambiguous", {
      compile: async () => { calls += 1; return { workflow: { kind }, plan: null }; },
      fallbackModel: "slow"
    });
    assert.equal(routed.escalated, false);
    assert.equal(calls, 1);
  }
});

test("retries a malformed primary response once and propagates non-recoverable provider failures", async () => {
  let calls = 0;
  const routed = await compileWorkflowWithValidatedFallback("repair me", {
    compile: async (_text, options) => {
      calls += 1;
      if (!options.model) throw new Error("bad JSON");
      return executable(options.model);
    },
    primaryModel: "fast",
    fallbackModel: "slow"
  });
  assert.equal(routed.escalated, true);
  assert.equal(routed.primary_error, "bad JSON");
  assert.equal(calls, 2);
  await assert.rejects(compileWorkflowWithValidatedFallback("repair me", {
    compile: async () => { throw new Error("Provider error 401: unauthorized"); },
    primaryModel: "fast",
    fallbackModel: "slow"
  }), error => {
    assert.match(error.message, /401/);
    assert.equal(error.routing.attempts.length, 1);
    return true;
  });
});

test("caps configured planner budgets at 1.3s primary, 0.9s recovery and 2.3s total", async () => {
  const calls = [];
  const routed = await compileWorkflowWithValidatedFallback("recover malformed", {
    compile: async (_text, options) => {
      calls.push(options);
      if (!options.model) throw new SyntaxError("Unexpected token");
      return executable(options.model);
    },
    primaryModel: "openai/gpt-oss-120b",
    primaryProviderOnly: "cerebras",
    fallbackModel: "google/gemini-3.6-flash",
    fallbackProviderOnly: "google-vertex/global",
    primaryTimeoutMs: 9_000,
    fallbackTimeoutMs: 9_000,
    routeCeilingMs: 9_000
  });
  assert.equal(routed.routing.ceiling_ms, 2_300);
  assert.equal(routed.routing.attempts[0].timeout_ms, 1_300);
  assert.equal(routed.routing.attempts[1].timeout_ms, 900);
  assert.equal(calls[1].model, "openai/gpt-oss-120b");
  assert.equal(calls[1].providerOnly, "cerebras");
  assert.equal(calls[1].retryBaseMs, 0);
});
