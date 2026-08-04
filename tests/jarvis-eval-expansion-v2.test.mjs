import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gradeResult, validateCases } from "../src/model-eval-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = validateCases(JSON.parse(fs.readFileSync(path.join(root, "evals/data/jarvis-eval-expansion-v2.json"))));
const catalog = JSON.parse(fs.readFileSync(path.join(root, "catalog/commands.json")));

function actualStep(step) {
  if (step.step_kind === "control") return {
    step_kind: "control", command: null,
    control_operation: step.control_operation, control_target: step.control_target,
    control_value: step.control_value, required: step.required
  };
  if (step.step_kind === "configure") return {
    step_kind: "configure", command: null,
    configure_target: step.configure_target, post_open_actions: step.actions ?? [],
    required: step.required
  };
  return {
    step_kind: "command", command: step.command,
    security: step.ticker ? { ticker: step.ticker } : null,
    query: step.query, arguments: step.arguments ?? [],
    post_open_actions: step.actions ?? [], required: step.required,
    placement: step.placement
  };
}

function oracleResult(item) {
  const expected = item.expected;
  const result = {
    workflow: {
      kind: expected.kind,
      clarification: expected.kind === "clarify" ? expected.clarification_contains?.join(" ") : null,
      steps: (expected.steps ?? []).map(actualStep),
      layout: expected.layout ?? null
    }
  };
  if (expected.kind === "execute") result.plan = {};
  return result;
}

test("expansion v2 has broad, unique and strict cases", () => {
  assert.ok(cases.length >= 75, `expected at least 75 cases, got ${cases.length}`);
  assert.equal(new Set(cases.map(item => item.id)).size, cases.length);
  assert.ok(cases.every(item => item.schema_version === 2));
  assert.ok(cases.every(item => item.scoring?.strict_steps === true));
  assert.ok(cases.every(item => item.scoring?.actions === "exact"));
});

test("expansion v2 mentions every Godel command as an expected command step", () => {
  const expectedCommands = new Set(cases.flatMap(item => item.expected.steps ?? []).map(step => step.command).filter(Boolean));
  const missing = catalog.commands.map(item => item.code).filter(code => !expectedCommands.has(code));
  assert.deepEqual(missing, []);
});

test("expansion v2 spans noisy speech, workflows, followups, entities, layout, close and export", () => {
  const tags = new Set(cases.flatMap(item => item.tags ?? []));
  for (const tag of [
    "noise", "correction", "disambiguation", "compound", "follow-up", "configure",
    "entity", "ambiguity", "layout", "control", "close", "export", "download",
    "filters", "clarification", "unsupported", "safety", "regression"
  ]) assert.ok(tags.has(tag), `missing tag ${tag}`);

  const steps = cases.flatMap(item => item.expected.steps ?? []);
  const controlOps = new Set(steps.filter(step => step.step_kind === "control").map(step => step.control_operation));
  for (const operation of ["close", "move", "resize", "focus", "export"])
    assert.ok(controlOps.has(operation), `missing control operation ${operation}`);
  assert.ok(steps.some(step => step.step_kind === "configure"), "missing contextual configure case");
  assert.ok(cases.some(item => (item.expected.steps ?? []).length >= 6), "missing long workflow");
});

test("map versus index-map regression is explicitly tested in both directions", () => {
  const indexMap = cases.find(item => item.id === "xv2-imap-not-world-map");
  const venueMap = cases.find(item => item.id === "xv2-map-not-index");
  assert.equal(indexMap.expected.steps[0].command, "IMAP");
  assert.equal(venueMap.expected.steps[0].command, "MAP");
  assert.match(indexMap.utterance, /not the world exchange map/i);
  assert.match(venueMap.utterance, /not the s and p sector wheel/i);
});

test("all expansion expectations are internally gradeable", () => {
  for (const item of cases) {
    const grade = gradeResult(item, oracleResult(item));
    assert.equal(grade.overall, true, `${item.id}: ${JSON.stringify(grade.actual)}`);
  }
});

test("consequential language never expects an unattended mutation", () => {
  const mutationCases = cases.filter(item => /\b(post|create .*alert|subscribe|connect anything|change my plan|editing it|send anything)\b/i.test(item.utterance));
  assert.ok(mutationCases.length >= 8);
  for (const id of ["xv2-unsupported-chat-send", "xv2-unsupported-alert-create"])
    assert.notEqual(cases.find(item => item.id === id)?.expected.kind, "execute", id);
});
