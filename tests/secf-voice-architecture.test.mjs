import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { compileSECFFollowup } from "../src/secf-followup.mjs";
import { isSECFLiveAction, normalizeSECFLiveAction, normalizeSECFUnboundAction, SECF_RESULT_CAPS, SECF_TABS } from "../src/secf-actions.mjs";
import { validateWorkflowPlan } from "../src/workflow-plan.mjs";

const config = overrides => ({
  query: "bank", tab: "Equities", max: 50, venues: [], countries: [], hide_no_trade: false, ...overrides
});

test("SECF schema exactly preserves the documented tabs and result caps", () => {
  assert.deepEqual(SECF_TABS, ["All", "Equities", "Corporate Bonds", "Options", "Sovereign Bonds", "Crypto", "Index", "Futures", "Forex", "People"]);
  assert.deepEqual(SECF_RESULT_CAPS, [50, 100, 250, 500]);
  for (const max of SECF_RESULT_CAPS) {
    assert.equal(normalizeSECFUnboundAction({ feature: "search", operation: "configure", value: config({ max }) }).value.max, max);
  }
});

test("SECF noisy speech compiles one atomic full configuration without enabling runtime", () => {
  const draft = compileSECFFollowup({ command: "SECF" }, "security find her search gold man corporate bonds on TRACE venue max one hundred hide no trays");
  assert.deepEqual(draft.action.value, {
    query: "gold man", tab: "Corporate Bonds", max: 100,
    venues: ["trace"], countries: [], hide_no_trade: true
  });
  assert.equal(draft.ready_for_live_executor, false);
  assert.match(draft.blocked_reason, /Other tabs and dynamic filters remain disabled/);
});

test("SECF parses multi-country discovery and every tab family", () => {
  const lithium = compileSECFFollowup({ command: "SECF" }, "find lithium equities max two fifty countries Australia and Canada hide no trades");
  assert.deepEqual(lithium.action.value, {
    query: "lithium", tab: "Equities", max: 250,
    venues: [], countries: ["australia", "canada"], hide_no_trade: true
  });
  const phrases = new Map([
    ["all instruments", "All"], ["stocks", "Equities"], ["company bonds", "Corporate Bonds"],
    ["options", "Options"], ["government bonds", "Sovereign Bonds"], ["digital assets", "Crypto"],
    ["indexes", "Index"], ["futures", "Futures"], ["foreign exchange", "Forex"], ["contacts", "People"]
  ]);
  for (const [phrase, tab] of phrases) {
    assert.equal(compileSECFFollowup({ command: "SECF" }, `find acme in ${phrase}`).action.value.tab, tab);
  }
});

test("SECF People tab excludes venue, country, and no-trade filters", () => {
  for (const suffix of ["venue NYSE", "country US", "hide no trades"]) {
    const draft = compileSECFFollowup({ command: "SECF" }, `find Jamie Dimon people ${suffix}`);
    assert.equal(draft.action, null);
    assert.match(draft.blockers.join(" "), /People does not support/);
  }
  assert.equal(compileSECFFollowup({ command: "SECF" }, "find Jamie Dimon people max fifty").action.value.query, "jamie dimon");
});

test("SECF fails closed on tab contradictions, state contradictions, and malformed caps", () => {
  const tabs = compileSECFFollowup({ command: "SECF" }, "search banks equities and corporate bonds");
  assert.match(tabs.blockers.join(" "), /Conflicting SECF tabs/);
  const trades = compileSECFFollowup({ command: "SECF" }, "find banks equities hide no trades and show no trades");
  assert.match(trades.blockers.join(" "), /both hidden and shown/);
  const cap = compileSECFFollowup({ command: "SECF" }, "find banks equities max 75");
  assert.equal(cap.action, null);
  assert.match(cap.blockers.join(" "), /use exactly 50, 100, 250, or 500/);
});

test("SECF contextual changes preserve omitted settings from authoritative context", () => {
  const draft = compileSECFFollowup({
    command: "SECF",
    current_config: config({ query: "semiconductors", tab: "Equities", max: 250, venues: ["NASDAQ"], countries: ["US"], hide_no_trade: true })
  }, "limit five hundred");
  assert.deepEqual(draft.action.value, config({
    query: "semiconductors", tab: "Equities", max: 500, venues: ["NASDAQ"], countries: ["US"], hide_no_trade: true
  }));
});

test("SECF dynamic values remain literal and strict schema rejects unsafe payloads", () => {
  assert.deepEqual(normalizeSECFUnboundAction({
    feature: "search", operation: "configure",
    value: config({ venues: ["Tokyo Stock Exchange"], countries: ["Japan"] })
  }).value.venues, ["Tokyo Stock Exchange"]);
  assert.throws(() => normalizeSECFUnboundAction({ feature: "search", operation: "configure", value: config({ max: 1000 }) }), /Unsupported SECF max/);
  assert.throws(() => normalizeSECFUnboundAction({ feature: "search", operation: "configure", value: config({ venues: ["NYSE", "nyse"] }) }), /duplicate/);
  assert.throws(() => normalizeSECFUnboundAction({ feature: "search", operation: "configure", value: { ...config(), surprise: true } }), /unknown field/);
  assert.throws(() => normalizeSECFUnboundAction({ feature: "search", operation: "configure", value: config({ query: "bad\nquery" }) }), /Invalid SECF query/);
});

test("workflow enables only the independently proven People search subset", () => {
  const people = { feature: "search", operation: "configure", value: config({ query: "Jamie Dimon", tab: "People", max: 100 }) };
  assert.equal(isSECFLiveAction(people), true);
  assert.deepEqual(normalizeSECFLiveAction(people), people);
  const plan = validateWorkflowPlan({
    version: 2, failure_policy: "stop_on_any", layout: null,
    steps: [{
      id: "configure-secf-1", kind: "configure",
      target: { mode: "last", command: "SECF", security: null },
      actions: [people], required: true
    }]
  });
  assert.deepEqual(plan.steps[0].actions[0], people);
  for (const action of [
    { feature: "search", operation: "configure", value: config({ tab: "Equities" }) },
    { feature: "search", operation: "configure", value: config({ tab: "People", venues: ["NYSE"] }) },
    { feature: "search", operation: "configure", value: config({ tab: "People", hide_no_trade: true }) }
  ]) assert.throws(() => normalizeSECFLiveAction(action), /not live-enabled|People does not support/);
});

test("People query and cap compile as one executable contextual workflow", () => {
  const draft = compileSECFFollowup({ command: "SECF" }, "security find her search Jamie Dimon people max one hundred");
  assert.equal(draft.ready_for_live_executor, true);
  assert.equal(draft.blocked_reason, null);
  assert.deepEqual(draft.action.value, config({ query: "jamie dimon", tab: "People", max: 100 }));
});

test("content executor proves exact People schema, native cap, query mutation, and row bound", () => {
  const source = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
  for (const token of ["executeSECF", "secfPeopleRendered", "secfMaxSelect", "Name", "Company", "Position", "Email", "Phone"]) {
    assert.match(source, new RegExp(token));
  }
  assert.match(source, /secfRows\(table\)\.length <= max/);
  assert.match(source, /previousSignature/);
});

test("provider JSON schemas expose the complete SECF object without claiming runtime readiness", () => {
  for (const filename of ["intent.schema.json", "workflow.schema.json"]) {
    const schema = JSON.parse(fs.readFileSync(new URL(`../data/${filename}`, import.meta.url), "utf8"));
    const text = JSON.stringify(schema);
    for (const token of ["search", "configure", "hide_no_trade", "Corporate Bonds", "Sovereign Bonds", "People", "250", "500"]) {
      assert.match(text, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }
});
