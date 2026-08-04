import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { ERN_DISPLAY_FIELDS, ERN_FEATURES, ERN_PERIODS, normalizeERNAction, normalizeGroundedForwardPE } from "../src/ern-actions.mjs";
import { compileERNFollowup } from "../src/ern-followup.mjs";
import { validateWorkflowPlan } from "../src/workflow-plan.mjs";

const target = { mode:"command", command:"ERN", security:null };

test("ERN publishes exact periods, fields and action families", () => {
  assert.deepEqual(ERN_PERIODS, ["Quarterly","Annual"]);
  assert.deepEqual(ERN_DISPLAY_FIELDS, ["Analyst Count","Low EPS","High EPS","Average EPS","Forward P/E","EPS YoY","Earnings History","Estimate vs Actual","Beat/Miss Percentage"]);
  assert.deepEqual(ERN_FEATURES, ["date_range","period","display"]);
});

test("noisy ERN speech compiles exact display intent without inventing data", () => {
  const draft = compileERNFollowup({ command:"ERN", target }, "show earnins esty mates quarterly analyst count low eps high eps average eps forward pee e");
  assert.deepEqual(draft.actions, [
    { feature:"period", operation:"select", value:"Quarterly" },
    { feature:"display", operation:"select", value:["Analyst Count","Low EPS","High EPS","Average EPS","Forward P/E"] }
  ]);
  assert.equal(draft.grounded_narration, null);
  assert.equal(draft.ready_for_live_executor, false);
});

test("all remaining documented tables compile as display fields", () => {
  const draft = compileERNFollowup("ERN", "display eps year over year earnings history estimates versus actual beat miss percentage");
  assert.deepEqual(draft.actions[0].value, ["EPS YoY","Earnings History","Estimate vs Actual","Beat/Miss Percentage"]);
});

test("exact ISO ranges validate calendar dates and ordering", () => {
  assert.deepEqual(compileERNFollowup("ERN", "from 2026-01-01 to 2028-12-31").actions[0].value, { start:"2026-01-01", end:"2028-12-31" });
  assert.throws(() => normalizeERNAction({ feature:"date_range", operation:"set", value:{ start:"2026-02-30", end:"2026-03-01" } }), /not a calendar date/);
  assert.match(compileERNFollowup("ERN", "from 2028-01-01 to 2026-01-01").blockers.join(" "), /start date cannot be after/);
});

test("ambiguous fiscal periods clarify instead of guessing dates", () => {
  for (const speech of ["last year", "next quarter", "through 2028", "since 2025"]) {
    const draft = compileERNFollowup("ERN", speech);
    assert.match(draft.blockers.join(" "), /ambiguous/, speech);
    assert.equal(draft.configure_step_draft, null);
  }
});

test("period corrections win and direct contradictions fail atomically", () => {
  assert.equal(compileERNFollowup("ERN", "quarterly no sorry annual").actions[0].value, "Annual");
  const conflict = compileERNFollowup("ERN", "quarterly and annual");
  assert.match(conflict.blockers.join(" "), /Conflicting ERN periods/);
  assert.equal(conflict.configure_step_draft, null);
});

test("contextual display additions preserve authoritative existing fields", () => {
  const draft = compileERNFollowup({ command:"ERN", current_config:{ period:"Annual", display_fields:["Average EPS","Forward P/E"] } }, "show analyst count");
  assert.deepEqual(draft.actions[0].value, ["Analyst Count","Average EPS","Forward P/E"]);
  assert.deepEqual(draft.current_config_preserved, { period:"Annual", display_fields:["Average EPS","Forward P/E"] });
});

test("existing grounded forward P E narration uses only supplied panel facts", () => {
  const draft = compileERNFollowup({ command:"ERN", grounded_facts:{ forward_pe:[{ period:"FY26", value:"18.4x" },{ period:"FY27", value:"17.3x" }] } }, "tell me the forward pee e");
  assert.deepEqual(draft.grounded_narration, { field:"Forward P/E", unit:"Multiple", source:"Godel ERN panel", facts:[{ period:"FY 26", value:"18.4x" },{ period:"FY 27", value:"17.3x" }] });
  assert.equal(draft.ready_for_grounded_narration, true);
  assert.equal(draft.actions.length, 0);
});

test("missing or corrupt forward P E facts never produce narration", () => {
  for (const context of [
    { command:"ERN" },
    { command:"ERN", grounded_facts:{ forward_pe:[{ period:"FY26", value:"999999x" }] } },
    { command:"ERN", grounded_facts:{ forward_pe:[{ period:"FY26", value:"18.4%" }] } }
  ]) {
    const draft = compileERNFollowup(context, "what is forward P E");
    assert.equal(draft.grounded_narration, null);
    assert.match(draft.blockers.join(" "), /will not be invented/);
  }
});

test("other value questions remain ungrounded while display requests remain distinct", () => {
  const read = compileERNFollowup("ERN", "what is average EPS");
  assert.match(read.blockers.join(" "), /No grounded ERN reader/);
  assert.equal(read.actions.length, 0);
  const display = compileERNFollowup("ERN", "show average EPS");
  assert.deepEqual(display.actions[0], { feature:"display", operation:"select", value:["Average EPS"] });
  assert.equal(display.grounded_narration, null);
});

test("grounded fact validator rejects synthetic labels and values", () => {
  assert.throws(() => normalizeGroundedForwardPE([{ period:"next year", value:"18x" }]), /period is not grounded/);
  assert.throws(() => normalizeGroundedForwardPE([{ period:"FY26", value:"about 18x" }]), /displayed multiple/);
});

test("compound unsupported read plus display action is atomic", () => {
  const draft = compileERNFollowup("ERN", "show annual and tell me average EPS");
  assert.ok(draft.actions.some(action => action.feature === "period"));
  assert.ok(draft.blockers.length);
  assert.equal(draft.configure_step_draft, null);
});

test("workflow recognizes every ERN display shape but enables none", () => {
  const actions = [
    { feature:"date_range", operation:"set", value:{ start:"2026-01-01", end:"2027-01-01" } },
    { feature:"period", operation:"select", value:"Annual" },
    { feature:"display", operation:"select", value:["Forward P/E"] }
  ];
  for (const action of actions) assert.throws(() => validateWorkflowPlan({ version:2, failure_policy:"stop_on_any", layout:null, steps:[{ id:"ern-1", kind:"configure", target, actions:[action], required:true }] }), /schema-valid but not live-enabled/);
});

test("schema records disabled controls and grounded-only narration", () => {
  const schema = JSON.parse(fs.readFileSync(new URL("../data/ern-nested.schema.json", import.meta.url), "utf8"));
  assert.equal(schema["x-runtime-enabled"], false);
  assert.match(schema["x-grounded-narration"], /Forward P\/E only/);
  assert.match(schema["x-no-invention"], /may be synthesized/);
});
