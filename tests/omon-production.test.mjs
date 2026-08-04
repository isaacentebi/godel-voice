import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseControlFollowup } from "../src/control-followup.mjs";
import { validateWorkflowPlan } from "../src/workflow-plan.mjs";

test("compiles natural OMON strike-depth followups without the model", () => {
  const plan = parseControlFollowup("show fifteen strikes in the Apple option chain");
  assert.equal(plan.steps.length, 1);
  assert.deepEqual(plan.steps[0].target, { mode: "command", command: "OMON", security: "AAPL" });
  assert.deepEqual(plan.steps[0].actions, [{ feature: "strike depth", operation: "set", value: 15 }]);
});

test("OMON validator accepts only bounded integer native depth requests", () => {
  const base = value => ({
    version: 2, failure_policy: "stop_on_any", steps: [{
      id: "depth", kind: "configure", target: { mode: "command", command: "OMON", security: "AAPL" },
      actions: [{ feature: "strike depth", operation: "set", value }]
    }]
  });
  assert.equal(validateWorkflowPlan(base(15)).steps[0].actions[0].value, 15);
  assert.throws(() => validateWorkflowPlan(base(15.5)), /Invalid OMON strike depth/);
  assert.throws(() => validateWorkflowPlan({ ...base(15), steps: [{ ...base(15).steps[0], actions: [{ feature: "expiration", operation: "select", value: "next" }] }] }), /Unsupported OMON feature/);
});

test("production OMON bridge uses one native slider and independent rendered postconditions", () => {
  const main = fs.readFileSync(new URL("../extension/main-world.js", import.meta.url), "utf8");
  const content = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
  assert.match(main, /Expected one Godel OMON strike-depth slider/);
  assert.match(main, /OMON native strike-depth callback unavailable/);
  assert.match(main, /state\.signature !== before\.signature/);
  assert.match(main, /registerAdapter\("OMON"/);
  assert.match(content, /detachedUniqueOMONPanel/);
  assert.match(content, /panelInternalAction\(panel, "OMON", "setStrikeDepth"/);
});
