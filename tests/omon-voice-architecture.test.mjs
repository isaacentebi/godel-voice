import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { compileOMONVoice, OMON_ACTION_STATES, OMON_DESTINATIONS, OMON_GREEKS, OMON_MODES } from "../src/commands/omon-followup.mjs";
import { compileChartOptionsFollowup } from "../src/commands/chart-options-followup.mjs";

const entitled = {
  command: "OMON", option_entitlement: true,
  live_expirations: [
    { id: "2026-09-18", label: "Sep 18 2026", aliases: ["next monthly"], modes: ["Calls", "Puts"] },
    { id: "2026-09-25", label: "Sep 25 2026", aliases: ["september twenty fifth"] }
  ],
  live_columns: ["Last", "Bid", "Ask", "Volume", "Open Interest", "IV", "Delta"],
  selected_contract: { id: "AAPL-20260918-C-250", expiration: "2026-09-18", strike: 250, option_type: "Call" }
};

const compact = result => result.actions.map(({ feature, operation, value }) => ({ feature, operation, value }));

test("publishes exact OMON static vocabularies and only strike depth is live", () => {
  assert.deepEqual(OMON_MODES, ["Both", "Calls", "Puts"]);
  assert.deepEqual(OMON_GREEKS, ["Delta", "Gamma", "Vega", "Theta", "Rho", "Lambda", "Epsilon"]);
  assert.deepEqual(OMON_DESTINATIONS, ["FOCUS", "G", "OVME"]);
  assert.deepEqual(Object.entries(OMON_ACTION_STATES).filter(([, state]) => state === "live").map(([name]) => name), ["strike depth"]);
});

test("noisy full-chain speech compiles every requested action without partial execution", () => {
  const result = compileOMONVoice(entitled,
    "uh coal's only next monthly expiry three months out fifteen strikes with gamma vega theta row greek lamb duh and epsilon please");
  assert.deepEqual(compact(result), [
    { feature: "mode", operation: "select", value: "Calls" },
    { feature: "expiration", operation: "select", value: { id: "2026-09-18", label: "Sep 18 2026" } },
    { feature: "months out", operation: "set", value: 3 },
    { feature: "strike depth", operation: "set", value: 15 },
    ...["Gamma", "Vega", "Theta", "Rho", "Lambda", "Epsilon"].map(value => ({ feature: "Greek visibility", operation: "show", value }))
  ]);
  assert.equal(result.ready_for_live_executor, false);
  assert.equal(result.executable_actions.length, 0);
});

test("Both, Calls and Puts are exact; corrections win and contradictions clarify", () => {
  assert.equal(compileOMONVoice(entitled, "show calls and puts").actions[0].value, "Both");
  assert.equal(compileOMONVoice(entitled, "puts only wait no calls only").actions[0].value, "Calls");
  const conflict = compileOMONVoice(entitled, "calls only and puts only");
  assert.equal(conflict.kind, "clarify");
  assert.equal(conflict.actions.length, 0);
});

test("expiration requires one exact live identity valid for the effective mode", () => {
  const exact = compileOMONVoice(entitled, "calls only next monthly expiry");
  assert.deepEqual(exact.actions[1].value, { id: "2026-09-18", label: "Sep 18 2026" });
  const missing = compileOMONVoice(entitled, "use the next weekly expiry");
  assert.equal(missing.actions.length, 0);
  assert.match(missing.blockers.join(" "), /exact live expiration identity/);
  const duplicate = compileOMONVoice({ ...entitled, live_expirations: [
    { id: "a", label: "A", aliases: ["next expiry"] }, { id: "b", label: "B", aliases: ["next expiry"] }
  ] }, "next expiry");
  assert.match(duplicate.blockers.join(" "), /more than one/);
});

test("configuration enforces entitlement while an authenticated loaded panel preserves native depth", () => {
  const denied = compileOMONVoice({ option_entitlement: false }, "show fifteen strikes");
  assert.equal(denied.executable_actions.length, 0);
  assert.match(denied.blockers.join(" "), /entitlement/);
  const loaded = compileOMONVoice({ existing_panel_authenticated: true }, "show fifteen strikes");
  assert.deepEqual(loaded.executable_actions, loaded.actions);
  assert.equal(loaded.ready_for_live_executor, true);
});

test("native total depth and documented asymmetric depth never collapse together", () => {
  assert.deepEqual(compact(compileOMONVoice(entitled, "show twenty strikes total")), [
    { feature: "strike depth", operation: "set", value: 20 }
  ]);
  assert.deepEqual(compact(compileOMONVoice(entitled, "five strikes either side")), [
    { feature: "strikes above", operation: "set", value: 5 },
    { feature: "strikes below", operation: "set", value: 5 }
  ]);
  assert.match(compileOMONVoice(entitled, "fifteen strikes around spot").blockers.join(" "), /ambiguous/);
});

test("all Greeks support show/hide with noisy pronunciation and conflict detection", () => {
  const hidden = compileOMONVoice(entitled, "hide delta gamma row greek lamb duh and epsylon");
  assert.deepEqual(hidden.actions.map(action => action.value), ["Delta", "Gamma", "Rho", "Lambda", "Epsilon"]);
  assert.ok(hidden.actions.every(action => action.operation === "hide"));
  assert.equal(compileOMONVoice(entitled, "show and hide delta").kind, "clarify");
});

test("columns retain exact live order and reject unknown vocabulary", () => {
  const exact = compileOMONVoice(entitled, "columns Bid Ask Open Interest and IV");
  assert.deepEqual(exact.actions[0].value, ["Bid", "Ask", "Open Interest", "IV"]);
  const unknown = compileOMONVoice(entitled, "columns Bid Magic Score");
  assert.equal(unknown.actions.length, 0);
  assert.match(unknown.blockers.join(" "), /not proven/);
});

test("per-mode remembered configuration preserves the other mode", () => {
  const context = { ...entitled, current_state: { mode: "Calls", per_mode: {
    Calls: { strike_depth: 15, greeks: ["Delta"] },
    Puts: { strike_depth: 10, greeks: ["Theta"], columns: ["Bid", "Ask"] }
  } } };
  const result = compileOMONVoice(context, "puts only with gamma");
  assert.deepEqual(result.desired_state.per_mode.Calls, { strike_depth: 15, greeks: ["Delta"] });
  assert.deepEqual(result.desired_state.per_mode.Puts, { strike_depth: 10, greeks: ["Theta", "Gamma"], columns: ["Bid", "Ask"] });
});

test("contract handoffs bind one exact selected row and can open several read-only destinations", () => {
  const result = compileOMONVoice(entitled, "open this contract in Focus, a chart and black shoals");
  assert.deepEqual(result.actions.map(action => action.value.destination), ["FOCUS", "G", "OVME"]);
  assert.ok(result.actions.every(action => action.value.contract.id === "AAPL-20260918-C-250"));
  const missing = compileOMONVoice({ ...entitled, selected_contract: null }, "open this contract in black scholes");
  assert.equal(missing.actions.length, 0);
  assert.match(missing.blockers.join(" "), /exact selected live row/);
});

test("order, trade and exercise speech is blocked with no action surface", () => {
  for (const phrase of ["buy this option", "sell the contract", "place an order", "submit this trade", "exercise this option"]) {
    const result = compileOMONVoice(entitled, phrase);
    assert.equal(result.kind, "blocked", phrase);
    assert.equal(result.actions.length, 0, phrase);
    assert.match(result.blockers[0], /read-only/, phrase);
  }
});

test("legacy wrapper keeps strike depth live and atomically blocks mixed actions", () => {
  const target = { mode: "command", command: "OMON", security: "AAPL" };
  const live = compileChartOptionsFollowup({ command: "OMON", target }, "show fifteen strikes");
  assert.equal(live.ready_for_live_executor, true);
  assert.deepEqual(compact(live), [{ feature: "strike depth", operation: "set", value: 15 }]);
  const mixed = compileChartOptionsFollowup({ command: "OMON", target }, "calls only with fifteen strikes");
  assert.equal(mixed.ready_for_live_executor, false);
  assert.equal(mixed.executable_actions.length, 0);
});

test("dedicated schema contains every action but no order operation", () => {
  const schema = JSON.parse(fs.readFileSync(new URL("../catalog/contracts/omon-nested.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.oneOf.length, 8);
  const source = JSON.stringify(schema);
  for (const feature of Object.keys(OMON_ACTION_STATES)) assert.match(source, new RegExp(feature), feature);
  assert.doesNotMatch(source, /"operation":\{"const":"(?:buy|sell|submit|order)"/);
  assert.equal(schema["x-capability-state"]["strike depth"], "live-verified");
});
