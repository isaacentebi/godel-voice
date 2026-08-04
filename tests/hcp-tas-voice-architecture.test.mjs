import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  HCP_PAGES,
  HCP_PERIODS,
  normalizeHCPAction,
  normalizeOHLCVRows,
  normalizeTASAction
} from "../src/hcp-tas-actions.mjs";
import { compileHCPFollowup, compileTASFollowup } from "../src/hcp-tas-followup.mjs";
import { validateWorkflowPlan } from "../src/workflow-plan.mjs";

const tasContext = {
  command: "TAS",
  current_config: { columns: ["Time", "Price", "Size"], price_flash: true, milliseconds: false },
  live_options: { columns: ["Time", "Price", "Size", "Exchange", "Condition"] }
};
const rows = [
  { date: "2026-08-03", open: 100, high: 108, low: 98, close: 105, volume: 123456, source: "Godel HCP table" }
];

test("HCP exposes exact native presets and paging", () => {
  assert.deepEqual(HCP_PERIODS, ["1W", "1M", "3M", "6M", "1Y"]);
  assert.deepEqual(HCP_PAGES, ["Previous", "Next"]);
});

test("HCP noisy preset speech and correction compile canonically", () => {
  assert.equal(compileHCPFollowup("HCP", "give me three munths please").actions[0].value.period, "3M");
  assert.equal(compileHCPFollowup("HCP", "one month no sorry three months").actions[0].value.period, "3M");
  assert.equal(compileHCPFollowup("HCP", "pull up six months").actions[0].value.period, "6M");
});

test("HCP accepts exact custom ISO dates and rejects inversion or invalid dates", () => {
  assert.deepEqual(compileHCPFollowup("HCP", "from 2025/01/02 through 2026/03/04").actions[0].value, {
    kind: "Custom", period: null, from: "2025-01-02", to: "2026-03-04"
  });
  assert.match(compileHCPFollowup("HCP", "from 2026-03-04 to 2025-01-02").blockers.join(" "), /cannot be after/);
  assert.throws(() => normalizeHCPAction({ feature: "range", operation: "set", value: { kind: "Custom", period: null, from: "2026-02-30", to: "2026-03-01" } }), /not a calendar date/);
});

test("HCP contradictions are atomic and paging is exact", () => {
  const conflict = compileHCPFollowup("HCP", "one month and one year then next page");
  assert.ok(conflict.blockers.length);
  assert.equal(conflict.configure_step_draft, null);
  assert.equal(compileHCPFollowup("HCP", "go back a page").actions[0].value, "Previous");
  assert.equal(compileHCPFollowup("HCP", "next page").actions[0].value, "Next");
});

test("HCP narrates only exact validated Godel rows", () => {
  const draft = compileHCPFollowup({ command: "HCP", grounded_rows: rows }, "read the open high low close and volume");
  assert.deepEqual(draft.grounded_narration.rows, rows);
  assert.equal(draft.ready_for_grounded_narration, true);
  for (const grounded_rows of [undefined, [{ ...rows[0], source: "model" }], [{ ...rows[0], high: 99 }]]) {
    const blocked = compileHCPFollowup({ command: "HCP", grounded_rows }, "tell me the ohlcv row");
    assert.equal(blocked.grounded_narration, null);
    assert.match(blocked.blockers.join(" "), /will not be invented/);
  }
});

test("HCP grounded validator enforces the 100-row page boundary", () => {
  assert.equal(normalizeOHLCVRows(Array.from({ length: 100 }, (_, index) => ({ ...rows[0], date: `2026-07-${String((index % 28) + 1).padStart(2, "0")}` }))).length, 100);
  assert.throws(() => normalizeOHLCVRows(Array.from({ length: 101 }, () => rows[0])), /1-100 rows/);
});

test("TAS refuses all edits without authoritative current and live state", () => {
  for (const context of [{ command: "TAS" }, { command: "TAS", current_config: tasContext.current_config }]) {
    const draft = compileTASFollowup(context, "show exchange column");
    assert.ok(draft.blockers.length);
    assert.equal(draft.configure_step_draft, null);
  }
});

test("TAS exact show and hide preserve unrelated authoritative state", () => {
  assert.deepEqual(compileTASFollowup(tasContext, "show exchange column").actions[0].value, {
    columns: ["Time", "Price", "Size", "Exchange"], price_flash: true, milliseconds: false
  });
  assert.deepEqual(compileTASFollowup(tasContext, "hide size column").actions[0].value.columns, ["Time", "Price"]);
});

test("TAS exact reorder preserves all columns", () => {
  const value = compileTASFollowup(tasContext, "move size column before time column").actions[0].value;
  assert.deepEqual(value.columns, ["Size", "Time", "Price"]);
  assert.equal(value.price_flash, true);
  assert.equal(value.milliseconds, false);
});

test("TAS toggles and spoken correction select only final intent", () => {
  assert.equal(compileTASFollowup(tasContext, "turn off price flashing").actions[0].value.price_flash, false);
  assert.equal(compileTASFollowup(tasContext, "show milliseconds").actions[0].value.milliseconds, true);
  const corrected = compileTASFollowup(tasContext, "show exchange column no sorry show condition column");
  assert.deepEqual(corrected.actions[0].value.columns, ["Time", "Price", "Size", "Condition"]);
});

test("TAS unknown, hidden, duplicate, and final-column removals block atomically", () => {
  assert.match(compileTASFollowup(tasContext, "show venue column").blockers.join(" "), /Unknown or ambiguous/);
  assert.ok(compileTASFollowup(tasContext, "hide exchange column").blockers.length);
  assert.ok(compileTASFollowup(tasContext, "show price column").blockers.length);
  const final = { ...tasContext, current_config: { columns: ["Price"], price_flash: true, milliseconds: false } };
  assert.match(compileTASFollowup(final, "hide price column").blockers.join(" "), /final visible/);
});

test("TAS contradictory toggles never emit a configure step", () => {
  const draft = compileTASFollowup(tasContext, "turn on price flash and turn off price flash");
  assert.match(draft.blockers.join(" "), /both on and off/);
  assert.equal(draft.configure_step_draft, null);
});

test("strict TAS action rejects duplicate or malformed state", () => {
  assert.throws(() => normalizeTASAction({ feature: "table", operation: "configure", value: { columns: ["Price", "price"], price_flash: true, milliseconds: false } }), /duplicates/);
  assert.throws(() => normalizeTASAction({ feature: "table", operation: "configure", value: { columns: ["Price"], price_flash: "on", milliseconds: false } }), /boolean/);
});

test("workflow recognizes HCP and TAS structures but live-enables neither", () => {
  const base = { version: 2, failure_policy: "stop_on_any", layout: null };
  const hcpTarget = { mode: "command", command: "HCP", security: null };
  const tasTarget = { mode: "command", command: "TAS", security: null };
  assert.throws(() => validateWorkflowPlan({ ...base, steps: [{ id: "hcp-1", kind: "configure", target: hcpTarget, actions: [{ feature: "page", operation: "select", value: "Next" }], required: true }] }), /schema-valid but not live-enabled/);
  assert.throws(() => validateWorkflowPlan({ ...base, steps: [{ id: "tas-1", kind: "configure", target: tasTarget, actions: [{ feature: "table", operation: "configure", value: tasContext.current_config }], required: true }] }), /schema-valid but not live-enabled/);
});

test("schema records page size, dynamic state policy, and disabled runtime", () => {
  const schema = JSON.parse(fs.readFileSync(new URL("../data/hcp-tas-nested.schema.json", import.meta.url), "utf8"));
  assert.equal(schema["x-runtime-enabled"], false);
  assert.equal(schema["x-hcp-page-size"], 100);
  assert.match(schema["x-tas-state-policy"], /authoritative current configuration/);
  assert.match(schema["x-no-invention"], /exact validated/);
});
