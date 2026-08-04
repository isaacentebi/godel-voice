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
});

test("escalates only when an execute-shaped fast response has no valid plan", async () => {
  const calls = [];
  const routed = await compileWorkflowWithValidatedFallback("complex request", {
    compile: async (_text, options) => {
      calls.push(options);
      return options.model === "slow" ? executable("slow")
        : { workflow: { kind: "execute" }, plan: null, plan_error: "invented action" };
    },
    fallbackModel: "slow", fallbackProviderOnly: "cerebras"
  });
  assert.equal(routed.escalated, true);
  assert.equal(routed.primary_error, "invented action");
  assert.deepEqual(calls[1], {
    context: null, model: "slow", providerOnly: "cerebras",
    timeoutMs: 3200, retries: 0, retryBaseMs: 80
  });
  assert.equal(routed.routing.attempts[0].status, "rejected");
  assert.equal(routed.routing.attempts[1].timeout_ms, 3200);
});

test("fails the primary route fast and gives fallback only the bounded remaining budget", async () => {
  const calls = [];
  const routed = await compileWorkflowWithValidatedFallback("slow primary", {
    compile: async (_text, options) => {
      calls.push(options);
      if (!options.model) await new Promise(resolve => setTimeout(resolve, 30));
      return executable(options.model ?? "primary");
    },
    fallbackModel: "slow",
    fallbackProviderOnly: "groq",
    primaryTimeoutMs: 10,
    fallbackTimeoutMs: 40,
    routeCeilingMs: 45
  });
  assert.equal(routed.escalated, true);
  assert.equal(routed.routing.attempts[0].status, "timeout");
  assert.equal(routed.routing.attempts[0].timeout_ms, 10);
  assert.ok(calls[1].timeoutMs <= 35);
  assert.equal(calls[1].retries, 0);
  assert.equal(routed.routing.attempts[1].requested_provider, "groq");
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

test("preserves deliberate clarification and unsupported decisions", async () => {
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

test("escalates a malformed or failed primary request and propagates when no fallback exists", async () => {
  let calls = 0;
  const routed = await compileWorkflowWithValidatedFallback("repair me", {
    compile: async (_text, options) => {
      calls += 1;
      if (!options.model) throw new Error("bad JSON");
      return executable(options.model);
    },
    fallbackModel: "slow"
  });
  assert.equal(routed.escalated, true);
  assert.equal(routed.primary_error, "bad JSON");
  assert.equal(calls, 2);
  await assert.rejects(compileWorkflowWithValidatedFallback("repair me", {
    compile: async () => { throw new Error("bad JSON"); }
  }), /bad JSON/);
});
