import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gradeResult, validateCases } from "../src/model-eval-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = validateCases(JSON.parse(fs.readFileSync(path.join(root, "evals/data/jarvis-adversarial-cases-v1.json"))));
const tags = new Set(cases.flatMap(item => item.tags ?? []));

function actualStep(step) {
  if (step.step_kind === "control") return {
    step_kind: "control", command: null,
    control_operation: step.control_operation,
    control_target: step.control_target,
    control_value: step.control_value,
    required: step.required
  };
  if (step.step_kind === "configure") return {
    step_kind: "configure", command: null,
    configure_target: step.configure_target,
    post_open_actions: step.actions ?? [],
    required: step.required
  };
  return {
    step_kind: "command", command: step.command,
    security: step.ticker ? { ticker: step.ticker } : null,
    post_open_actions: step.actions ?? [], arguments: step.arguments ?? [],
    query: step.query, required: step.required, placement: step.placement
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
  if (expected.runtime) {
    result.execution = {
      outcome: expected.runtime.outcome,
      screen_action: expected.runtime.screen_action,
      reason_codes: expected.runtime.reason_codes ?? [],
      substitutions: []
    };
  }
  return result;
}

test("adversarial corpus covers the requested Jarvis surface", () => {
  assert.ok(cases.length >= 40, `expected >=40 cases, got ${cases.length}`);
  for (const tag of [
    "noise", "correction", "filters", "charts", "holders", "screener",
    "long", "pronoun", "follow-up", "close", "move", "resize",
    "export", "download", "clarification", "unsupported", "safety"
  ]) assert.ok(tags.has(tag), `missing ${tag} coverage`);

  const commands = new Set(cases.flatMap(item => item.expected.steps ?? []).map(step => step.command).filter(Boolean));
  for (const command of ["MOST", "EQS", "N", "NI", "CF", "HDS", "HLDR", "GF", "HMS", "GR", "G", "HP", "OMON"])
    assert.ok(commands.has(command), `missing ${command}`);

  const operations = new Set(cases.flatMap(item => item.expected.steps ?? [])
    .filter(step => step.step_kind === "control").map(step => step.control_operation));
  for (const operation of ["close", "move", "resize", "focus", "maximize", "restore", "export"])
    assert.ok(operations.has(operation), `missing ${operation}`);
});

test("every contextual pronoun case supplies bounded panel context", () => {
  const contextual = cases.filter(item => item.tags?.includes("pronoun"));
  assert.ok(contextual.length >= 5);
  for (const item of contextual) {
    assert.ok(item.context && typeof item.context === "object", `${item.id} lacks context`);
    assert.ok(item.context.focused_panel || item.context.panels, `${item.id} has no addressable/ambiguous panels`);
  }
});

test("unsafe or unverified mutations never expect unattended execution", () => {
  const unsafe = cases.filter(item => item.tags?.includes("safety") ||
    item.id === "adv-export-hmap-unverified" || item.id === "adv-unknown-chart-study");
  assert.ok(unsafe.length >= 4);
  for (const item of unsafe) assert.notEqual(item.expected.kind, "execute", `${item.id} must fail closed`);
});

test("the corpus exercises exact ordering, entities, arguments, actions and runtime outcomes", () => {
  for (const item of cases) {
    const grade = gradeResult(item, oracleResult(item));
    assert.equal(grade.overall, true, `${item.id}: ${JSON.stringify(grade.actual)}`);
    if (item.expected.runtime) {
      assert.equal(grade.runtime.observed, true, item.id);
      assert.equal(grade.runtime.pass, true, item.id);
    }
  }
});

test("adversarial suite stays separate from frozen and expandable Jarvis IDs", () => {
  const frozen = JSON.parse(fs.readFileSync(path.join(root, "evals/data/model-eval-cases.json")));
  const jarvis = JSON.parse(fs.readFileSync(path.join(root, "evals/data/jarvis-eval-cases-v1.json")));
  const existing = new Set([...frozen, ...jarvis].map(item => item.id));
  assert.equal(cases.some(item => existing.has(item.id)), false);
  assert.equal(cases.every(item => item.id.startsWith("adv-")), true);
});

test("voice text contains real recognition stress instead of punctuation-only variants", () => {
  const utterances = cases.map(item => item.utterance.toLowerCase());
  for (const fragment of ["pee", "sails", "fill ins", "e bit duh", "black scholes", "no wait", "sorry", "scratch that"])
    assert.ok(utterances.some(value => value.includes(fragment)), `missing recognition stress: ${fragment}`);
});
