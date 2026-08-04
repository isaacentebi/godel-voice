import assert from "node:assert/strict";
import test from "node:test";
import {
  WORKFLOW_PLAN_PREFIX,
  buildAutomationPlan,
  buildWorkflowPlan,
  canonicalStringify,
  encodeAutomationMarker,
  encodeWorkflowMarker,
  parseWorkflowMarker,
  validateWorkflowPlan
} from "../src/automation-plan.mjs";

function intent(ticker, command, actions = []) {
  return {
    kind: "execute", confidence: 0.99, command, query: null,
    security: { spoken_name: ticker, ticker, venue: "US", asset_class: "EQ", needs_resolution: false },
    arguments: [], post_open_actions: actions, clarification: null, reason: "Workflow test."
  };
}

test("preserves the existing GV1 plan and marker contract", () => {
  const source = intent("AAPL", "DES");
  assert.deepEqual(buildAutomationPlan(source), {
    version: 1, command: "DES", terminal_command: "AAPL US EQ DES",
    security_query: null, arguments: [], actions: []
  });
  assert.match(encodeAutomationMarker(source), /^GV1:/);
});

test("compiles ordered required and optional command steps deterministically", () => {
  const requests = [
    intent("AMZN", "GF", [{ feature: "range", operation: "select", value: "5Y" }]),
    { intent: intent("META", "GF"), required: false, layout: { slot: 1, group: "valuation", focus: true } }
  ];
  const options = {
    failure_policy: "stop_on_required",
    layout: { mode: "tile", direction: "row", gap_px: 8, preset: "comparison", preserve_existing: true, new_screen: false }
  };
  const first = buildWorkflowPlan(requests, options);
  const second = buildWorkflowPlan(requests, options);
  assert.deepEqual(first, second);
  assert.equal(first.steps[0].id, "step-1");
  assert.equal(first.steps[0].failure_policy, "stop");
  assert.equal(first.steps[1].required, false);
  assert.equal(first.steps[1].failure_policy, "continue");
  assert.deepEqual(first.steps[1].layout, { slot: 1, group: "valuation", focus: true, placement: null });
  assert.equal(first.layout.mode, "tile");
  assert.equal(first.layout.preset, "comparison");
});

test("carries unresolved security queries and command arguments into a step", () => {
  const source = intent("IGNORED", "EM");
  source.security = { spoken_name: "Lantheus Holdings", ticker: null, venue: null, asset_class: null, needs_resolution: true };
  const plan = buildWorkflowPlan(source);
  assert.equal(plan.steps[0].terminal_command, null);
  assert.equal(plan.steps[0].security_query, "Lantheus Holdings");
  assert.deepEqual(plan.steps[0].arguments, []);

  const chart = intent("AAPL", "G");
  chart.arguments = ["1h"];
  const chartPlan = buildWorkflowPlan(chart);
  assert.equal(chartPlan.steps[0].terminal_command, "AAPL US EQ G 1h");
  assert.deepEqual(chartPlan.steps[0].arguments, ["1h"]);
});

test("round trips canonical GV2 markers", () => {
  const marker = encodeWorkflowMarker([intent("AAPL", "DES"), intent("MSFT", "FA")]);
  assert(marker.startsWith(WORKFLOW_PLAN_PREFIX));
  assert.deepEqual(parseWorkflowMarker(marker), buildWorkflowPlan([intent("AAPL", "DES"), intent("MSFT", "FA")]));
  assert.equal(marker, encodeWorkflowMarker([intent("AAPL", "DES"), intent("MSFT", "FA")]));
  assert.equal(canonicalStringify({ z: 1, a: { y: 2, x: 3 } }), '{"a":{"x":3,"y":2},"z":1}');
});

test("compiles ordered close-and-replace workflows with security targeting", () => {
  const plan = buildWorkflowPlan([
    { kind: "control", operation: "close", target: { mode: "command", command: "EM", security: "META" } },
    intent("META", "OMON")
  ], { layout: { preset: "options", preserve_existing: true, new_screen: false } });
  assert.deepEqual(plan.steps[0].target, { mode: "command", command: "EM", security: "META" });
  assert.equal(plan.steps[0].operation, "close");
  assert.equal(plan.steps[1].terminal_command, "META US EQ OMON");
});

test("compiles existing-panel configuration without reopening the command", () => {
  const plan = buildWorkflowPlan([{
    kind: "configure",
    target: { mode: "focused", command: "GF", security: "META" },
    actions: [
      { feature: "add company", operation: "add", value: "MSFT" },
      { feature: "range", operation: "select", value: "5Y" }
    ]
  }]);
  assert.equal(plan.steps[0].kind, "configure");
  assert.deepEqual(plan.steps[0].target, { mode: "focused", command: "GF", security: "META" });
  assert.equal(plan.steps[0].actions.length, 2);
  assert.equal(plan.steps[0].failure_policy, "stop");
  assert.throws(() => buildWorkflowPlan({ kind: "configure", target: { mode: "last", command: "EM", security: "META" }, actions: [{ feature: "range", operation: "select", value: "5Y" }] }), /Unsupported EM feature/);
  assert.throws(() => buildWorkflowPlan({ kind: "configure", target: { mode: "last", command: "GF", security: null }, actions: [] }), /at least one action/);
});

test("allows only the live-proven contextual G one-hour resolution", () => {
  const plan = buildWorkflowPlan({
    kind: "configure", target: { mode: "command", command: "G", security: "AAPL" },
    actions: [{ feature: "resolution", operation: "select", value: "1H" }]
  });
  assert.deepEqual(plan.steps[0].actions, [{ feature: "resolution", operation: "select", value: "1h" }]);
  assert.throws(() => buildWorkflowPlan({
    kind: "configure", target: { mode: "command", command: "G", security: "AAPL" },
    actions: [{ feature: "resolution", operation: "select", value: "1d" }]
  }), /only the independently proven 1h/);
});

test("canonicalizes the live-verified EM metric selector and rejects other controls", () => {
  const sales = intent("META", "EM", [{ feature: "metric", operation: "select", value: "revenue" }]);
  const plan = buildWorkflowPlan(sales);
  assert.deepEqual(plan.steps[0].actions, [{ feature: "metric", operation: "select", value: "Sales" }]);

  const configure = buildWorkflowPlan({
    kind: "configure", target: { mode: "last", command: "EM", security: "META" },
    actions: [{ feature: "metric", operation: "select", value: "cfo" }]
  });
  assert.deepEqual(configure.steps[0].actions, [{ feature: "metric", operation: "select", value: "Cash Flow From Operations" }]);

  assert.throws(() => buildWorkflowPlan(intent("META", "EM", [
    { feature: "chart", operation: "select", value: "growth" }
  ])), /EM|Unsupported/);
});

test("canonicalizes MOST result counts and rejects other filters", () => {
  const most = intent("IGNORED", "MOST", [{ feature: "results", operation: "select", value: "50" }]);
  most.security = null;
  assert.deepEqual(buildWorkflowPlan(most).steps[0].actions, [{ feature: "results", operation: "select", value: 50 }]);
  most.post_open_actions = [{ feature: "results", operation: "select", value: 12 }];
  assert.throws(() => buildWorkflowPlan(most), /MOST result count/);
});

test("canonicalizes HALT tabs in workflow plans and rejects every other HALT action", () => {
  const active = intent("IGNORED", "HALT", [{ feature: "tab", operation: "select", value: "active" }]);
  active.security = null;
  const plan = buildWorkflowPlan(active);
  assert.deepEqual(plan.steps[0].actions, [{ feature: "tab", operation: "select", value: "Active" }]);

  const invalid = intent("IGNORED", "HALT", [{ feature: "tab", operation: "select", value: "Pending" }]);
  invalid.security = null;
  assert.throws(() => buildWorkflowPlan(invalid), /Unsupported HALT tab/);
});

test("canonicalizes HMAP views and rejects unverified heatmap controls", () => {
  const table = intent("IGNORED", "HMAP", [{ feature: "view", operation: "select", value: "table" }]);
  table.security = null;
  const plan = buildWorkflowPlan(table);
  assert.deepEqual(plan.steps[0].actions, [{ feature: "view", operation: "select", value: "Table" }]);

  const unsupported = intent("IGNORED", "HMAP", [{ feature: "color mode", operation: "select", value: "Manual" }]);
  unsupported.security = null;
  assert.throws(() => buildWorkflowPlan(unsupported), /HMAP|Automation|Unsupported/);
});

test("canonicalizes HDS views for open and existing-panel workflows", () => {
  const opened = buildWorkflowPlan(intent("META", "HDS", [{ feature: "view", operation: "select", value: "treemap" }]));
  assert.deepEqual(opened.steps[0].actions, [{ feature: "view", operation: "select", value: "Treemap" }]);
  const configured = buildWorkflowPlan({
    kind: "configure", target: { mode: "command", command: "HDS", security: "META" },
    actions: [{ feature: "view", operation: "select", value: "bubble" }]
  });
  assert.deepEqual(configured.steps[0].actions, [{ feature: "view", operation: "select", value: "Bubble" }]);
  assert.throws(() => buildWorkflowPlan(intent("META", "HDS", [{ feature: "view", operation: "select", value: "Chart" }])), /HDS view/);
});

test("canonicalizes EQS Run and Clear workflows", () => {
  for (const operation of ["run", "clear"]) {
    const source = intent("IGNORED", "EQS", [{ feature: "screen", operation, value: null }]);
    source.security = null;
    assert.deepEqual(buildWorkflowPlan(source).steps[0].actions, [{ feature: "screen", operation, value: null }]);
  }
  assert.throws(() => buildWorkflowPlan({
    kind: "configure", target: { mode: "command", command: "EQS", security: null },
    actions: [{ feature: "screen", operation: "run", value: "unsafe" }]
  }), /EQS/);
});

test("canonicalizes strict News query configuration", () => {
  const configured = buildWorkflowPlan({
    kind: "configure", target: { mode: "command", command: "N", security: null },
    actions: [{ feature: "query", operation: "set", value: "  apple   trade secrets " }]
  });
  assert.deepEqual(configured.steps[0].actions, [{ feature: "query", operation: "set", value: "apple trade secrets" }]);
  assert.throws(() => buildWorkflowPlan({
    kind: "configure", target: { mode: "command", command: "N", security: null },
    actions: [{ feature: "sources", operation: "exclude", value: "Reuters" }]
  }), /Unsupported N feature/);
});

test("canonicalizes only rigorous structured EQS range payloads", () => {
  const action = {
    feature: "range_filter", operation: "add",
    value: { field: "p/e (fwd)", minimum: 5, maximum: 25 }
  };
  const configured = buildWorkflowPlan({
    kind: "configure", target: { mode: "command", command: "EQS", security: null }, actions: [action]
  });
  assert.deepEqual(configured.steps[0].actions, [{
    feature: "range_filter", operation: "add",
    value: { field: "P/E (Fwd)", minimum: 5, maximum: 25 }
  }]);

  const opened = intent("IGNORED", "EQS", [{
    feature: "range_filter", operation: "add",
    value: { field: "Market Cap (USD)", minimum: 1e9, maximum: null }
  }]);
  opened.security = null;
  assert.deepEqual(buildWorkflowPlan(opened).steps[0].actions[0].value, {
    field: "Market Cap (USD)", minimum: 1e9, maximum: null
  });
});

test("EQS structured ranges fail closed on every malformed shape", () => {
  const build = value => buildWorkflowPlan({
    kind: "configure", target: { mode: "command", command: "EQS", security: null },
    actions: [{ feature: "range_filter", operation: "add", value }]
  });
  for (const malformed of [
    null, [], "5 to 25",
    { field: "P/E (Fwd)", minimum: 5 },
    { field: "P/E (Fwd)", minimum: 5, maximum: 25, surprise: true },
    { field: "PEG", minimum: 0, maximum: 2 },
    { field: "P/E Fwd", minimum: 5, maximum: 25 },
    { field: "P/E (Fwd)", minimum: null, maximum: null },
    { field: "P/E (Fwd)", minimum: 30, maximum: 10 },
    { field: "P/E (Fwd)", minimum: "5", maximum: 25 },
    { field: "P/E (Fwd)", minimum: NaN, maximum: 25 },
    { field: "P/E (Fwd)", minimum: 5, maximum: Infinity }
  ]) assert.throws(() => build(malformed), /EQS|object|missing|unknown field|finite|minimum|range/);

  assert.throws(() => buildWorkflowPlan({
    kind: "configure", target: { mode: "command", command: "EQS", security: null },
    actions: [{ feature: "range_filter", operation: "select", value: { field: "P/E (Fwd)", minimum: 5, maximum: 25 } }]
  }), /require add/);
  assert.throws(() => buildWorkflowPlan({
    kind: "configure", target: { mode: "command", command: "GF", security: null },
    actions: [{ feature: "range", operation: "select", value: { field: "P/E (Fwd)", minimum: 5, maximum: 25 } }]
  }), /Invalid value/);
});

test("strongly rejects malformed workflow plans", () => {
  const valid = buildWorkflowPlan(intent("AAPL", "DES"));
  assert.throws(() => validateWorkflowPlan({ ...valid, extra: true }), /unknown field/);
  assert.throws(() => validateWorkflowPlan({ ...valid, steps: [valid.steps[0], valid.steps[0]] }), /Duplicate/);
  assert.throws(() => validateWorkflowPlan({ ...valid, steps: [{ ...valid.steps[0], terminal_command: null }] }), /exactly one/);
  assert.throws(() => validateWorkflowPlan({ ...valid, steps: [{ ...valid.steps[0], command: "FAKE" }] }), /Unknown Godel command/);
  assert.throws(() => validateWorkflowPlan({ ...valid, failure_policy: "stop_on_any", steps: [{ ...valid.steps[0], failure_policy: "continue" }] }), /cannot continue/);
  assert.throws(() => parseWorkflowMarker("GV2:{bad json"), /JSON/);
  assert.equal(parseWorkflowMarker("GV1:{}"), null);
});
