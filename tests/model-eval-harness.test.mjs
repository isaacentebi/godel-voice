import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFixtureRunner, gradeResult, latencySummary, redact, runRouteEvaluation, validateCases, validateRoute } from "../src/model-eval-harness.mjs";

const route = { id: "fixture", base_url: "https://openrouter.ai/api/v1", model: "fixture/model", provider_only: ["Groq"], allow_fallbacks: false, offline: true };
const workflowCase = {
  id: "workflow", mode: "workflow", utterance: "heatmap left and matrix right", tags: ["layout"],
  expected: { kind: "execute", steps: [
    { command: "HMAP", required: true, placement: "left" },
    { command: "EM", ticker: "AMZN", required: true, placement: "right", actions: [{ feature: "tab", operation: "select", value: "Estimates" }] }
  ], layout: { preset: "market", preserve_existing: true } }
};
const workflowResult = {
  workflow: { kind: "execute", steps: [
    { command: "HMAP", security: null, required: true, placement: "left", post_open_actions: [] },
    { command: "EM", security: { ticker: "AMZN" }, required: true, placement: "right", post_open_actions: [{ feature: "tab", operation: "select", value: "Estimates" }] }
  ], layout: { preset: "market", preserve_existing: true }, clarification: null },
  inference: { latency_ms: 123, prompt_tokens: 100, completion_tokens: 20, cost: 0.001, provider: "Groq" }
};

test("grades command order, workflow, actions, entities and placement independently", () => {
  const grade = gradeResult(workflowCase, workflowResult);
  assert.equal(grade.overall, true);
  assert.equal(grade.command.pass, true);
  assert.equal(grade.workflow.pass, true);
  assert.equal(grade.action.pass, true);
  assert.equal(grade.entity.pass, true);
  assert.equal(grade.clarification.applicable, false);
  const wrong = structuredClone(workflowResult);
  wrong.workflow.steps.reverse();
  const failed = gradeResult(workflowCase, wrong);
  assert.equal(failed.command.pass, false);
  assert.equal(failed.workflow.pass, false);
  assert.equal(failed.overall, false);
});

test("separates semantic accuracy from executable adapter readiness", () => {
  const blocked = { ...structuredClone(workflowResult), plan: null, plan_error: "UI automation is not allowlisted for HALT" };
  const grade = gradeResult(workflowCase, blocked);
  assert.equal(grade.overall, true);
  assert.equal(grade.workflow.pass, true);
  assert.equal(grade.executable.applicable, true);
  assert.equal(grade.executable.pass, false);
  assert.match(grade.plan_error, /HALT/);
});

test("treats preserve_existing as irrelevant only on a newly created blank screen", () => {
  const testCase = { id: "new", mode: "workflow", utterance: "new screen", expected: { kind: "execute", steps: [{ command: "WEI" }], layout: { new_screen: true, preserve_existing: true } } };
  const result = { workflow: { kind: "execute", steps: [{ command: "WEI", post_open_actions: [] }], layout: { new_screen: true, preserve_existing: false } } };
  assert.equal(gradeResult(testCase, result).workflow.pass, true);
  const sameScreen = structuredClone(testCase);
  sameScreen.expected.layout.new_screen = false;
  result.workflow.layout.new_screen = false;
  assert.equal(gradeResult(sameScreen, result).workflow.pass, false);
});

test("scores clarification text and malformed results", () => {
  const clarifyCase = { id: "clarify", mode: "intent", utterance: "earnings", expected: { kind: "clarify", clarification_contains: ["matrix"] } };
  const correct = gradeResult(clarifyCase, { intent: { kind: "clarify", clarification: "Matrix or estimates?" } });
  assert.equal(correct.clarification.pass, true);
  assert.equal(correct.overall, true);
  const malformed = gradeResult(clarifyCase, null, new Error("bad or-synthetic-redaction-token"));
  assert.equal(malformed.malformed.pass, false);
  assert.equal(malformed.availability.pass, true);
  assert.doesNotMatch(malformed.error, /synthetic-redaction-token/);
  const outage = gradeResult(clarifyCase, null, new Error("Provider error 429: rate limited"));
  assert.equal(outage.availability.pass, false);
  assert.equal(outage.malformed.applicable, false);
});

test("uses nearest-rank percentiles including p90, p95 and max", () => {
  assert.deepEqual(latencySummary([100, 200, 300, 400, 500]), { count: 5, p50: 300, p90: 500, p95: 500, max: 500 });
  assert.deepEqual(latencySummary([]), { count: 0, p50: null, p90: null, p95: null, max: null });
});

test("requires pinned, no-fallback OpenRouter routes for live evaluation", () => {
  assert.throws(() => validateRoute({ id: "bad", base_url: "https://openrouter.ai/api/v1", model: "x" }), /pin provider_only/);
  assert.throws(() => validateRoute({ id: "bad", base_url: "https://openrouter.ai/api/v1", model: "x", provider_only: ["Groq"], allow_fallbacks: true }), /allow_fallbacks=false/);
  assert.doesNotThrow(() => validateRoute(route, { offline: true }));
});

test("runs deterministic fixtures with warmup, concurrency and repeats", async () => {
  let calls = 0;
  const runner = async () => { calls++; return structuredClone(workflowResult); };
  const report = await runRouteEvaluation({ route, cases: [workflowCase], runner, repeat: 3, warmup: 2, concurrency: 2 });
  assert.equal(calls, 5);
  assert.equal(report.runs, 3);
  assert.equal(report.overall.accuracy, 1);
  assert.deepEqual(report.latency_ms, { count: 3, p50: 123, p90: 123, p95: 123, max: 123 });
  assert.equal(report.usage.prompt_tokens.total, 300);
  assert.equal(report.usage.completion_tokens.total, 60);
  assert.equal(report.usage.cost.total, 0.003);
  assert.equal(report.route.provider_pin_ok, true);
  assert.equal(report.tags.layout.accuracy, 1);
  assert.equal(report.stability.consistency, 1);
});

test("retries transient provider failures and records attempt count", async () => {
  let calls = 0;
  const runner = async () => {
    calls++;
    if (calls === 1) throw new Error("Provider error 429: rate limited");
    return structuredClone(workflowResult);
  };
  const report = await runRouteEvaluation({ route, cases: [workflowCase], runner, retries: 1, retryBaseMs: 0 });
  assert.equal(calls, 2);
  assert.equal(report.overall.accuracy, 1);
  assert.equal(report.results[0].inference.retry_count, 1);
  assert.equal(report.metrics.availability.accuracy, 1);
});

test("rejects duplicate and structurally invalid cases before spending money", () => {
  assert.throws(() => validateCases([workflowCase, workflowCase]), /duplicate/);
  assert.throws(() => validateCases([{ id: "bad", mode: "workflow", utterance: "x", expected: { kind: "execute", steps: [] } }]), /requires steps/);
  assert.doesNotThrow(() => validateCases([workflowCase]));
});

test("fixture runner is isolated and secret redaction is recursive", async () => {
  const runner = createFixtureRunner({ workflow: workflowResult });
  const first = await runner(workflowCase);
  first.workflow.kind = "unsupported";
  assert.equal((await runner(workflowCase)).workflow.kind, "execute");
  assert.deepEqual(redact({ api_key: "hello", nested: { note: "use sk-abcdefghijklmnop" } }), { api_key: "[REDACTED]", nested: { note: "use [REDACTED]" } });
});

test("frozen dev and holdout partitions are disjoint and cover the production corpus", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const cases = JSON.parse(fs.readFileSync(path.join(root, "data/model-eval-cases.json")));
  const split = JSON.parse(fs.readFileSync(path.join(root, "data/model-eval-split.json")));
  const all = [...split.dev, ...split.holdout];
  assert.equal(new Set(all).size, all.length);
  assert.deepEqual(new Set(all), new Set(cases.map(item => item.id)));
  assert.ok(split.holdout.length >= 8);
});

test("Jarvis v2 scoring grades controls, contextual configuration and runtime evidence", () => {
  const testCase = {
    schema_version: 2, id: "mixed", mode: "workflow", utterance: "close it and add microsoft", scoring: { strict_steps: true, actions: "exact" },
    expected: { kind: "execute", steps: [
      { step_kind: "control", control_operation: "close", control_target: { mode: "command", command: "EM", security: "META" }, control_value: null },
      { step_kind: "configure", configure_target: { mode: "focused", command: "GF", security: "AMZN" }, actions: [{ feature: "add company", operation: "add", value: "MSFT" }] }
    ], runtime: { outcome: "partial", screen_action: "same_screen", reason_codes: ["data_unavailable"], must_not_substitute: ["price"] } }
  };
  const result = {
    workflow: { kind: "execute", layout: { preset: "grid", preserve_existing: true, new_screen: false }, steps: [
      { step_kind: "control", command: null, control_operation: "close", control_target: { mode: "command", command: "EM", security: "META" }, control_value: null, required: true },
      { step_kind: "configure", command: null, configure_target: { mode: "focused", command: "GF", security: "AMZN" }, post_open_actions: [{ feature: "add company", operation: "add", value: "MSFT" }], required: true }
    ] },
    execution: { outcome: "partial", screen_action: "same_screen", reason_codes: ["data_unavailable"], substitutions: [] }
  };
  const grade = gradeResult(testCase, result);
  assert.equal(grade.overall, true);
  assert.equal(grade.step.pass, true);
  assert.equal(grade.control.pass, true);
  assert.equal(grade.configure.pass, true);
  assert.deepEqual(grade.runtime, { expected: true, observed: true, pass: true });
  assert.equal(grade.end_to_end_overall, true);
  const noRuntime = structuredClone(result);
  delete noRuntime.execution;
  const semanticOnly = gradeResult(testCase, noRuntime);
  assert.equal(semanticOnly.overall, true);
  assert.equal(semanticOnly.runtime.observed, false);
  assert.equal(semanticOnly.end_to_end_overall, null);
});

test("Jarvis corpus stays independent from the frozen benchmark", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const legacy = JSON.parse(fs.readFileSync(path.join(root, "data/model-eval-cases.json")));
  const jarvis = validateCases(JSON.parse(fs.readFileSync(path.join(root, "data/jarvis-eval-cases-v1.json"))));
  const split = JSON.parse(fs.readFileSync(path.join(root, "data/jarvis-eval-split-v1.json")));
  assert.ok(jarvis.length >= 20);
  assert.equal(split.frozen, false);
  for (const tag of ["control", "configure", "screen-limit", "data-unavailable", "transcription", "long"]) {
    assert.equal(jarvis.some(item => item.tags.includes(tag)), true, `missing ${tag}`);
  }
  const legacyIds = new Set(legacy.map(item => item.id));
  assert.equal(jarvis.some(item => legacyIds.has(item.id)), false);
  assert.equal(split.pinned_live.every(id => jarvis.some(item => item.id === id)), true);
});
