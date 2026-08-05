import assert from "node:assert/strict";
import test from "node:test";
import { parseControlFollowup } from "../src/control-followup.mjs";

function compact(plan) {
  return plan.steps.map(step => ({
    kind: step.kind,
    command: step.command ?? null,
    terminal: step.terminal_command ?? null,
    operation: step.operation ?? null,
    placement: step.layout?.placement ?? null,
    actions: (step.actions ?? []).map(action => [action.feature, action.operation, action.value])
  }));
}

test("real session: heatmap plus Amazon fundamentals is a zero-model two-panel desk", () => {
  const plan = parseControlFollowup(
    "open a heatmap on the left side and an Amazon chart on the right side with operating margins and revenues"
  );
  assert.deepEqual(compact(plan), [
    { kind: "command", command: "HMAP", terminal: "HMAP", operation: null, placement: "left", actions: [] },
    { kind: "command", command: "GF", terminal: "AMZN EQ GF", operation: null, placement: "right", actions: [
      ["margin metric", "add", "Operating Margin"],
      ["add metric", "add", "Revenue"]
    ] }
  ]);
});

test("real session: earnings matrix plus analyst targets never duplicates a panel", () => {
  const plan = parseControlFollowup(
    "Can you pull up the Amazon earnings matrix? Is there info on Amazon analyst price targets and its expectations?"
  );
  assert.deepEqual(plan.steps.map(step => step.terminal_command), ["AMZN EQ EM", "AMZN EQ ANR"]);
});

test("real session: transcript topic question becomes grounded research and highlighting", () => {
  const plan = parseControlFollowup("Did Meta mention business agents in its latest earnings call?");
  assert.equal(plan.steps[0].terminal_command, "META EQ TRAN");
  assert.deepEqual(plan.steps[0].actions, [{
    feature: "research",
    operation: "summarize",
    value: {
      periods: 1,
      topics: ["business agents"],
      question: "did meta mention business agents in its latest earnings call?"
    }
  }]);
});

test("real session: after-hours question uses the authenticated quote header", () => {
  const plan = parseControlFollowup("How is Amazon doing after hours? Can you check?");
  assert.deepEqual(plan.steps.map(step => step.terminal_command), ["AMZN EQ Q"]);
});

test("real session: clean comparison is one reset followed by one complete GF graph", () => {
  const plan = parseControlFollowup(
    "Close everything and open a chart comparing Amazon and Meta operating margin and revenue for five years"
  );
  assert.equal(plan.steps[0].operation, "reset_workspace");
  assert.equal(plan.steps[1].terminal_command, "AMZN EQ GF");
  assert.deepEqual(plan.steps[1].actions, [
    { feature: "range", operation: "select", value: "5Y" },
    { feature: "add company", operation: "add", value: "META" },
    { feature: "margin metric", operation: "add", value: "Operating Margin" },
    { feature: "add metric", operation: "add", value: "Revenue" }
  ]);
});
