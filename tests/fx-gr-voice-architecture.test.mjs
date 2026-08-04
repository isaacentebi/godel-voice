import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { compileFXGRVoice, compileFXVoice, compileGRVoice, groundedFXResult, groundedGRResult, GR_ACTION_STATES, GR_PERIODS } from "../src/fx-gr-followup.mjs";
import { validateWorkflowPlan } from "../src/workflow-plan.mjs";

const fx = { live_currencies: [
  { code: "USD", name: "US Dollar", aliases: ["dollar", "dollars"] },
  { code: "EUR", name: "Euro", aliases: ["euros"] },
  { code: "JPY", name: "Japanese Yen", aliases: ["yen"] },
  { code: "MXN", name: "Mexican Peso", aliases: ["Mexican pesos", "pesos"] }
] };

const gr = {
  resolved_securities: [
    { ticker: "AAPL", spoken_name: "Apple", aliases: ["apple computer"] },
    { ticker: "MSFT", spoken_name: "Microsoft", aliases: ["micro soft"] },
    { ticker: "NVDA", spoken_name: "Nvidia", aliases: [] }
  ],
  live_longer_periods: [{ value: "5Y", aliases: ["five year", "five years"] }]
};

const compact = result => result.actions.map(({ feature, operation, value }) => ({ feature, operation, value }));

test("publishes exact GR static periods without guessing longer values", () => {
  assert.deepEqual(GR_PERIODS, ["1D", "1W", "1M", "3M", "6M", "1Y", "longer"]);
  assert.ok(Object.values(GR_ACTION_STATES).every(state => state === "existing-runtime-unverified"));
});

test("FX resolves dynamic exact currencies, noisy amount and invert atomically", () => {
  const result = compileFXVoice(fx, "convert ten thousand euros to yen then invert the pair");
  assert.deepEqual(result.actions, [{ feature: "conversion", operation: "configure", value: {
    from: "EUR", to: "JPY", amount: 10000, invert: true
  }, scope: "calculator" }]);
  assert.equal(result.ready_for_live_executor, false);
});

test("FX context preserves omitted fields for short direction and invert followups", () => {
  const context = { ...fx, current_state: { from: "USD", to: "JPY", amount: 250 } };
  assert.deepEqual(compileFXVoice(context, "to euros").desired_state, { from: "USD", to: "EUR", amount: 250 });
  assert.deepEqual(compileFXVoice(context, "invert it").desired_state, { from: "USD", to: "JPY", amount: 250, invert: true });
});

test("FX corrections win and uncorrected currency contradictions clarify", () => {
  const corrected = compileFXVoice(fx, "convert 100 dollars to yen wait no convert 100 dollars to euros");
  assert.equal(corrected.desired_state.to, "EUR");
  assert.equal(compileFXVoice(fx, "convert 100 dollars to euros and yen").kind, "clarify");
});

test("FX rejects unknown, ambiguous, equal and negative conversion requests", () => {
  assert.match(compileFXVoice(fx, "convert 100 dollars to martian credits").blockers.join(" "), /requires to|exact identities/);
  assert.match(compileFXVoice(fx, "convert 100 euros").blockers.join(" "), /ambiguous/);
  assert.match(compileFXVoice({ ...fx, current_state: { from: "USD", to: "USD", amount: 1 } }, "invert it").blockers.join(" "), /must differ/);
  assert.match(compileFXVoice(fx, "convert minus five dollars to yen").blockers.join(" "), /cannot be negative/);
});

test("FX converted narration is grounded only in exact observed panel evidence", () => {
  const evidence = { converted_result: { amount: 1623450, currency: "JPY", source: { panel: "FX", observed_at: "2026-08-04T00:00:00Z" } } };
  assert.deepEqual(groundedFXResult(evidence), evidence.converted_result);
  assert.equal(groundedFXResult({ converted_result: { amount: Infinity, currency: "JPY", source: { panel: "FX", observed_at: "x" } } }), null);
  assert.equal(groundedFXResult({ converted_result: { amount: 10, currency: "JPY", source: { panel: "OTHER", observed_at: "x" } } }), null);
});

test("GR resolves trusted legs and records exact numerator/denominator semantics", () => {
  const result = compileGRVoice(gr, "Apple versus Microsoft one year ratio with a sixty day correlation and regression");
  assert.deepEqual(compact(result), [
    { feature: "buy leg", operation: "select", value: "AAPL" },
    { feature: "sell leg", operation: "select", value: "MSFT" },
    { feature: "period", operation: "select", value: "1Y" },
    { feature: "correlation toggle", operation: "select", value: "on" },
    { feature: "correlation window", operation: "set", value: 60 },
    { feature: "regression toggle", operation: "select", value: "on" }
  ]);
  assert.deepEqual(result.desired_state.ratio, { numerator: "AAPL", denominator: "MSFT", semantics: "buy price divided by sell price" });
  assert.equal(result.ready_for_live_executor, false);
});

test("GR longer periods require an exact live period identity", () => {
  assert.equal(compileGRVoice(gr, "Apple divided by Microsoft five year ratio").desired_state.period, "5Y");
  const blocked = compileGRVoice({ ...gr, live_longer_periods: [] }, "Apple divided by Microsoft five year ratio");
  assert.equal(blocked.kind, "clarify");
  assert.match(blocked.blockers.join(" "), /exact value/);
});

test("GR context preserves legs while explicit directed changes replace one side", () => {
  const context = { ...gr, current_state: { buy: "AAPL", sell: "MSFT", period: "1Y", correlation: false } };
  const result = compileGRVoice(context, "sell leg Nvidia");
  assert.equal(result.desired_state.buy, "AAPL");
  assert.equal(result.desired_state.sell, "NVDA");
});

test("GR correlation requires an explicit valid day window", () => {
  assert.match(compileGRVoice(gr, "Apple versus Microsoft with correlation").blockers.join(" "), /explicit rolling window/);
  assert.match(compileGRVoice(gr, "Apple versus Microsoft with a 1-day correlation").blockers.join(" "), /2 to 730/);
  const off = compileGRVoice({ ...gr, current_state: { buy: "AAPL", sell: "MSFT", correlation: true, correlation_window: 30 } }, "turn correlation off");
  assert.equal(off.actions[0].value, "off");
});

test("GR correction and contradiction handling is fail-closed", () => {
  assert.equal(compileGRVoice(gr, "Apple versus Microsoft with full data wait no Apple versus Microsoft using filtered data").desired_state.data, "Filtered");
  assert.equal(compileGRVoice(gr, "Apple versus Microsoft using full and filtered data").kind, "clarify");
  assert.equal(compileGRVoice(gr, "Apple versus Microsoft with and without regression").kind, "clarify");
  assert.equal(compileGRVoice(gr, "Apple Microsoft Nvidia ratio").kind, "clarify");
});

test("GR refuses guessed identities, equal legs and actual trading language", () => {
  assert.match(compileGRVoice(gr, "Apple versus Amazon ratio").blockers.join(" "), /trusted security resolver/);
  assert.match(compileGRVoice({ ...gr, current_state: { buy: "AAPL", sell: "AAPL" } }, "one year").blockers.join(" "), /must differ/);
  for (const phrase of ["buy shares of Apple", "sell Microsoft stock", "place a trade"]) assert.equal(compileGRVoice(gr, phrase).kind, "blocked", phrase);
});

test("GR numeric narration requires finite timestamped panel evidence", () => {
  const evidence = { observed_result: { ratio: 1.25, correlation: 0.8, beta: 1.1, source: { panel: "GR", observed_at: "2026-08-04T00:00:00Z" } } };
  assert.deepEqual(groundedGRResult(evidence), evidence.observed_result);
  assert.equal(groundedGRResult({ observed_result: { ratio: NaN, source: { panel: "GR", observed_at: "x" } } }), null);
  assert.equal(groundedGRResult({ observed_result: { ratio: 1, source: { panel: "G", observed_at: "x" } } }), null);
});

test("existing GR workflow action shapes remain accepted but are not newly promoted", () => {
  const plan = validateWorkflowPlan({ version: 2, failure_policy: "stop_on_any", steps: [{
    id: "gr", kind: "configure", target: { mode: "command", command: "GR", security: "AAPL" },
    actions: [
      { feature: "sell leg", operation: "select", value: "MSFT" },
      { feature: "period", operation: "select", value: "1Y" },
      { feature: "correlation toggle", operation: "select", value: "on" },
      { feature: "correlation window", operation: "set", value: 60 },
      { feature: "regression toggle", operation: "select", value: "on" },
      { feature: "full/filtered data", operation: "select", value: "Filtered" }
    ]
  }] });
  assert.equal(plan.steps[0].actions.length, 6);
  assert.equal(compileGRVoice(gr, "Apple versus Microsoft").executable_actions.length, 0);
});

test("dispatcher is scoped and schema records disabled safety boundaries", () => {
  assert.equal(compileFXGRVoice({ ...fx, command: "FX" }, "convert 1 dollars to yen").command, "FX");
  assert.equal(compileFXGRVoice({ ...gr, command: "GR" }, "Apple versus Microsoft").command, "GR");
  assert.equal(compileFXGRVoice({ command: "G" }, "Apple versus Microsoft"), null);
  const schema = JSON.parse(fs.readFileSync(new URL("../data/contracts/fx-gr-nested.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.oneOf.length, 6);
  assert.equal(schema["x-runtime-enabled"], false);
  assert.equal(schema["x-existing-gr-runtime-preserved"], true);
  assert.doesNotMatch(JSON.stringify(schema), /"operation":\{"const":"(?:buy|sell|trade|order)"/);
});
