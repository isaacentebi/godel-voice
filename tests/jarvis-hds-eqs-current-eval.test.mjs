import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseControlFollowup } from "../src/control-followup.mjs";
import { gradeResult, validateCases } from "../src/model-eval-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = validateCases(JSON.parse(fs.readFileSync(path.join(root, "data/jarvis-hds-eqs-current-eval-v1.json"))));

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
    query: step.query, arguments: step.arguments ?? [], post_open_actions: step.actions ?? [],
    required: step.required, placement: step.placement
  };
}

function oracleResult(item) {
  const expected = item.expected;
  const result = { workflow: {
    kind: expected.kind, steps: (expected.steps ?? []).map(actualStep), layout: expected.layout ?? null,
    clarification: expected.kind === "clarify" ? expected.clarification_contains?.join(" ") : null
  } };
  if (expected.kind === "execute") result.plan = {};
  return result;
}

test("current HDS/EQS corpus is strict, unique and split by readiness", () => {
  assert.equal(cases.length, 30);
  assert.equal(new Set(cases.map(item => item.id)).size, cases.length);
  assert.ok(cases.every(item => item.schema_version === 2 && item.scoring?.strict_steps && item.scoring?.actions === "exact"));
  assert.equal(cases.filter(item => item.tags.includes("hds")).length, 9);
  assert.equal(cases.filter(item => item.tags.includes("run-clear")).length, 7);
  assert.equal(cases.filter(item => item.tags.includes("range-filter")).length, 14);
});

test("all exact HDS views have opening and immediate-followup coverage", () => {
  const hds = cases.filter(item => item.tags.includes("hds") && item.expected.kind === "execute");
  const views = new Set(hds.flatMap(item => item.expected.steps ?? []).flatMap(step => step.actions ?? []).filter(action => action.feature === "view").map(action => action.value));
  assert.deepEqual([...views].sort(), ["Bubble", "Table", "Treemap"]);
  assert.ok(hds.filter(item => item.tags.includes("follow-up")).length >= 4);

  const bubble = parseControlFollowup("make the holders window bubbles");
  assert.deepEqual(bubble.steps[0].actions, [{ feature: "view", operation: "select", value: "Bubble" }]);
  const table = parseControlFollowup("put this institutional holders back in the table");
  assert.deepEqual(table.steps[0].actions, [{ feature: "view", operation: "select", value: "Table" }]);
  const treemap = parseControlFollowup("switch the ownership window to the tree map");
  assert.deepEqual(treemap.steps[0].actions, [{ feature: "view", operation: "select", value: "Treemap" }]);
});

test("EQS Run and Clear are exact executable followups while the delayed sequence stays aspirational", () => {
  const executable = cases.filter(item => item.tags.includes("run-clear") && item.tags.includes("executable"));
  assert.equal(executable.length, 5);
  const operations = new Set(executable.flatMap(item => item.expected.steps ?? []).flatMap(step => step.actions ?? []).map(action => action.operation));
  assert.deepEqual([...operations].sort(), ["clear", "run"]);
  assert.deepEqual(parseControlFollowup("run the screener query").steps[0].actions, [{ feature: "screen", operation: "run", value: null }]);
  assert.deepEqual(parseControlFollowup("clear the screener filters").steps[0].actions, [{ feature: "screen", operation: "clear", value: null }]);
  const sequence = cases.find(item => item.id === "he-eqs-run-clear-sequence");
  assert.ok(sequence.tags.includes("aspirational"));
  assert.equal(sequence.expected.steps.length, 2);
  for (const id of ["he-eqs-run-immediate", "he-eqs-clear-natural"])
    assert.ok(cases.find(item => item.id === id).tags.includes("executable"), id);
});

test("executable EQS coverage contains every exact live-observed range field once", () => {
  const expectedFields = [
    "Market Cap (USD)", "P/E (Fwd)", "P/E (TTM)", "P/S (Fwd)", "P/S (TTM)",
    "P/B (Fwd)", "P/B (TTM)", "P/CF (Fwd)", "P/CF (TTM)", "EPS (Fwd 12mo)",
    "Rev. (TTM, USD)", "Rev. (Fwd 12mo, USD)",
    "Net Inc. (TTM, USD)", "Net Inc. (Fwd 12mo, USD)"
  ];
  const rangeCases = cases.filter(item => item.tags.includes("range-filter"));
  const fields = rangeCases.map(item => {
    const action = item.expected.steps[0].actions[0];
    assert.deepEqual({ feature: action.feature, operation: action.operation }, { feature: "range_filter", operation: "add" });
    assert.ok(item.tags.includes("executable"));
    assert.equal(Object.hasOwn(action.value, "minimum"), true);
    assert.equal(Object.hasOwn(action.value, "maximum"), true);
    return action.value.field;
  });
  assert.deepEqual(fields, expectedFields);
  assert.equal(new Set(fields).size, 14);
});

test("verified ranges claim current executable readiness", () => {
  for (const item of cases.filter(item => item.tags.includes("range-filter"))) {
    assert.equal(item.tags.includes("executable"), true, item.id);
    assert.equal(item.expected.kind, "execute", `${item.id} should preserve desired semantics`);
  }
});

test("production fast path compiles every noisy EQS range without the model", () => {
  for (const item of cases.filter(item => item.tags.includes("range-filter"))) {
    const plan = parseControlFollowup(item.utterance, item.context);
    assert.ok(plan, item.id);
    assert.equal(plan.steps[0].command ?? plan.steps[0].target.command, "EQS", item.id);
    assert.deepEqual(plan.steps[0].actions, item.expected.steps[0].actions, item.id);
  }
});

test("all current-state expectations remain strictly gradeable", () => {
  for (const item of cases) {
    const grade = gradeResult(item, oracleResult(item));
    assert.equal(grade.overall, true, `${item.id}: ${JSON.stringify(grade.actual)}`);
  }
});
