import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  EQS_BOOLEAN_FIELDS, EQS_LIST_FIELDS, EQS_LIVE_LIST_VALUES, EQS_UNBOUND_FEATURES,
  assertEQSUnboundActionDisabled, isEQSLiveDynamicAction, normalizeEQSLiveDynamicAction, normalizeEQSUnboundAction
} from "../src/commands/eqs-actions.mjs";
import { compileEQSFollowup } from "../src/commands/eqs-followup.mjs";
import { buildWorkflowPlan } from "../src/automation-plan.mjs";
import { validateIntent } from "../src/compiler.mjs";

const list = (field, items) => ({ feature: "list_filter", operation: "add", value: { field, items } });
const toggle = (feature, value) => ({ feature, operation: "select", value });
const values = result => result.actions.map(({ feature, operation, value }) => ({ feature, operation, value }));

test("EQS dynamic contract covers every exact observed list, boolean and toggle feature", () => {
  assert.deepEqual(EQS_LIST_FIELDS, ["Currency", "Venue", "HQ Country", "Sector", "Sub-Sector"]);
  assert.deepEqual(EQS_BOOLEAN_FIELDS, ["Private Company"]);
  assert.deepEqual(EQS_UNBOUND_FEATURES, ["list_filter", "boolean_filter", "primary_listings", "hide_no_trades"]);
  assert.deepEqual(EQS_LIVE_LIST_VALUES, { Currency: ["USD"], "HQ Country": ["United States"], Sector: ["Technology"] });
  for (const field of EQS_LIST_FIELDS) {
    assert.deepEqual(normalizeEQSUnboundAction(list(field.toLowerCase(), ["  Value One  ", "Value Two"])),
      list(field, ["Value One", "Value Two"]));
  }
  assert.deepEqual(normalizeEQSUnboundAction({
    feature: "boolean-filter", operation: "ADD", value: { field: "private company", value: false }
  }), { feature: "boolean_filter", operation: "add", value: { field: "Private Company", value: false } });
  for (const feature of ["primary_listings", "hide_no_trades"]) {
    for (const value of [true, false]) assert.deepEqual(normalizeEQSUnboundAction(toggle(feature, value)), toggle(feature, value));
  }
});

test("EQS dynamic payloads reject unknown keys, invented fields, empty values and ambiguous duplicates", () => {
  for (const malformed of [
    null, [], "sector tech", {},
    { feature: "list_filter", operation: "add", value: { field: "Industry", items: ["Software"] } },
    { feature: "list_filter", operation: "select", value: { field: "Sector", items: ["Technology"] } },
    { feature: "list_filter", operation: "add", value: { field: "Sector", items: [] } },
    { feature: "list_filter", operation: "add", value: { field: "Sector", items: ["Tech", " tech "] } },
    { feature: "list_filter", operation: "add", value: { field: "Sector", items: [12] } },
    { feature: "list_filter", operation: "add", value: { field: "Sector", items: ["Technology"], guessed: true } },
    { feature: "boolean_filter", operation: "add", value: { field: "Private Company", value: "false" } },
    { feature: "boolean_filter", operation: "select", value: { field: "Private Company", value: false } },
    { feature: "primary_listings", operation: "toggle", value: true },
    { feature: "hide_no_trades", operation: "select", value: "on" },
    { feature: "download", operation: "click", value: null }
  ]) assert.throws(() => normalizeEQSUnboundAction(malformed), /EQS|object|unknown|Unsupported|list|duplicate|boolean|requires/);
});

test("dynamic values remain user text and are never guessed against an invented enum", () => {
  const unusual = normalizeEQSUnboundAction(list("Sub-Sector", ["Quantum widgets (experimental)"]));
  assert.equal(unusual.value.items[0], "Quantum widgets (experimental)");
  assert.throws(() => normalizeEQSUnboundAction(list("Sector", ["\nTechnology"])), /Invalid/);
  assert.throws(() => normalizeEQSUnboundAction(list("Venue", ["x".repeat(65)])), /Invalid/);
  assert.throws(() => normalizeEQSUnboundAction(list("Venue", Array.from({ length: 21 }, (_, i) => `V${i}`))), /at most 20/);
});

test("noisy speech compiles all dynamic controls but mixed unverified values keep the draft blocked", () => {
  const result = compileEQSFollowup("EQS",
    "uh screen in U S D listed on nasdaq head quartered in united states sector technology sub sector semiconductors, only public companies, primary listings only, and hide untraded tickers");
  assert.deepEqual(values(result), [
    list("Currency", ["USD"]), list("Venue", ["NASDAQ"]), list("HQ Country", ["united states"]),
    list("Sector", ["technology"]), list("Sub-Sector", ["semiconductors"]),
    { feature: "boolean_filter", operation: "add", value: { field: "Private Company", value: false } },
    toggle("primary_listings", true), toggle("hide_no_trades", true)
  ]);
  assert.equal(result.ready_for_live_executor, false);
  assert.match(result.blocked_reason, /outside the executable allowlist/);
});

test("natural negative states compile exactly and contradictory speech fails closed", () => {
  const negative = compileEQSFollowup("EQS", "include private companies, show all listings, and include dead tickers");
  assert.deepEqual(values(negative), [
    { feature: "boolean_filter", operation: "add", value: { field: "Private Company", value: true } },
    toggle("primary_listings", false), toggle("hide_no_trades", false)
  ]);
  for (const phrase of [
    "include and exclude private companies",
    "primary listings only but also show all listings",
    "hide dead tickers but include dead tickers"
  ]) {
    const result = compileEQSFollowup("EQS", phrase);
    assert.equal(result.ready_for_live_executor, false);
    assert.ok(result.blockers.length >= 1);
  }
});

test("workflow and intent compilers validate malformed payloads then block all well-formed unbound actions", () => {
  const configure = action => ({
    kind: "configure", target: { mode: "command", command: "EQS", security: null }, actions: [action]
  });
  for (const action of [
    list("Venue", ["NASDAQ"]), list("HQ Country", ["Japan"]),
    list("Sub-Sector", ["Semiconductors"]),
    { feature: "boolean_filter", operation: "add", value: { field: "Private Company", value: false } },
    toggle("primary_listings", true), toggle("hide_no_trades", true)
  ]) {
    assert.throws(() => buildWorkflowPlan(configure(action)), /schema-valid but not live-enabled/);
    assert.throws(() => assertEQSUnboundActionDisabled(action), /authenticated control binding is required/);
  }
  for (const [input, expected] of [
    [list("Currency", ["usd"]), list("Currency", ["USD"])],
    [list("Sector", ["technology"]), list("Sector", ["Technology"])],
    [list("HQ Country", ["united states"]), list("HQ Country", ["United States"])]
  ]) {
    assert.deepEqual(normalizeEQSLiveDynamicAction(input), expected);
    assert.equal(isEQSLiveDynamicAction(input), true);
    const plan = buildWorkflowPlan(configure(input));
    assert.deepEqual(plan.steps[0].actions[0], expected);
  }
  assert.throws(() => buildWorkflowPlan(configure(list("Industry", ["Software"]))), /Unsupported EQS list field/);

  const checked = validateIntent({
    kind: "execute", confidence: 0.99, command: "EQS", security: null, query: null, arguments: [],
    post_open_actions: [list("Sector", ["Technology"])], clarification: null, reason: "Screen requested."
  });
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.intent.post_open_actions[0], list("Sector", ["Technology"]));
});

test("only authenticated USD, United States, and Technology list values are executable", () => {
  for (const action of [list("Currency", ["EUR"]), list("Sector", ["Healthcare"]), list("Currency", ["USD", "EUR"])]) {
    assert.equal(isEQSLiveDynamicAction(action), false);
    assert.throws(() => normalizeEQSLiveDynamicAction(action), /not live-enabled/);
  }
  const currency = compileEQSFollowup("EQS", "set the screener currency to U S D");
  const sector = compileEQSFollowup("EQS", "screen sector technology and run it");
  assert.equal(currency.ready_for_live_executor, true);
  assert.equal(sector.ready_for_live_executor, true);
  assert.equal(currency.actions[0].capability_state, "source-verified");
  assert.equal(sector.actions[0].capability_state, "source-verified");
});

test("content executor requires the authenticated native option set and rendered selected chip", () => {
  const source = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
  for (const token of [
    "EQS_LIVE_LIST_VALUES", "eqsListEditor", "eqsListOption", "eqsSelectedListChip",
    "executeEQSListFilter", "US Dollar", "Technology"
  ]) assert.match(source, new RegExp(token));
  assert.match(source, /EQS_LIST_PROOF_LABELS/);
  assert.match(source, /items\.length !== 1/);
});

test("provider JSON schemas describe each structured payload without claiming runtime availability", () => {
  for (const filename of ["intent.schema.json", "workflow.schema.json"]) {
    const schema = JSON.parse(fs.readFileSync(new URL(`../catalog/schemas/${filename}`, import.meta.url), "utf8"));
    const text = JSON.stringify(schema);
    for (const token of ["list_filter", "boolean_filter", "Currency", "Venue", "HQ Country", "Sector", "Sub-Sector", "Private Company"]) {
      assert.match(text, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }
});
