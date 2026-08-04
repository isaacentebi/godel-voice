import assert from "node:assert/strict";
import test from "node:test";
import { buildAutomationPlan, buildWorkflowPlan, encodeAutomationMarker } from "../src/automation-plan.mjs";

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

test("allowlists only documented HALT tab selection", () => {
  const source = intent("HALT", [{ feature: "tab", operation: "select", value: "active" }]);
  source.security = null;
  const plan = buildAutomationPlan(source);
  assert.equal(plan.terminal_command, "HALT");
  assert.deepEqual(plan.actions, [{ feature: "tab", operation: "select", value: "Active" }]);
  const parsed = core.parseMarker(`GV1:${JSON.stringify(plan)}`);
  assert.deepEqual(parsed.actions, [{ feature: "tab", operation: "select", value: "Active" }]);

  for (const bad of [
    [{ feature: "tab", operation: "delete", value: "Active" }],
    [{ feature: "tab", operation: "select", value: "Pending" }],
    [{ feature: "refresh", operation: "click", value: null }]
  ]) {
    const invalid = intent("HALT", bad);
    invalid.security = null;
    assert.throws(() => buildAutomationPlan(invalid), /HALT|unknown UI feature|Unsupported/);
  }
});

test("allowlists only verified HMAP Map/Table view selection", () => {
  const source = intent("HMAP", [{ feature: "view", operation: "select", value: "table" }]);
  source.security = null;
  const plan = buildAutomationPlan(source);
  assert.equal(plan.terminal_command, "HMAP");
  assert.deepEqual(plan.actions, [{ feature: "view", operation: "select", value: "Table" }]);
  const parsed = core.parseMarker(`GV1:${JSON.stringify(plan)}`);
  assert.deepEqual(parsed.actions, [{ feature: "view", operation: "select", value: "Table" }]);

  for (const bad of [
    [{ feature: "view", operation: "delete", value: "Map" }],
    [{ feature: "view", operation: "select", value: "Grid" }],
    [{ feature: "size-by metric", operation: "select", value: "Market Cap" }]
  ]) {
    const invalid = intent("HMAP", bad);
    invalid.security = null;
    assert.throws(() => buildAutomationPlan(invalid), /HMAP|unknown UI feature|Unsupported/);
  }
});

test("allowlists exact HDS Table Treemap and Bubble views", () => {
  for (const value of ["table", "treemap", "bubble"]) {
    const plan = buildAutomationPlan(intent("HDS", [{ feature: "view", operation: "select", value }]));
    assert.equal(plan.terminal_command, "AAPL US EQ HDS");
    assert.equal(plan.actions[0].value, value[0].toUpperCase() + value.slice(1));
    assert.equal(core.parseMarker(`GV1:${JSON.stringify(plan)}`).actions[0].value, plan.actions[0].value);
  }
  assert.throws(() => buildAutomationPlan(intent("HDS", [{ feature: "view", operation: "select", value: "Chart" }])), /HDS view/);
});

test("allowlists only EQS Run and Clear screen actions", () => {
  for (const operation of ["run", "clear"]) {
    const source = intent("EQS", [{ feature: "screen", operation, value: null }]);
    source.security = null;
    const plan = buildAutomationPlan(source);
    assert.equal(plan.terminal_command, "EQS");
    assert.deepEqual(plan.actions, [{ feature: "screen", operation, value: null }]);
  }
  const bad = intent("EQS", [{ feature: "screen", operation: "delete", value: null }]);
  bad.security = null;
  assert.throws(() => buildAutomationPlan(bad), /EQS/);
});

test("allowlists only the exact per-window News query", () => {
  const source = intent("N", [{ feature: "query", operation: "set", value: "  Apple   trade secrets  " }]);
  source.security = null;
  const plan = buildAutomationPlan(source);
  assert.equal(plan.terminal_command, "N");
  assert.deepEqual(plan.actions, [{ feature: "query", operation: "set", value: "Apple trade secrets" }]);
  assert.deepEqual(core.parseMarker(`GV1:${JSON.stringify(plan)}`).actions, plan.actions);
  for (const action of [
    { feature: "query", operation: "set", value: "" },
    { feature: "query", operation: "clear", value: null },
    { feature: "sources", operation: "exclude", value: "Reuters" }
  ]) {
    const invalid = intent("N", [action]); invalid.security = null;
    assert.throws(() => buildAutomationPlan(invalid), /News|unknown UI feature|query/);
  }
});

test("EQS range objects round trip through server and browser validators", () => {
  const source = intent("EQS", [{
    feature: "range_filter", operation: "add",
    value: { field: "p/s (ttm)", minimum: null, maximum: 8 }
  }]);
  source.security = null;
  const plan = buildAutomationPlan(source);
  assert.deepEqual(plan.actions, [{
    feature: "range_filter", operation: "add",
    value: { field: "P/S (TTM)", minimum: null, maximum: 8 }
  }]);
  assert.deepEqual(core.parseMarker(`GV1:${JSON.stringify(plan)}`).actions, plan.actions);

  const workflow = buildWorkflowPlan({
    kind: "configure", target: { mode: "command", command: "EQS", security: null }, actions: plan.actions
  });
  assert.deepEqual(core.parseMarker(`GV2:${JSON.stringify(workflow)}`).steps[0].actions, plan.actions);

  const country = intent("EQS", [{
    feature: "list_filter", operation: "add",
    value: { field: "HQ Country", items: ["United States"] }
  }]);
  country.security = null;
  const countryPlan = buildAutomationPlan(country);
  assert.deepEqual(core.parseMarker(`GV1:${JSON.stringify(countryPlan)}`).actions, countryPlan.actions);
});

test("browser preserves primitive-only values for every non-EQS command", () => {
  const structured = { field: "P/E (Fwd)", minimum: 5, maximum: 25 };
  for (const [command, feature, operation] of [
    ["GF", "range", "select"], ["HDS", "view", "select"], ["MOST", "results", "select"],
    ["HALT", "tab", "select"], ["HMAP", "view", "select"], ["IMAP", "view", "select"], ["EM", "metric", "select"]
  ]) {
    assert.throws(() => core.validatePlan({
      version: 1, command, terminal_command: `CONTEXT US EQ ${command}`,
      security_query: null, arguments: [], actions: [{ feature, operation, value: structured }]
    }), /Invalid value/);
  }
});

test("browser independently validates exact EM valuation rows, sections and semantic units", () => {
  const validate = value => core.validatePlan({
    version: 1, command: "EM", terminal_command: "AMZN US EQ EM",
    security_query: null, arguments: [], actions: [{ feature: "valuation", operation: "read", value }]
  });
  assert.deepEqual(validate({ row: "p/e", section: "Multiples", semantic_unit: "Multiple" }).actions[0].value,
    { row: "P/E", section: "Multiples", semantic_unit: "Multiple" });
  assert.deepEqual(validate({ row: "Dividend Yield", section: "Multiples", semantic_unit: "Percent" }).actions[0].value,
    { row: "Dividend Yield", section: "Multiples", semantic_unit: "Percent" });
  for (const value of [
    { row: "P/E", section: "Multiples", semantic_unit: "Percent" },
    { row: "Dividend Yield", section: "Multiples", semantic_unit: "Multiple" },
    { row: "NOPAT", section: "Multiples", semantic_unit: "Multiple" },
    { row: "P/E", section: "Growth", semantic_unit: "Multiple" },
    { row: "P/E", section: "Multiples", semantic_unit: "Multiple", injected: true }
  ]) assert.throws(() => validate(value), /EM/);
});

test("browser rejects malformed EQS structured payloads independently", () => {
  const validate = value => core.validatePlan({
    version: 1, command: "EQS", terminal_command: "EQS", security_query: null, arguments: [],
    actions: [{ feature: "range_filter", operation: "add", value }]
  });
  for (const value of [
    {}, { field: "PEG", minimum: 0, maximum: 2 },
    { field: "P/E (Fwd)", minimum: null, maximum: null },
    { field: "P/E (Fwd)", minimum: 25, maximum: 5 },
    { field: "P/E (Fwd)", minimum: "5", maximum: 25 },
    { field: "P/E (Fwd)", minimum: 5, maximum: 25, extra: 1 }
  ]) assert.throws(() => validate(value), /EQS/);
});

test("carries an unresolved company name to the Godel tab resolver", () => {
  const source = intent("EM");
  source.security = {
    spoken_name: "Lantheus Holdings", ticker: null, venue: null,
    asset_class: null, needs_resolution: true
  };
  const plan = buildAutomationPlan(source);
  assert.equal(plan.terminal_command, null);
  assert.equal(plan.security_query, "Lantheus Holdings");
  assert.deepEqual(plan.arguments, []);
  const parsed = core.parseMarker(`GV1:${JSON.stringify(plan)}`);
  assert.equal(parsed.security_query, "Lantheus Holdings");
});

test("validates canonical security identifiers filled by Godel", () => {
  assert.equal(core.canonicalSecurityPrefix("lnth us equity"), "LNTH US EQ");
  assert.equal(core.canonicalSecurityPrefix("BRK/B US EQ"), "BRK/B US EQ");
  assert.throws(() => core.canonicalSecurityPrefix("Lantheus"), /complete security identifier/);
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

test("browser parses an ordered GV2 workflow with placement", () => {
  const plan = {
    version: 2,
    failure_policy: "stop_on_required",
    layout: { preset: "market", preserve_existing: true, new_screen: false, gap_px: 12 },
    steps: [
      { id: "step-1", command: "HMAP", terminal_command: "HMAP", security_query: null, arguments: [], actions: [], required: true, failure_policy: "stop", layout: { placement: "left" } },
      { id: "step-2", command: "EM", terminal_command: "AMZN US EQ EM", security_query: null, arguments: [], actions: [], required: true, failure_policy: "stop", layout: { placement: "right" } }
    ]
  };
  const parsed = core.parseMarker(`GV2:${JSON.stringify(plan)}`);
  assert.equal(parsed.version, 2);
  assert.equal(parsed.steps[1].terminal_command, "AMZN US EQ EM");
  assert.equal(parsed.steps[0].layout.placement, "left");
});

test("browser validates control-only followups", () => {
  const plan = {
    version: 2,
    failure_policy: "stop_on_any",
    layout: { preset: "grid", preserve_existing: true, new_screen: false, gap_px: 12 },
    steps: [
      { id: "control-1", kind: "control", operation: "move", target: { mode: "command", command: "HMAP" }, value: "left", required: true, failure_policy: "stop" },
      { id: "control-2", kind: "control", operation: "maximize", target: { mode: "last", command: null }, value: null, required: true, failure_policy: "stop" }
    ]
  };
  const parsed = core.parseMarker(`GV2:${JSON.stringify(plan)}`);
  assert.equal(parsed.steps[0].kind, "control");
  assert.deepEqual(parsed.steps[0].target, { mode: "command", command: "HMAP", security: null });
  assert.equal(parsed.steps[1].operation, "maximize");
  assert.throws(() => core.parseMarker(`GV2:${JSON.stringify({
    ...plan,
    steps: [{ ...plan.steps[1], operation: "export", value: "csv" }]
  })}`), /does not use a value/);
});

test("browser parses allowlisted configure steps and fails closed for unsupported nested actions", () => {
  const configured = core.parseMarker(`GV2:${JSON.stringify({
    version: 2, failure_policy: "stop_on_required", layout: { preset: "comparison" },
    steps: [{
      id: "configure-1", kind: "configure",
      target: { mode: "focused", command: "GF", security: "META" },
      actions: [{ feature: "range", operation: "select", value: "5Y" }], required: true
    }]
  })}`);
  assert.equal(configured.steps[0].kind, "configure");
  assert.equal(configured.steps[0].target.command, "GF");
  assert.deepEqual(configured.steps[0].actions, [{ feature: "range", operation: "select", value: "5Y" }]);
  assert.throws(() => core.parseMarker(`GV2:${JSON.stringify({
    version: 2, failure_policy: "stop_on_required", layout: { preset: "grid" },
    steps: [{ id: "configure-1", kind: "configure", target: { mode: "last", command: "EM", security: "META" }, actions: [{ feature: "range", operation: "select", value: "5Y" }] }]
  })}`), /Unsupported EM feature: range/);

  const em = core.parseMarker(`GV2:${JSON.stringify({
    version: 2, failure_policy: "stop_on_required", layout: { preset: "research" },
    steps: [{ id: "configure-em", kind: "configure", target: { mode: "last", command: "EM", security: "META" }, actions: [{ feature: "metric", operation: "select", value: "Sales" }] }]
  })}`);
  assert.deepEqual(em.steps[0].actions, [{ feature: "metric", operation: "select", value: "Sales" }]);
});
