import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { compileQMFollowup } from "../src/qm-followup.mjs";
import {
  QM_FEATURES, QM_MAX_SECURITIES, QM_SORT_DIRECTIONS, QM_TICKER_ACTIONS, QM_WATCHLIST_ACTIONS,
  normalizeQMAction
} from "../src/qm-actions.mjs";
import { validateWorkflowPlan } from "../src/workflow-plan.mjs";

const target = { mode: "command", command: "QM", security: null };
const watchlist = (action, overrides = {}) => ({
  feature: "watchlist", operation: "configure",
  value: { action, name: "Core", new_name: null, relative_to: null, placement: null, confirmed: action !== "switch", ...overrides }
});
const resolved = (ticker, spoken = ticker) => ({ spoken_name: spoken, ticker, venue: "US", asset_class: "EQ", needs_resolution: false });

test("QM publishes the exact strict action families and bounded import contract", () => {
  assert.deepEqual(QM_FEATURES, ["watchlist", "tickers", "columns", "scale", "sort"]);
  assert.deepEqual(QM_WATCHLIST_ACTIONS, ["create", "switch", "rename", "delete", "reorder"]);
  assert.deepEqual(QM_TICKER_ACTIONS, ["add", "remove", "batch-import"]);
  assert.deepEqual(QM_SORT_DIRECTIONS, ["Ascending", "Descending", "Off"]);
  assert.equal(QM_MAX_SECURITIES, 400);
});

test("QM compiles confirmed watchlist create and ticker add as one atomic persistent draft", () => {
  const draft = compileQMFollowup({ command: "QM", target },
    "coat monitor create a watch list called AI basket and add Nvidia Meta and Microsoft to AI basket watch list confirm");
  assert.equal(draft.actions.length, 2);
  assert.deepEqual(draft.actions[0], watchlist("create", { name: "AI Basket" }));
  assert.deepEqual(draft.actions[1].value.securities.map(item => item.ticker), ["NVDA", "META", "MSFT"]);
  assert.equal(draft.persistent_mutation, true);
  assert.equal(draft.ready_for_live_executor, false);
  assert.equal(draft.blockers.length, 0);
  assert.ok(draft.configure_step_draft);
});

test("QM switching is read-only but still disabled pending unique live watchlist identity", () => {
  const draft = compileQMFollowup("QM", "switch to my biotech watch list");
  assert.deepEqual(draft.actions, [watchlist("switch", { name: "Biotech", confirmed: false })]);
  assert.equal(draft.persistent_mutation, false);
  assert.equal(draft.blockers.length, 0);
  assert.equal(normalizeQMAction(draft.actions[0]).value.name, "Biotech");
});

test("QM rename, delete and account-wide tab reorder use exact lifecycle shapes", () => {
  assert.deepEqual(compileQMFollowup("QM", "ree name core watch list to mega caps confirm").actions[0],
    watchlist("rename", { new_name: "Mega Caps" }));
  const deletion = compileQMFollowup("QM", "deleet junk watch list i confirm");
  assert.equal(deletion.actions[0].value.action, "delete");
  assert.equal(deletion.deletion_requested, true);
  assert.deepEqual(compileQMFollowup("QM", "move core watch list before growth watch list confirmed").actions[0],
    watchlist("reorder", { relative_to: "Growth", placement: "Before" }));
});

test("every persistent QM mutation requires explicit confirmation, especially deletion", () => {
  for (const speech of [
    "create watchlist called Core", "rename Core watchlist to Growth", "delete Core watchlist",
    "move Core watchlist after Growth watchlist", "add Amazon to Core watchlist",
    "set columns to Last and Volume", "set quote monitor scale to 125 percent", "sort by Volume descending"
  ]) {
    const draft = compileQMFollowup("QM", speech);
    assert.ok(draft.blockers.some(item => /confirmation/.test(item)), speech);
    assert.equal(draft.configure_step_draft, null);
  }
  assert.throws(() => normalizeQMAction(watchlist("delete", { confirmed: false })), /requires explicit confirmation/);
});

test("multi-ticker speech deduplicates resolved identities in mention order", () => {
  const action = compileQMFollowup("QM", "add Amazon Meta Microsoft and Amazon to mega caps watch list confirm").actions[0];
  assert.deepEqual(action.value.securities.map(item => item.ticker), ["AMZN", "META", "MSFT"]);
  const normalized = normalizeQMAction({
    feature: "tickers", operation: "configure",
    value: { action: "batch-import", watchlist: "Core", securities: [resolved("AAPL"), resolved("AAPL"), resolved("MSFT")], confirmed: true }
  });
  assert.deepEqual(normalized.value.securities.map(item => item.ticker), ["AAPL", "MSFT"]);
});

test("QM batch import enforces 400 input items before mutation", () => {
  const items = Array.from({ length: 400 }, (_, index) => ({
    spoken_name: `security ${index}`, ticker: `T${index}`, venue: "US", asset_class: "EQ", needs_resolution: false
  }));
  assert.equal(normalizeQMAction({
    feature: "tickers", operation: "configure",
    value: { action: "batch-import", watchlist: "Core", securities: items, confirmed: true }
  }).value.securities.length, 400);
  assert.throws(() => normalizeQMAction({
    feature: "tickers", operation: "configure",
    value: { action: "batch-import", watchlist: "Core", securities: [...items, resolved("EXTRA")], confirmed: true }
  }), /1-400/);
});

test("unknown companies remain unresolved and block the entire compound mutation", () => {
  const draft = compileQMFollowup("QM", "add Acme Robotics to moonshots watch list confirm");
  assert.equal(draft.actions[0].value.securities[0].needs_resolution, true);
  assert.equal(draft.actions[0].value.securities[0].ticker, null);
  assert.match(draft.blockers.join(" "), /autocomplete must resolve/);
  assert.equal(draft.configure_step_draft, null);
});

test("QM columns, scaling and three-state sorting are strict persistent drafts", () => {
  const combined = compileQMFollowup("QM", "set columns to Last, Volume, Market Cap then sort by Volume descending confirm");
  assert.deepEqual(combined.actions[0].value.visible, ["Last", "Volume", "Market Cap"]);
  assert.deepEqual(combined.actions[1].value, { column: "Volume", direction: "Descending", confirmed: true });
  assert.deepEqual(compileQMFollowup("QM", "set quote monitor scale to 125 percent confirm").actions[0].value,
    { percent: 125, confirmed: true });
  for (const [speech, direction] of [["sort by Volume ascending confirm", "Ascending"], ["sort by Volume descending confirm", "Descending"], ["clear sorting confirm", "Off"]]) {
    assert.equal(compileQMFollowup("QM", speech).actions[0].value.direction, direction);
  }
  assert.throws(() => normalizeQMAction({
    feature: "columns", operation: "configure",
    value: { visible: ["Last", "Volume"], order: ["Last"], widths: [], confirmed: true }
  }), /same exact values/);
});

test("QM incremental column edits require and preserve authoritative current state", () => {
  const context = { command: "QM", current_config: { columns: {
    visible: ["Ticker", "Last", "Volume"], order: ["Ticker", "Last", "Volume"], widths: []
  } } };
  assert.deepEqual(compileQMFollowup(context, "move Volume column before Ticker column confirm").actions[0].value.order,
    ["Volume", "Ticker", "Last"]);
  assert.deepEqual(compileQMFollowup(context, "resize Volume column to 160 pixels confirm").actions[0].value.widths,
    [{ column: "Volume", pixels: 160 }]);
  assert.deepEqual(compileQMFollowup(context, "add Market Cap column confirm").actions[0].value.visible,
    ["Ticker", "Last", "Volume", "Market Cap"]);
  assert.deepEqual(compileQMFollowup(context, "remove Last column confirm").actions[0].value.visible,
    ["Ticker", "Volume"]);
  assert.match(compileQMFollowup("QM", "resize Volume column to 160 pixels confirm").blockers.join(" "), /authoritative current/);
});

test("unsupported group headers and within-tab ticker reordering stay explicit", () => {
  assert.match(compileQMFollowup("QM", "add a group header called semis").blockers.join(" "), /not documented or live-proven/);
  assert.match(compileQMFollowup("QM", "move Apple above Meta").blockers.join(" "), /within-watchlist ticker reordering/);
});

test("QM contradictions and atomic compound guards fail closed", () => {
  const lifecycle = compileQMFollowup("QM", "create watchlist called Core and delete Core watchlist confirm");
  assert.match(lifecycle.blockers.join(" "), /Conflicting QM watchlist actions/);
  assert.equal(lifecycle.configure_step_draft, null);
  const members = compileQMFollowup("QM", "add Amazon to Core watchlist and remove Meta from Core watchlist confirm");
  assert.match(members.blockers.join(" "), /cannot both add and remove/);
  const sort = compileQMFollowup("QM", "sort by Volume ascending and descending confirm");
  assert.match(sort.blockers.join(" "), /Conflicting QM sort states/);
  assert.equal(sort.configure_step_draft, null);
});

test("workflow validator recognizes every QM shape but enables none", () => {
  const actions = [
    watchlist("switch", { confirmed: false }),
    { feature: "tickers", operation: "configure", value: { action: "add", watchlist: "Core", securities: [resolved("AAPL")], confirmed: true } },
    { feature: "columns", operation: "configure", value: { visible: ["Last"], order: ["Last"], widths: [], confirmed: true } },
    { feature: "scale", operation: "configure", value: { percent: 125, confirmed: true } },
    { feature: "sort", operation: "configure", value: { column: "Volume", direction: "Off", confirmed: true } }
  ];
  for (const action of actions) assert.throws(() => validateWorkflowPlan({
    version: 2, failure_policy: "stop_on_any", layout: null,
    steps: [{ id: "qm-1", kind: "configure", target, actions: [action], required: true }]
  }), /schema-valid but not live-enabled/);
});

test("dedicated schema records bounded values, confirmation and disabled account scope", () => {
  const schema = JSON.parse(fs.readFileSync(new URL("../data/contracts/qm-nested.schema.json", import.meta.url), "utf8"));
  assert.equal(schema["x-runtime-enabled"], false);
  assert.match(schema["x-account-scope"], /persistent synchronized/);
  const text = JSON.stringify(schema);
  for (const token of ["create", "switch", "rename", "delete", "reorder", "batch-import", "maxItems\":400", "Ascending", "Descending", "Off", "confirmed"]) {
    assert.match(text, new RegExp(token));
  }
});
