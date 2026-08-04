import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compileChartOptionsFollowup } from "../src/chart-options-followup.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inventory = JSON.parse(fs.readFileSync(path.join(root, "data", "contracts", "chart-options-capability-inventory-v2.json"), "utf8"));

function compact(result) {
  return result.actions.map(({ feature, operation, value }) => ({ feature, operation, value }));
}

test("compiles a complex contextual chart followup without claiming execution", () => {
  const result = compileChartOptionsFollowup("G", "make it a one hour candle chart for six months on log scale");
  assert.deepEqual(compact(result), [
    { feature: "resolution", operation: "select", value: "1h" },
    { feature: "range", operation: "select", value: "6m" },
    { feature: "style", operation: "select", value: "Candles" },
    { feature: "scale", operation: "select", value: "log" }
  ]);
  assert.equal(result.ready_for_live_executor, false);
  assert.equal(result.unbound_actions.length, 3);
  assert.equal(result.executable_actions.length, 0);
});

test("enables only the independently proven contextual one-hour chart change", () => {
  const hourly = compileChartOptionsFollowup({ command: "G", target: { mode: "focused", command: "G", security: "AAPL" } }, "uh make it hourly");
  assert.equal(hourly.ready_for_live_executor, true);
  assert.deepEqual(compact(hourly), [{ feature: "resolution", operation: "select", value: "1h" }]);
  assert.equal(hourly.actions[0].capability_state, "live-verified");
  const daily = compileChartOptionsFollowup("G", "make it daily");
  assert.equal(daily.ready_for_live_executor, false);
});

test("blocks guessed TradingView indicators", () => {
  const result = compileChartOptionsFollowup("chart", "add the supertrend indicator");
  assert.match(result.blockers.join(" "), /dynamic TradingView vocabulary/);
  assert.equal(result.actions.length, 0);
});

test("compiles source-backed GF range, estimate, company and metric followups", () => {
  const result = compileChartOptionsFollowup({ command: "GF", target: { mode: "command", command: "GF", security: "AMZN" } },
    "add Microsoft and show five years of operating margin with estimates");
  assert.deepEqual(compact(result), [
    { feature: "add company", operation: "add", value: "MSFT" },
    { feature: "range", operation: "select", value: "5Y" },
    { feature: "include consensus estimates", operation: "select", value: "on" },
    { feature: "margin metric", operation: "add", value: "Operating Margin" }
  ]);
  assert.equal(result.ready_for_live_executor, true);
  assert.equal(result.target.security, "AMZN");
});

test("adds multiple known companies without treating arbitrary short words as tickers", () => {
  const result = compileChartOptionsFollowup("GF", "add Microsoft and Meta then overlay revenue");
  assert.ok(result.actions.some(item => item.feature === "add company" && item.value === "MSFT"));
  assert.ok(result.actions.some(item => item.feature === "add company" && item.value === "META"));
  assert.ok(!result.actions.some(item => item.value === "AND"));
});

test("does not misrepresent GF forward P E", () => {
  const result = compileChartOptionsFollowup("GF", "show forward p e for five years");
  assert.match(result.blockers.join(" "), /without a verified forward-versus-trailing label/);
  assert.ok(!result.actions.some(item => item.value === "P/E"));
  assert.ok(result.actions.some(item => item.value === "5Y"));
});

test("blocks compact forward PE transcription too", () => {
  const result = compileChartOptionsFollowup("GF", "forward pe please");
  assert.match(result.blockers.join(" "), /forward-versus-trailing/);
  assert.equal(result.actions.length, 0);
});

test("compiles verified GF annual, split, and display-currency controls", () => {
  const result = compileChartOptionsFollowup("fundamentals graph", "switch to annual data and split the graph in euros");
  assert.deepEqual(compact(result), [
    { feature: "periodicity", operation: "select", value: "Annual" },
    { feature: "layout", operation: "select", value: "Split" },
    { feature: "display currency", operation: "select", value: "EUR" }
  ]);
  assert.equal(result.ready_for_live_executor, true);
});

test("compiles HP minute resolution and explicit download format", () => {
  const result = compileChartOptionsFollowup("historical prices", "switch to one minute and export every row to Excel");
  assert.deepEqual(compact(result), [
    { feature: "resolution", operation: "select", value: "1M" },
    { feature: "export", operation: "download", value: "Excel" }
  ]);
  assert.equal(result.ready_for_live_executor, false);
});

test("compiles FA statement, periodicity and export", () => {
  const result = compileChartOptionsFollowup("financial statements", "annual cash flow and download JSON");
  assert.deepEqual(compact(result), [
    { feature: "statement", operation: "select", value: "Cash Flow" },
    { feature: "periodicity", operation: "select", value: "Yearly" },
    { feature: "export", operation: "download", value: "JSON" }
  ]);
});

test("canonicalizes OPT and compiles options mode, depth and Greeks", () => {
  const result = compileChartOptionsFollowup("OPT", "calls three months out ten strikes above five below with delta gamma vega and theta");
  assert.equal(result.command, "OMON");
  assert.deepEqual(compact(result), [
    { feature: "mode", operation: "select", value: "Calls" },
    { feature: "months out", operation: "set", value: 3 },
    { feature: "strikes above", operation: "set", value: 10 },
    { feature: "strikes below", operation: "set", value: 5 },
    { feature: "Greek visibility", operation: "show", value: "Delta" },
    { feature: "Greek visibility", operation: "show", value: "Gamma" },
    { feature: "Greek visibility", operation: "show", value: "Vega" },
    { feature: "Greek visibility", operation: "show", value: "Theta" }
  ]);
});

test("requires live expiration and refuses ambiguous strikes around spot", () => {
  const result = compileChartOptionsFollowup("OMON", "next monthly expiry with fifteen strikes around spot");
  assert.match(result.blockers.join(" "), /exact live expiration/);
  assert.match(result.blockers.join(" "), /above versus below/);
});

test("compiles exact selected-contract handoff only as documented-unbound", () => {
  const result = compileChartOptionsFollowup("CALL", "open the selected contract in Black Scholes");
  assert.deepEqual(compact(result), [{ feature: "contract", operation: "open", value: "OVME" }]);
  assert.equal(result.ready_for_live_executor, false);
});

test("returns null for unrelated or unsupported context", () => {
  assert.equal(compileChartOptionsFollowup("N", "show Reuters"), null);
  assert.equal(compileChartOptionsFollowup("FA", "make the terminal purple"), null);
});

test("inventory and parser cover exactly the audited command families", () => {
  assert.deepEqual(inventory.commands.map(command => command.command), ["G", "GF", "HP", "FA", "OMON"]);
  for (const command of inventory.commands) {
    assert.ok(command.actions.length > 0, command.command);
    assert.ok(command.voice.length > 0, command.command);
    assert.ok(command.evidence.length > 0, command.command);
    for (const action of command.actions) {
      assert.match(action.state, /source-verified|documented-unbound|live-observed|blocked-live/);
      assert.match(action.completion, /\S/);
    }
  }
});

test("all documented downloads remain explicitly unbound or artifact-unverified", () => {
  for (const command of inventory.commands) {
    for (const action of command.actions.filter(item => ["download", "open"].includes(item.operation) && /export|snapshot/.test(item.feature))) {
      assert.match(action.state, /unbound|unverified/);
    }
  }
});
