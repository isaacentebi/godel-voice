import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CALC_FUNCTIONS, compileCALCVoice, compileCalculatorVoice, compileOVMEVoice,
  OVME_OPTION_TYPES, OVME_SOLVES, OVME_TIME_UNITS, validateFiniteCalculationOutput
} from "../src/commands/calculators-followup.mjs";

const complete = {
  option_type: "Call", spot: 200, strike: 210, time_to_expiry: { value: 45, unit: "days" },
  risk_free_rate: { decimal: 0.05, display_percent: 5 }, dividend_yield: { decimal: 0, display_percent: 0 },
  volatility: { decimal: 0.3, display_percent: 30 }, solve: "Option Price"
};

test("publishes exact OVME units, solves and CALC allowlist", () => {
  assert.deepEqual(OVME_OPTION_TYPES, ["Call", "Put"]);
  assert.deepEqual(OVME_TIME_UNITS, ["days", "months", "years"]);
  assert.deepEqual(OVME_SOLVES, ["Option Price", "Implied Volatility"]);
  for (const fn of ["sqrt", "log", "pmt", "fv", "rate", "ear"]) assert.ok(CALC_FUNCTIONS.includes(fn));
});

test("noisy OVME phrase becomes one complete atomic model", () => {
  const result = compileOVMEVoice({}, "price a call spot two hundred strike two ten forty five days five percent rates zero dividend thirty percent vol");
  assert.deepEqual(result.actions, [{ feature: "model", operation: "configure", value: complete, scope: "calculator" }]);
  assert.equal(result.executable_actions.length, 0);
  assert.equal(result.ready_for_live_executor, false);
});

test("implied-volatility solve requires option price instead of volatility", () => {
  const result = compileOVMEVoice({}, "calculate implied vol put spot 100 strike 90 30 days risk-free rate 5 percent dividend 0 option price 12");
  const model = result.actions[0].value;
  assert.equal(model.solve, "Implied Volatility");
  assert.equal(model.option_price, 12);
  assert.equal(model.volatility, undefined);
});

test("percent and decimal speech canonicalize identically", () => {
  const percent = compileOVMEVoice({ current_state: complete }, "volatility 25 percent").desired_state.volatility;
  const decimal = compileOVMEVoice({ current_state: complete }, "volatility 0.25 decimal").desired_state.volatility;
  assert.deepEqual(percent, { decimal: 0.25, display_percent: 25 });
  assert.deepEqual(decimal, percent);
  assert.equal(compileOVMEVoice({ current_state: complete }, "volatility 25").kind, "clarify");
});

test("OVME preserves context while applying only an explicit correction", () => {
  const result = compileOVMEVoice({ current_state: complete }, "volatility twenty percent wait no volatility twenty five percent");
  assert.equal(result.desired_state.spot, 200);
  assert.deepEqual(result.desired_state.volatility, { decimal: 0.25, display_percent: 25 });
});

test("OVME missing fields and missing time units clarify atomically", () => {
  const missing = compileOVMEVoice({}, "price a call spot 100 strike 110 volatility 30 percent");
  assert.equal(missing.kind, "clarify");
  assert.equal(missing.actions.length, 0);
  assert.match(missing.blockers.join(" "), /missing/);
  const unit = compileOVMEVoice({}, "price a call spot 100 strike 110 time 45 rate 5 percent dividend 0 volatility 30 percent");
  assert.equal(unit.kind, "clarify");
  assert.match(unit.blockers.join(" "), /time_to_expiry|time to expiry/);
});

test("OVME contradictions, invalid values and non-finite output fail closed", () => {
  assert.equal(compileOVMEVoice({}, "price a call and put").kind, "clarify");
  assert.equal(compileOVMEVoice({ current_state: complete }, "solve option price and implied volatility").kind, "clarify");
  assert.equal(compileOVMEVoice({ current_state: complete }, "spot -5").kind, "clarify");
  assert.match(compileOVMEVoice({ current_state: complete, computed_output: Infinity }, "volatility 20 percent").blockers.join(" "), /finite/);
});

test("OVME is calculation-only and has no trading escape hatch", () => {
  for (const phrase of ["buy this call", "sell the put", "place an order", "exercise this option"]) {
    const result = compileOVMEVoice({}, phrase);
    assert.equal(result.kind, "blocked", phrase);
    assert.equal(result.actions.length, 0, phrase);
  }
});

test("CALC respects precedence and natural spoken operators", () => {
  const result = compileCALCVoice({}, "calculate two plus two times three");
  assert.deepEqual(result.actions[0].value, { expression: "2 + 2 * 3", result: 8 });
  const power = compileCALCVoice({}, "three squared plus two to the power of three");
  assert.equal(power.actions[0].value.result, 17);
});

test("CALC supports scientific and financial allowlisted functions", () => {
  assert.equal(compileCALCVoice({}, "square root of nine plus log of one hundred").actions[0].value.result, 5);
  const payment = compileCALCVoice({}, "pmt(0.06/12,360,500000)").actions[0].value.result;
  assert.ok(Number.isFinite(payment));
  assert.ok(payment < 0);
  const ear = compileCALCVoice({}, "ear(0.12,12)").actions[0].value.result;
  assert.ok(ear > 0.12 && ear < 0.13);
});

test("CALC corrections and authoritative previous-expression followups work", () => {
  assert.equal(compileCALCVoice({}, "two plus two wait no three squared").actions[0].value.result, 9);
  const result = compileCALCVoice({ current_state: { expression: "10+2", result: 12 } }, "divide that by two");
  assert.deepEqual(result.actions[0].value, { expression: "(10+2) / 2", result: 6 });
});

test("CALC blocks arbitrary code and rejects non-finite or compound results", () => {
  for (const phrase of ["process.exit(1)", "constructor.constructor(1)", "fetch(example)", "2;2"]) {
    assert.equal(compileCALCVoice({}, phrase).kind, "blocked", phrase);
  }
  assert.equal(compileCALCVoice({}, "one divided by zero").kind, "clarify");
  assert.equal(compileCALCVoice({}, "two plus two and then three plus three").kind, "clarify");
  assert.throws(() => validateFiniteCalculationOutput(NaN), /finite/);
});

test("dispatcher stays command-scoped and both results remain runtime-disabled", () => {
  assert.equal(compileCalculatorVoice({ command: "OVME", current_state: complete }, "volatility 20 percent").command, "OVME");
  assert.equal(compileCalculatorVoice({ command: "CALC" }, "two plus two").command, "CALC");
  assert.equal(compileCalculatorVoice({ command: "G" }, "two plus two"), null);
  assert.equal(compileCALCVoice({}, "two plus two").ready_for_live_executor, false);
});

test("dedicated schema is calculation-only, finite-shaped and runtime-disabled", () => {
  const schema = JSON.parse(fs.readFileSync(new URL("../catalog/contracts/calculators-nested.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.oneOf.length, 2);
  assert.equal(schema["x-runtime-enabled"], false);
  const source = JSON.stringify(schema);
  for (const value of ["Option Price", "Implied Volatility", "days", "months", "years", "expression", "result"]) assert.match(source, new RegExp(value));
  assert.doesNotMatch(source, /"operation":\{"const":"(?:buy|sell|order|trade)"/);
});
