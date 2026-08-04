import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  GLCO_FEATURES,
  normalizeCommodityFacts,
  normalizeGLCOAction,
  normalizeVenueFacts,
  normalizeWorldAction,
  VENUE_STATES,
  WORLD_FEATURES
} from "../src/wei-glco-actions.mjs";
import { compileGLCOFollowup, compileWorldFollowup } from "../src/wei-glco-followup.mjs";
import { validateWorkflowPlan } from "../src/workflow-plan.mjs";

const worldContext = {
  command: "WEIF",
  live_options: { categories: ["Americas", "Europe", "Asia Pacific"], venues: ["CME", "Eurex", "Osaka Exchange"] },
  documented_controls: { filters: ["Active", "Closed"], sorts: ["Last", "Change Percent", "YTD Percent"] }
};
const venueFacts = [
  { venue_id: "XEUR", venue_name: "Eurex", category: "Europe", status: "Closed", next_open_at: "2026-08-04T08:00:00+02:00", captured_at: "2026-08-04T01:00:00-06:00", source: "Godel WEIF panel" },
  { venue_id: "XCME", venue_name: "CME", category: "Americas", status: "Active", next_open_at: null, captured_at: "2026-08-04T01:00:00-06:00", source: "Godel WEIF panel" }
];
const glcoContext = {
  command: "GLCO",
  live_options: {
    categories: ["Energy", "Metals", "Agriculture"],
    contracts: [
      { id: "BZ1", label: "Brent Crude Future", category: "Energy", aliases: ["Brent"] },
      { id: "GC1", label: "Gold Future", category: "Metals", aliases: ["Gold"] }
    ]
  }
};
const commodityFacts = [
  { id: "BZ1", label: "Brent Crude Future", category: "Energy", last: 75.2, change: 1.1, change_percent: 1.48, captured_at: "2026-08-04T01:00:00-06:00", source: "Godel GLCO panel" }
];

test("world and commodity contracts publish only strict action families", () => {
  assert.deepEqual(WORLD_FEATURES, ["category", "venue", "filter", "sort"]);
  assert.deepEqual(GLCO_FEATURES, ["category", "contract"]);
  assert.deepEqual(VENUE_STATES, ["Active", "Closed"]);
});

test("WEIF noisy category speech resolves one exact live region", () => {
  assert.deepEqual(compileWorldFollowup(worldContext, "show the you rope region for index fewchers").actions, []);
  assert.equal(compileWorldFollowup(worldContext, "show Europe region for index fewchers").actions[0].value, "Europe");
});

test("world category corrections win while direct contradictions block", () => {
  assert.equal(compileWorldFollowup(worldContext, "show Europe region no sorry show Americas region").actions[0].value, "Americas");
  const conflict = compileWorldFollowup(worldContext, "show Europe and Americas region");
  assert.ok(conflict.blockers.length);
  assert.equal(conflict.configure_step_draft, null);
});

test("venue selection requires one exact current live identity", () => {
  assert.equal(compileWorldFollowup(worldContext, "focus on Eurex venue").actions[0].value, "Eurex");
  assert.match(compileWorldFollowup({ command: "WEIF" }, "focus on Eurex venue").blockers.join(" "), /exact current live venue list/);
  assert.ok(compileWorldFollowup(worldContext, "show CME and Eurex venues").blockers.length);
});

test("filters and sorts compile only from exact documented controls", () => {
  assert.equal(compileWorldFollowup(worldContext, "filter by Closed").actions[0].value, "Closed");
  assert.deepEqual(compileWorldFollowup(worldContext, "sort by YTD Percent descending").actions[0].value, { field: "YTD Percent", direction: "descending" });
  assert.match(compileWorldFollowup({ ...worldContext, documented_controls: undefined }, "filter by Closed").blockers.join(" "), /unavailable/);
  assert.match(compileWorldFollowup(worldContext, "sort by Volume descending").blockers.join(" "), /unavailable/);
  assert.match(compileWorldFollowup(worldContext, "sort by Last").blockers.join(" "), /explicit/);
});

test("world facts ground Active Closed and next-open narration exactly", () => {
  const draft = compileWorldFollowup({ ...worldContext, grounded_venues: venueFacts }, "when is Eurex next open");
  assert.equal(draft.grounded_narration.venues.length, 1);
  assert.equal(draft.grounded_narration.venues[0].status, "Closed");
  assert.equal(draft.ready_for_grounded_narration, true);
  const all = compileWorldFollowup({ ...worldContext, grounded_venues: venueFacts }, "which markets are active or closed");
  assert.equal(all.grounded_narration.venues.length, 2);
});

test("world facts reject missing timezone, missing next open, and synthetic sources", () => {
  assert.throws(() => normalizeVenueFacts("WEIF", [{ ...venueFacts[0], next_open_at: null }]), /requires an exact next-open/);
  assert.throws(() => normalizeVenueFacts("WEIF", [{ ...venueFacts[0], captured_at: "2026-08-04T01:00:00" }]), /timezone/);
  assert.throws(() => normalizeVenueFacts("WEIF", [{ ...venueFacts[0], source: "model" }]), /exact Godel WEIF panel/);
  const draft = compileWorldFollowup(worldContext, "when does Eurex open");
  assert.equal(draft.grounded_narration, null);
  assert.match(draft.blockers.join(" "), /will not be invented/);
});

test("WEI and WEIF preserve command-specific grounded source identity", () => {
  const cash = [{ ...venueFacts[1], source: "Godel WEI panel" }];
  assert.equal(normalizeVenueFacts("WEI", cash)[0].source, "Godel WEI panel");
  assert.throws(() => normalizeVenueFacts("WEI", [{ ...cash[0], source: "Godel WEIF panel" }]), /Godel WEI panel/);
});

test("GLCO selects one exact live category and honors corrections", () => {
  assert.equal(compileGLCOFollowup(glcoContext, "show Energy category").actions[0].value, "Energy");
  assert.equal(compileGLCOFollowup(glcoContext, "show Energy no sorry show Metals category").actions[0].value, "Metals");
  const conflict = compileGLCOFollowup(glcoContext, "show Energy and Metals categories");
  assert.ok(conflict.blockers.length);
  assert.equal(conflict.configure_step_draft, null);
});

test("GLCO resolves an exact live contract and never invents coal or FX symbols", () => {
  assert.deepEqual(compileGLCOFollowup(glcoContext, "pull up Brent future").actions[0].value, { id: "BZ1", label: "Brent Crude Future", category: "Energy" });
  for (const speech of ["show NCF coal future", "pull up NEWC coal", "show Indonesian rupiah future"]) {
    const draft = compileGLCOFollowup(glcoContext, speech);
    assert.match(draft.blockers.join(" "), /will not invent/);
    assert.equal(draft.configure_step_draft, null);
  }
});

test("GLCO exact aliases may be supplied only by the live documented list", () => {
  const withCoal = { command: "GLCO", documented_options: { categories: ["Energy"], contracts: [{ id: "NCF", label: "Newcastle Coal Future", category: "Energy", aliases: ["Newcastle coal"] }] } };
  assert.equal(compileGLCOFollowup(withCoal, "show Newcastle coal future").actions[0].value.id, "NCF");
});

test("GLCO narration reads only exact current panel facts", () => {
  const draft = compileGLCOFollowup({ ...glcoContext, grounded_contracts: commodityFacts }, "tell me the Brent price and change");
  assert.deepEqual(draft.grounded_narration.contracts, commodityFacts);
  assert.equal(draft.ready_for_grounded_narration, true);
  for (const grounded_contracts of [undefined, [{ ...commodityFacts[0], source: "model" }], [{ ...commodityFacts[0], last: -1 }]]) {
    const blocked = compileGLCOFollowup({ ...glcoContext, grounded_contracts }, "what is the Brent price");
    assert.equal(blocked.grounded_narration, null);
    assert.match(blocked.blockers.join(" "), /will not be invented/);
  }
});

test("strict normalizers reject malformed dynamic payloads", () => {
  assert.throws(() => normalizeWorldAction("WEI", { feature: "sort", operation: "set", value: { field: "Last", direction: "up" } }), /direction/);
  assert.throws(() => normalizeGLCOAction({ feature: "contract", operation: "select", value: { id: "BZ1", label: "Brent" } }), /missing category/);
  assert.throws(() => normalizeCommodityFacts([{ ...commodityFacts[0], change_percent: "1.48" }]), /finite/);
});

test("compound unsupported world actions are atomic", () => {
  const draft = compileWorldFollowup(worldContext, "show Europe region and filter by Volume");
  assert.ok(draft.actions.length);
  assert.ok(draft.blockers.length);
  assert.equal(draft.configure_step_draft, null);
});

test("planner recognizes every strict family but enables none", () => {
  const base = { version: 2, failure_policy: "stop_on_any", layout: null };
  for (const [command, action] of [
    ["WEI", { feature: "category", operation: "select", value: "Europe" }],
    ["WEIF", { feature: "sort", operation: "set", value: { field: "YTD Percent", direction: "descending" } }],
    ["GLCO", { feature: "contract", operation: "select", value: { id: "BZ1", label: "Brent Crude Future", category: "Energy" } }]
  ]) {
    const target = { mode: "command", command, security: null };
    assert.throws(() => validateWorkflowPlan({ ...base, steps: [{ id: `${command.toLowerCase()}-1`, kind: "configure", target, actions: [action], required: true }] }), /schema-valid but not live-enabled/);
  }
});

test("schema records grounding, documented-control, identity, and runtime policy", () => {
  const schema = JSON.parse(fs.readFileSync(new URL("../data/contracts/wei-glco-nested.schema.json", import.meta.url), "utf8"));
  assert.equal(schema["x-runtime-enabled"], false);
  assert.match(schema["x-world-status-grounding"], /next-open/);
  assert.match(schema["x-filter-sort-policy"], /explicitly documented/);
  assert.match(schema["x-glco-identity-policy"], /no coal or FX symbol/);
});
