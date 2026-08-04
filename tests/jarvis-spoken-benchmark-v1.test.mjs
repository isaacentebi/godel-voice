import test from "node:test";
import assert from "node:assert/strict";
import { gradeResult, validateCases } from "../src/model-eval-harness.mjs";
import { spokenBenchmarkV1 } from "../evals/jarvis-spoken-benchmark-v1.mjs";

const cases = validateCases(spokenBenchmarkV1);
const tags = new Set(cases.flatMap(item => item.tags));
const count = tag => cases.filter(item => item.tags.includes(tag)).length;

function actualStep(step) {
  if (step.step_kind === "control") return {
    step_kind: "control", command: null, control_operation: step.control_operation,
    control_target: step.control_target, control_value: step.control_value, required: step.required
  };
  if (step.step_kind === "configure") return {
    step_kind: "configure", command: null, configure_target: step.configure_target,
    post_open_actions: step.actions ?? [], required: step.required
  };
  return {
    step_kind: "command", command: step.command,
    security: step.ticker ? { ticker: step.ticker } : null,
    post_open_actions: step.actions ?? [], arguments: step.arguments ?? [], query: step.query,
    required: step.required, placement: step.placement
  };
}

function oracle(item) {
  return { workflow: {
    kind: item.expected.kind,
    clarification: item.expected.kind === "clarify" ? item.expected.clarification_contains.join(" ") : null,
    steps: (item.expected.steps ?? []).map(actualStep), layout: item.expected.layout ?? null
  }, ...(item.expected.kind === "execute" ? { plan: {} } : {}) };
}

test("spoken benchmark has at least 150 unique, strictly scored utterances", () => {
  assert.ok(cases.length >= 150, `only ${cases.length} cases`);
  assert.equal(new Set(cases.map(item => item.id)).size, cases.length);
  assert.equal(new Set(cases.map(item => item.utterance.toLowerCase())).size, cases.length);
  assert.ok(cases.every(item => item.schema_version === 2));
  assert.ok(cases.every(item => item.scoring.strict_steps && item.scoring.actions === "exact"));
});

test("coverage is balanced across real spoken-interface failure modes", () => {
  for (const tag of ["noise", "multi-command", "context", "follow-up", "layout", "vix", "entity", "company-to-ticker", "fail-closed", "clarification", "unsupported", "safety"])
    assert.ok(tags.has(tag), `missing ${tag}`);
  assert.ok(count("noise") >= 60, `noise=${count("noise")}`);
  assert.ok(count("multi-command") >= 30, `multi-command=${count("multi-command")}`);
  assert.ok(count("context") >= 25, `context=${count("context")}`);
  assert.ok(count("layout") >= 25, `layout=${count("layout")}`);
  assert.ok(count("vix") >= 16, `vix=${count("vix")}`);
  assert.ok(count("company-to-ticker") >= 32, `company-to-ticker=${count("company-to-ticker")}`);
  assert.ok(count("fail-closed") >= 32, `fail-closed=${count("fail-closed")}`);
});

test("VIX expectations preserve the authoritative CBOE index identity", () => {
  const direct = cases.filter(item => item.id.includes("vix-direct"));
  assert.ok(direct.length >= 12);
  for (const item of direct) {
    assert.deepEqual(item.resolved_entities, [{ spoken_name: "vix", ticker: "VIX", venue: "CBOE", asset_class: "IDX" }]);
    assert.deepEqual(item.expected.steps.map(step => [step.command, step.ticker]), [["G", "VIX"]]);
  }
  for (const item of cases.filter(item => item.id.includes("vix-macro")))
    assert.deepEqual(item.expected.steps.map(step => step.command), ["WEI", "WEIF", "G"]);
});

test("contextual cases never grant an unbounded pronoun", () => {
  for (const item of cases.filter(item => item.tags.includes("context"))) {
    assert.ok(item.context?.focused_panel?.connected, item.id);
    assert.equal(item.expected.steps[0].step_kind, "configure", item.id);
    assert.equal(item.expected.steps[0].configure_target.mode, "focused", item.id);
  }
});

test("unsafe cases never expect unattended execution", () => {
  for (const item of cases.filter(item => item.tags.includes("safety")))
    assert.equal(item.expected.kind, "unsupported", item.id);
  for (const item of cases.filter(item => item.tags.includes("fail-closed")))
    assert.notEqual(item.expected.kind, "execute", item.id);
});

test("every expectation is accepted and exactly gradeable by the production harness", () => {
  for (const item of cases) {
    const grade = gradeResult(item, oracle(item));
    assert.equal(grade.overall, true, `${item.id}: ${JSON.stringify(grade)}`);
  }
});
