import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gradeResult, validateCases } from "../src/model-eval-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = validateCases(JSON.parse(fs.readFileSync(path.join(root, "evals/data/jarvis-capability-gap-cases-v1.json"))));

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
  const result = {
    workflow: {
      kind: expected.kind,
      steps: (expected.steps ?? []).map(actualStep),
      layout: expected.layout ?? null,
      clarification: expected.kind === "clarify" ? expected.clarification_contains?.join(" ") : null
    }
  };
  if (expected.kind === "execute") result.plan = {};
  return result;
}

test("capability-gap corpus is additive, strict and intentionally broad", () => {
  assert.ok(cases.length >= 40);
  assert.equal(new Set(cases.map(item => item.id)).size, cases.length);
  assert.ok(cases.every(item => item.id.startsWith("gap-")));
  assert.ok(cases.every(item => item.schema_version === 2 && item.scoring?.strict_steps && item.scoring?.actions === "exact"));
});

test("gap corpus stresses the missing nested, filter, export, follow-up and combination surfaces", () => {
  const tags = new Set(cases.flatMap(item => item.tags));
  for (const tag of ["nested", "filters", "export", "download", "follow-up", "compound", "multi-step", "safety"])
    assert.ok(tags.has(tag), `missing ${tag}`);
  const steps = cases.flatMap(item => item.expected.steps ?? []);
  assert.ok(steps.filter(step => step.step_kind === "configure").length >= 25);
  assert.ok(steps.filter(step => step.step_kind === "control" && step.control_operation === "export").length >= 6);
  assert.ok(cases.filter(item => (item.expected.steps ?? []).length >= 4).length >= 3);
});

test("gap corpus covers the highest-value nested command families", () => {
  const commands = new Set(cases.flatMap(item => item.expected.steps ?? []).map(step => step.command ?? step.configure_target?.command).filter(Boolean));
  for (const command of [
    "DES", "FA", "ERN", "EM", "SI", "GR", "FOCUS", "TAS", "HCP",
    "IMAP", "HMAP", "FX", "MOST", "N", "TREND", "HALT", "ALLQ", "SECF", "EQS",
    "OMON", "OVME", "CALC", "AUM", "G", "HMS", "HP", "GF", "CF", "IPO", "TRAN", "KELLY", "CHAT"
  ]) assert.ok(commands.has(command), `missing ${command}`);
  assert.ok(cases.some(item => item.id === "gap-qm-watchlist-mutation"), "missing gated QM mutation case");
});

test("active HDS integration files are outside this additive gap corpus", () => {
  assert.equal(cases.some(item => (item.expected.steps ?? []).some(step => step.command === "HDS" || step.configure_target?.command === "HDS")), false);
});

test("unsafe mutations require clarification or remain unsupported", () => {
  const unsafe = cases.filter(item => item.tags.includes("safety") && /\b(create|change|append|subscribe|connect|submit)\b/i.test(item.utterance));
  assert.ok(unsafe.length >= 6);
  for (const item of unsafe) assert.notEqual(item.expected.kind, "execute", item.id);
});

test("every desired outcome remains strictly gradeable without weakening expectations", () => {
  for (const item of cases) {
    const grade = gradeResult(item, oracleResult(item));
    assert.equal(grade.overall, true, `${item.id}: ${JSON.stringify(grade.actual)}`);
  }
});
