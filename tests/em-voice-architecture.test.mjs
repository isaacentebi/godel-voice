import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { compileEMFollowup } from "../src/commands/em-followup.mjs";
import { EM_CHART_MODES, EM_DOCUMENTED_METRICS, EM_GROWTH_MODES, EM_SERIES, EM_UNBOUND_FEATURES, EM_VALUATIONS, normalizeEMUnboundAction } from "../src/commands/em-actions.mjs";
import { validateWorkflowPlan } from "../src/workflow-plan.mjs";

const target = { mode: "command", command: "EM", security: null };

test("EM publishes exact documented metrics and valuation rows", () => {
  assert.deepEqual(EM_DOCUMENTED_METRICS, ["Sales","EBITDA","Net Income","EPS (GAAP)","Total Assets","Current Assets","Current Liabilities","Shareholder Equity","Cash Flow From Operations","Cash Flow From Investing","Cash Flow From Financing"]);
  assert.deepEqual(EM_GROWTH_MODES, ["YoY % Growth", "PoP % Growth"]);
  assert.deepEqual(EM_CHART_MODES, ["Values Chart", "Growth Chart"]);
  assert.deepEqual(EM_SERIES, ["Historical", "Estimates"]);
  assert.deepEqual(EM_VALUATIONS, ["P/E","P/B","P/S","P/CF","EV/EBITDA","EV/Sales","EV/CF","EV/FCF","Dividend Yield"]);
  assert.deepEqual(EM_UNBOUND_FEATURES, ["growth", "chart", "series", "valuation"]);
});

test("every documented metric compiles to the preserved live selector", () => {
  const speech = new Map([
    ["Sales","sales"],["EBITDA","e bit duh"],["Net Income","net income"],["EPS (GAAP)","e p s gaap"],
    ["Total Assets","total assets"],["Current Assets","current assets"],["Current Liabilities","current liabilities"],
    ["Shareholder Equity","shareholder equity"],["Cash Flow From Operations","cfo"],
    ["Cash Flow From Investing","cfi"],["Cash Flow From Financing","cff"]
  ]);
  for (const [metric, phrase] of speech) {
    const draft = compileEMFollowup("EM", phrase);
    assert.deepEqual(draft.actions, [{ feature: "metric", operation: "select", value: metric }], phrase);
    assert.equal(draft.ready_for_live_executor, true, phrase);
  }
});

test("metric corrections supersede but uncorrected metrics conflict", () => {
  assert.equal(compileEMFollowup("EM", "e bit duh no sorry sales").actions[0].value, "Sales");
  const conflict = compileEMFollowup("EM", "sales and EBITDA");
  assert.match(conflict.blockers.join(" "), /Conflicting EM metrics/);
  assert.equal(conflict.configure_step_draft, null);
});

test("growth and chart modes are exact, correction-aware, and disabled", () => {
  const draft = compileEMFollowup("EM", "EBITDA year over year growth chart");
  assert.deepEqual(draft.actions, [
    { feature: "metric", operation: "select", value: "EBITDA" },
    { feature: "growth", operation: "select", value: "YoY % Growth" },
    { feature: "chart", operation: "select", value: "Growth Chart" }
  ]);
  assert.equal(draft.ready_for_live_executor, false);
  assert.equal(compileEMFollowup("EM", "yoy no sorry period over period").actions[0].value, "PoP % Growth");
  assert.equal(compileEMFollowup("EM", "values chart no sorry growth chart").actions[0].value, "Growth Chart");
  for (const speech of ["YoY and period over period", "values chart and growth chart"]) {
    const result = compileEMFollowup("EM", speech);
    assert.ok(result.blockers.length, speech);
    assert.equal(result.configure_step_draft, null);
  }
});

test("historical and estimates visibility is explicit and contradiction-safe", () => {
  assert.deepEqual(compileEMFollowup("EM", "historical only").actions, [
    { feature: "series", operation: "show", value: "Historical" },
    { feature: "series", operation: "hide", value: "Estimates" }
  ]);
  assert.deepEqual(compileEMFollowup("EM", "historical and estimates").actions, [
    { feature: "series", operation: "show", value: "Historical" },
    { feature: "series", operation: "show", value: "Estimates" }
  ]);
  const contradiction = compileEMFollowup("EM", "show estimates and hide estimates");
  assert.match(contradiction.blockers.join(" "), /both shown and hidden/);
});

test("every valuation ratio is a read-only multiple, never a metric or percentage", () => {
  const speech = new Map([["P/E","pee e"],["P/B","price to book"],["P/S","price to sales"],["P/CF","price to cash flow"],["EV/EBITDA","EV over e bit duh"],["EV/Sales","EV to sales"],["EV/CF","EV over cash flow"],["EV/FCF","EV over free cash flow"]]);
  for (const [row, phrase] of speech) {
    const action = compileEMFollowup("EM", `read ${phrase} multiple`).actions[0];
    assert.deepEqual(action, { feature: "valuation", operation: "read", value: { row, section: "Multiples", semantic_unit: "Multiple" } }, phrase);
  }
  assert.match(compileEMFollowup("EM", "show pee e as a percentage").blockers.join(" "), /not a percentage/);
});

test("Dividend Yield is read in Multiples section with percent semantics", () => {
  const action = compileEMFollowup("EM", "read dividend yield percentage").actions[0];
  assert.deepEqual(action.value, { row: "Dividend Yield", section: "Multiples", semantic_unit: "Percent" });
  assert.match(compileEMFollowup("EM", "show dividend yield multiple").blockers.join(" "), /not a valuation multiple/);
});

test("matrix metrics and valuation rows cannot be conflated in one action", () => {
  const draft = compileEMFollowup("EM", "select EBITDA and show P E multiples");
  assert.match(draft.blockers.join(" "), /different surfaces/);
  assert.equal(draft.configure_step_draft, null);
});

test("validator strictly rejects valuation unit corruption", () => {
  assert.throws(() => normalizeEMUnboundAction({ feature: "valuation", operation: "read", value: { row: "P/E", section: "Multiples", semantic_unit: "Percent" } }), /Multiple semantics/);
  assert.throws(() => normalizeEMUnboundAction({ feature: "valuation", operation: "read", value: { row: "Dividend Yield", section: "Multiples", semantic_unit: "Multiple" } }), /Percent semantics/);
});

test("workflow keeps metric and exact valuation reads live while visual controls stay disabled", () => {
  const metricPlan = validateWorkflowPlan({ version: 2, failure_policy: "stop_on_any", layout: null, steps: [{ id: "em-1", kind: "configure", target, actions: [{ feature: "metric", operation: "select", value: "EBITDA" }], required: true }] });
  assert.equal(metricPlan.steps[0].actions[0].value, "EBITDA");
  const valuationPlan = validateWorkflowPlan({ version: 2, failure_policy: "stop_on_any", layout: null, steps: [{ id: "em-v", kind: "configure", target, actions: [{ feature: "valuation", operation: "read", value: { row: "P/E", section: "Multiples", semantic_unit: "Multiple" } }], required: true }] });
  assert.equal(valuationPlan.steps[0].actions[0].value.row, "P/E");
  for (const action of [
    { feature: "growth", operation: "select", value: "YoY % Growth" },
    { feature: "chart", operation: "select", value: "Growth Chart" },
    { feature: "series", operation: "show", value: "Estimates" }
  ]) assert.throws(() => validateWorkflowPlan({ version: 2, failure_policy: "stop_on_any", layout: null, steps: [{ id: "em-2", kind: "configure", target, actions: [action], required: true }] }), /schema-valid but not live-enabled/);
});

test("schema marks metric selection and exact valuation reads live", () => {
  const schema = JSON.parse(fs.readFileSync(new URL("../catalog/contracts/em-nested.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.oneOf[0]["x-runtime-enabled"], true);
  assert.equal(schema.oneOf[4]["x-runtime-enabled"], true);
  assert.ok(schema.oneOf.slice(1, 4).every(entry => entry["x-runtime-enabled"] === false));
  assert.equal(schema.oneOf[4].properties.value.oneOf[0].properties.semantic_unit.const, "Multiple");
  assert.equal(schema.oneOf[4].properties.value.oneOf[1].properties.row.const, "Dividend Yield");
  assert.equal(schema.oneOf[4].properties.value.oneOf[1].properties.semantic_unit.const, "Percent");
  assert.match(schema["x-valuation-semantics"], /multiples/);
});
