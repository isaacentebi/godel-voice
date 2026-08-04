import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { SI_DISPLAY_FIELDS, SI_FEATURES, normalizeSIAction, normalizeSIGroundedFacts } from "../src/si-actions.mjs";
import { compileSIFollowup } from "../src/si-followup.mjs";
import { validateWorkflowPlan } from "../src/workflow-plan.mjs";

const target = { mode:"command", command:"SI", security:null };
const facts = { report_date:"2026-07-31", short_interest_shares:12345678, days_to_cover:2.7, average_daily_volume_shares:4567890, latest_report_confirmed:true, source:"Godel SI panel" };

test("SI publishes exact fields and controls", () => {
  assert.deepEqual(SI_DISPLAY_FIELDS, ["Latest Report Date","Short Interest","Short Ratio / Days to Cover","Average Daily Volume"]);
  assert.deepEqual(SI_FEATURES, ["date_range","display","refresh"]);
});

test("noisy SI speech compiles all exact display fields", () => {
  const draft = compileSIFollowup("SI", "show short in terest latest report date day two cover and a d v");
  assert.deepEqual(draft.actions[0].value, SI_DISPLAY_FIELDS);
  assert.equal(draft.ready_for_live_executor, false);
  assert.equal(draft.grounded_narration, null);
});

test("exact ranges validate calendar dates and reject inversion", () => {
  assert.deepEqual(compileSIFollowup("SI", "from 2025-01-01 to 2026-07-31").actions[0].value, { from:"2025-01-01", to:"2026-07-31" });
  assert.throws(() => normalizeSIAction({ feature:"date_range", operation:"set", value:{ from:"2026-02-30", to:"2026-03-01" } }), /not a calendar date/);
  assert.match(compileSIFollowup("SI", "from 2026-08-01 to 2026-07-01").blockers.join(" "), /cannot be after/);
});

test("range corrections win and ambiguous relative dates clarify", () => {
  assert.deepEqual(compileSIFollowup("SI", "from 2025-01-01 to 2025-12-31 no sorry from 2026-01-01 to 2026-06-30").actions[0].value, { from:"2026-01-01", to:"2026-06-30" });
  for (const speech of ["last month", "past year", "since 2025"]) assert.match(compileSIFollowup("SI", speech).blockers.join(" "), /relative date ranges are ambiguous/);
});

test("field correction supersedes prior field", () => {
  const draft = compileSIFollowup("SI", "show short interest no sorry days to cover");
  assert.deepEqual(draft.actions[0].value, ["Short Ratio / Days to Cover"]);
});

test("contextual display additions preserve authoritative fields", () => {
  const draft = compileSIFollowup({ command:"SI", current_config:{ display_fields:["Latest Report Date","Short Interest"] } }, "show average daily volume");
  assert.deepEqual(draft.actions[0].value, ["Latest Report Date","Short Interest","Average Daily Volume"]);
});

test("refresh is exact, disabled, and can compose atomically", () => {
  const draft = compileSIFollowup("SI", "show latest report date and refresh");
  assert.deepEqual(draft.actions, [
    { feature:"display", operation:"select", value:["Latest Report Date"] },
    { feature:"refresh", operation:"refresh", value:null }
  ]);
  assert.throws(() => normalizeSIAction({ feature:"refresh", operation:"refresh", value:true }), /null value/);
});

test("grounded narration reads only exact confirmed latest panel facts", () => {
  const draft = compileSIFollowup({ command:"SI", grounded_facts:facts }, "tell me latest report date short interest days to cover and average daily volume");
  assert.deepEqual(draft.grounded_narration, { fields:SI_DISPLAY_FIELDS, cadence:"FINRA twice-monthly", facts });
  assert.equal(draft.ready_for_grounded_narration, true);
  assert.equal(draft.actions.length, 0);
});

test("unconfirmed, corrupt, or absent facts never produce values", () => {
  for (const grounded_facts of [undefined, { ...facts, latest_report_confirmed:false }, { ...facts, short_interest_shares:-1 }, { ...facts, source:"model" }]) {
    const draft = compileSIFollowup({ command:"SI", grounded_facts }, "what is the short interest");
    assert.equal(draft.grounded_narration, null);
    assert.match(draft.blockers.join(" "), /will not be invented/);
  }
});

test("real-time and today's short interest explicitly respect FINRA cadence", () => {
  for (const speech of ["what is today's short interest", "tell me live short interest", "current intraday short interest"]) {
    const draft = compileSIFollowup({ command:"SI", grounded_facts:facts }, speech);
    assert.match(draft.blockers.join(" "), /twice monthly/);
    assert.equal(draft.ready_for_grounded_narration, false);
  }
});

test("fact validator rejects fabricated units and impossible shapes", () => {
  assert.throws(() => normalizeSIGroundedFacts({ ...facts, days_to_cover:"2.7" }), /exact non-negative number/);
  assert.throws(() => normalizeSIGroundedFacts({ ...facts, report_date:"July 31" }), /ISO/);
});

test("compound bad range plus refresh never emits an executable step", () => {
  const draft = compileSIFollowup("SI", "from 2026-08-01 to 2026-07-01 and refresh");
  assert.ok(draft.actions.some(action => action.feature === "refresh"));
  assert.ok(draft.blockers.length);
  assert.equal(draft.configure_step_draft, null);
});

test("workflow recognizes every SI control but enables none", () => {
  const actions = [
    { feature:"date_range", operation:"set", value:{ from:"2026-01-01", to:"2026-07-01" } },
    { feature:"display", operation:"select", value:["Short Interest"] },
    { feature:"refresh", operation:"refresh", value:null }
  ];
  for (const action of actions) assert.throws(() => validateWorkflowPlan({ version:2, failure_policy:"stop_on_any", layout:null, steps:[{ id:"si-1", kind:"configure", target, actions:[action], required:true }] }), /schema-valid but not live-enabled/);
});

test("schema records cadence, grounded source, and disabled runtime", () => {
  const schema = JSON.parse(fs.readFileSync(new URL("../data/contracts/si-nested.schema.json", import.meta.url), "utf8"));
  assert.equal(schema["x-runtime-enabled"], false);
  assert.equal(schema["x-data-cadence"], "FINRA twice-monthly");
  assert.match(schema["x-no-invention"], /exact current Godel SI panel facts/);
});
