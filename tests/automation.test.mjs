import assert from "node:assert/strict";
import test from "node:test";
import { buildAutomationPlan, encodeAutomationMarker } from "../src/automation-plan.mjs";

await import("../extension/core.js");
const core = globalThis.GodelVoiceCore;

function intent(command, actions = []) {
  return {
    kind: "execute", confidence: 0.98, command, query: null,
    security: { spoken_name: "Apple", ticker: "AAPL", venue: "US", asset_class: "EQ", needs_resolution: false },
    arguments: [], post_open_actions: actions, clarification: null, reason: "Comparison requested."
  };
}

test("encodes and parses a GF browser automation plan", () => {
  const source = intent("GF", [
    { feature: "add company", operation: "add", value: "MSFT" },
    { feature: "ratio metric", operation: "select", value: "P/E" },
    { feature: "range", operation: "select", value: "5Y" },
    { feature: "include consensus estimates", operation: "select", value: "on" }
  ]);
  const marker = encodeAutomationMarker(source);
  assert.match(marker, /^GV1:/);
  const parsed = core.parseMarker(marker);
  assert.equal(parsed.terminal_command, "AAPL US EQ GF");
  assert.equal(parsed.actions[0].value, "MSFT");
});

test("permits ordinary commands with no UI actions", () => {
  const plan = buildAutomationPlan(intent("DES"));
  assert.equal(plan.terminal_command, "AAPL US EQ DES");
  assert.deepEqual(plan.actions, []);
});

test("rejects UI actions outside the initial allowlist", () => {
  const source = intent("DES", [{ feature: "anything", operation: "click", value: "x" }]);
  assert.throws(() => buildAutomationPlan(source), /unknown UI feature|not allowlisted/);
});

test("browser validator rejects unknown features and commands", () => {
  assert.throws(() => core.validatePlan({ version: 1, command: "FAKE", terminal_command: "FAKE", actions: [] }), /Unknown/);
  assert.throws(() => core.validatePlan({
    version: 1, command: "GF", terminal_command: "AAPL US EQ GF",
    actions: [{ feature: "delete account", operation: "click", value: true }]
  }), /Unsupported/);
});
