import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { compileFAFollowup, compileHPFollowup } from "../src/commands/fa-hp-followup.mjs";
import { EXPORT_FORMATS, FA_FEATURES, FA_PERIODICITIES, FA_STATEMENTS, HP_FEATURES, HP_PAGES, HP_RESOLUTIONS, normalizeFAAction, normalizeHPAction } from "../src/commands/fa-hp-actions.mjs";
import { validateWorkflowPlan } from "../src/workflow-plan.mjs";

const faTarget = { mode: "command", command: "FA", security: null };
const hpTarget = { mode: "command", command: "HP", security: null };

test("publishes only the documented FA and HP enums", () => {
  assert.deepEqual(FA_STATEMENTS, ["Income Statement", "Balance Sheet", "Cash Flow"]);
  assert.deepEqual(FA_PERIODICITIES, ["Quarterly", "Yearly"]);
  assert.deepEqual(HP_RESOLUTIONS, ["1D", "1H", "1M"]);
  assert.deepEqual(HP_PAGES, ["Previous", "Next"]);
  assert.deepEqual(EXPORT_FORMATS, ["Excel", "JSON"]);
  assert.deepEqual(FA_FEATURES, ["statement", "periodicity", "export"]);
  assert.deepEqual(HP_FEATURES, ["date_range", "resolution", "page", "export"]);
});

test("FA noisy speech compiles statement, periodicity, and receipt-gated export atomically", () => {
  const draft = compileFAFollowup({ command: "FA", target: faTarget }, "show the cash flo state ment yearly then export to ex cell");
  assert.deepEqual(draft.actions, [
    { feature: "statement", operation: "select", value: "Cash Flow" },
    { feature: "periodicity", operation: "select", value: "Yearly" },
    { feature: "export", operation: "download", value: { format: "Excel", statement: "Cash Flow", periodicity: "Yearly", receipt_required: true } }
  ]);
  assert.equal(draft.blockers.length, 0);
  assert.equal(draft.ready_for_live_executor, false);
});

test("FA preserves authoritative context for a short export followup", () => {
  const draft = compileFAFollowup({ command: "FA", current_config: { statement: "Balance Sheet", periodicity: "Quarterly" } }, "download this as j son");
  assert.deepEqual(draft.actions[0].value, { format: "JSON", statement: "Balance Sheet", periodicity: "Quarterly", receipt_required: true });
});

test("FA corrections supersede while uncorrected statement, period, and format contradictions block", () => {
  assert.equal(compileFAFollowup("FA", "income statement no sorry balance sheet").actions[0].value, "Balance Sheet");
  for (const speech of ["income statement and cash flow", "quarterly and yearly", "export Excel and JSON"]) {
    const draft = compileFAFollowup("FA", speech);
    assert.ok(draft.blockers.length, speech);
    assert.equal(draft.configure_step_draft, null);
  }
});

test("FA export refuses missing state and a missing receipt requirement", () => {
  assert.match(compileFAFollowup("FA", "export to Excel").blockers.join(" "), /statement and periodicity/);
  assert.throws(() => normalizeFAAction({ feature: "export", operation: "download", value: { format: "Excel", statement: "Cash Flow", periodicity: "Yearly", receipt_required: false } }), /verified download receipt/);
});

test("HP accepts strict ISO ranges and rejects invalid or inverted calendar dates", () => {
  const action = compileHPFollowup("HP", "from 2026-07-01 to 2026-07-31 daily").actions[0];
  assert.deepEqual(action.value, { start: "2026-07-01", end: "2026-07-31", anchor: null });
  assert.throws(() => normalizeHPAction({ feature: "date_range", operation: "set", value: { start: "2026-02-30", end: "2026-03-01", anchor: null } }), /not a calendar date/);
  const inverted = compileHPFollowup("HP", "from 2026-08-01 to 2026-07-01");
  assert.match(inverted.blockers.join(" "), /start date cannot be after/);
  assert.equal(inverted.configure_step_draft, null);
});

test("HP deterministic relative dates require and preserve current date plus timezone", () => {
  const context = { command: "HP", clock: { current_date: "2026-08-04", timezone: "America/Mexico_City" } };
  assert.deepEqual(compileHPFollowup(context, "show yesterday").actions[0].value, { start: "2026-08-03", end: "2026-08-03", anchor: context.clock });
  assert.deepEqual(compileHPFollowup(context, "past 7 days").actions[0].value, { start: "2026-07-29", end: "2026-08-04", anchor: context.clock });
  assert.match(compileHPFollowup("HP", "yesterday").blockers.join(" "), /current_date and timezone/);
  assert.match(compileHPFollowup(context, "last week").blockers.join(" "), /multiple calendar interpretations/);
});

test("HP intraday resolutions require authoritative entitlement", () => {
  assert.deepEqual(compileHPFollowup({ command: "HP", intraday_entitlement: true }, "one minute bars").actions[0].value, { resolution: "1M", entitlement: "Confirmed" });
  assert.match(compileHPFollowup("HP", "hourly prices").blockers.join(" "), /authoritative intraday entitlement/);
  assert.match(compileHPFollowup({ command: "HP", intraday_entitlement: false }, "one minute prices").blockers.join(" "), /unavailable/);
  assert.deepEqual(compileHPFollowup("HP", "daily prices").actions[0].value, { resolution: "1D", entitlement: "Not Required" });
});

test("HP corrections and page contradictions fail safely", () => {
  assert.equal(compileHPFollowup({ command: "HP", intraday_entitlement: true }, "one hour no sorry one minute").actions[0].value.resolution, "1M");
  const pages = compileHPFollowup("HP", "next page then previous page");
  assert.match(pages.blockers.join(" "), /Conflicting HP page directions/);
  assert.equal(pages.configure_step_draft, null);
});

test("HP export is bound to all authoritative loaded rows and a verified receipt", () => {
  const draft = compileHPFollowup({ command: "HP", loaded_rows: 237 }, "export every loaded row to JSON");
  assert.deepEqual(draft.actions[0].value, { format: "JSON", scope: "All Loaded Rows", expected_loaded_rows: 237, receipt_required: true });
  assert.match(compileHPFollowup("HP", "export all loaded rows to Excel").blockers.join(" "), /loaded-row count/);
  assert.throws(() => normalizeHPAction({ feature: "export", operation: "download", value: { format: "Excel", scope: "Current Page", expected_loaded_rows: 100, receipt_required: true } }), /All Loaded Rows/);
});

test("HP compound requests fail atomically when entitlement or export scope is unknown", () => {
  const draft = compileHPFollowup({ command: "HP", clock: { current_date: "2026-08-04", timezone: "America/Mexico_City" } }, "yesterday one minute and export Excel");
  assert.ok(draft.actions.some(action => action.feature === "date_range"));
  assert.ok(draft.blockers.length >= 2);
  assert.equal(draft.configure_step_draft, null);
});

test("workflow recognizes strict FA and HP actions but enables none", () => {
  const cases = [
    ["FA", faTarget, compileFAFollowup("FA", "quarterly").actions[0]],
    ["HP", hpTarget, compileHPFollowup("HP", "next page").actions[0]]
  ];
  for (const [, target, action] of cases) assert.throws(() => validateWorkflowPlan({ version: 2, failure_policy: "stop_on_any", layout: null, steps: [{ id: "x-1", kind: "configure", target, actions: [action], required: true }] }), /schema-valid but not live-enabled/);
});

test("schema keeps both surfaces disabled and receipt-gated", () => {
  const schema = JSON.parse(fs.readFileSync(new URL("../catalog/contracts/fa-hp-nested.schema.json", import.meta.url), "utf8"));
  assert.equal(schema["x-runtime-enabled"], false);
  const text = JSON.stringify(schema);
  for (const token of ["Income Statement", "Balance Sheet", "Cash Flow", "Quarterly", "Yearly", "1D", "1H", "1M", "Previous", "Next", "All Loaded Rows", "receipt_required"]) assert.match(text, new RegExp(token));
});
