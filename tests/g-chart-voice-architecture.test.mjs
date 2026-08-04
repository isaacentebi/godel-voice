import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  compileGChartVoice, G_ACTION_STATES, G_RANGES, G_RESOLUTIONS, G_SCALES, G_STYLES
} from "../src/g-chart-followup.mjs";
import { compileChartOptionsFollowup } from "../src/chart-options-followup.mjs";

const values = result => result.actions.map(({ feature, value }) => [feature, value]);

test("G exports the exact documented static vocabularies", () => {
  assert.deepEqual(G_RESOLUTIONS, ["1m", "5m", "15m", "30m", "1h", "1d"]);
  assert.deepEqual(G_RANGES, ["5y", "1y", "6m", "3m", "1m", "5d", "1d"]);
  assert.ok(G_STYLES.includes("Heikin Ashi"));
  assert.deepEqual(G_SCALES, ["linear", "percent", "indexed", "log"]);
  assert.equal(G_ACTION_STATES.resolution, "live-bounded");
  assert.equal(G_ACTION_STATES.indicator, "unbound");
});

test("a noisy complex chart phrase compiles without claiming UI execution", () => {
  const result = compileGChartVoice({ command: "G" }, "uh make it an hourly candle sticks chart for six months on log a rhythmic scale please");
  assert.deepEqual(values(result), [["resolution", "1h"], ["range", "6m"], ["style", "Candles"], ["scale", "log"]]);
  assert.equal(result.ready_for_live_executor, false);
  assert.equal(result.executable_actions.length, 0);
});

test("rejected inline resolution syntax stays out of CLI while only contextual 1h is live", () => {
  const opening = compileGChartVoice({ command: "G", opening: true }, "open a fifteen minute chart");
  assert.deepEqual(opening.cli_arguments, []);
  assert.equal(opening.ready_for_cli, false);
  const contextual = compileGChartVoice({ command: "G" }, "change this to fifteen minutes");
  assert.equal(contextual.ready_for_live_executor, false);
  assert.match(contextual.blockers.join(" "), /resolution 15m is runtime-disabled/);
  const hourly = compileGChartVoice({ command: "G" }, "uh make the chart hourly please");
  assert.deepEqual(hourly.executable_actions, [{ feature: "resolution", operation: "select", value: "1h", scope: "chart" }]);
  assert.equal(hourly.ready_for_live_executor, true);
});

test("spoken corrections win and direct contradictions clarify", () => {
  const corrected = compileGChartVoice({ command: "G" }, "candles wait no he can ashi");
  assert.deepEqual(values(corrected), [["style", "Heikin Ashi"]]);
  for (const phrase of [
    "make it hourly and daily", "use candles and bars", "use linear and log scale",
    "show the drawings toolbar and hide the drawings toolbar"
  ]) {
    const result = compileGChartVoice({ command: "G" }, phrase);
    assert.equal(result.kind, "clarify", phrase);
    assert.equal(result.actions.length, 0, phrase);
  }
});

test("compare symbols require one authoritative resolved identity", () => {
  const context = { command: "G", resolved_securities: [{ ticker: "MSFT", spoken_name: "Microsoft", aliases: ["micro soft"] }] };
  assert.deepEqual(values(compileGChartVoice(context, "compare this chart with micro soft")), [["compare", "MSFT"]]);
  const unknown = compileGChartVoice(context, "compare this chart with Amazon");
  assert.equal(unknown.actions.length, 0);
  assert.match(unknown.blockers.join(" "), /resolved security identity/);
});

test("indicators are accepted only from the exact current live vocabulary", () => {
  const result = compileGChartVoice({ command: "G", live_indicators: ["RSI", "MACD"] }, "add RSI and MACD indicators");
  assert.deepEqual(values(result), [["indicator", "RSI"], ["indicator", "MACD"]]);
  const guessed = compileGChartVoice({ command: "G" }, "add the supertrend indicator");
  assert.equal(guessed.actions.length, 0);
  assert.match(guessed.blockers.join(" "), /dynamic TradingView vocabulary/);
});

test("drawings and exact live layouts compile as unbound candidates", () => {
  assert.deepEqual(values(compileGChartVoice({ command: "G" }, "hide the drawings toolbar")), [["drawings toolbar", "Hide"]]);
  const layout = compileGChartVoice({ command: "G", live_layouts: ["Macro Desk", "Trading"] }, "open the Macro Desk chart layout");
  assert.deepEqual(values(layout), [["layout", "Macro Desk"]]);
  assert.match(compileGChartVoice({ command: "G", live_layouts: ["Trading"] }, "open the Macro Desk chart layout").blockers.join(" "), /exact live layout/);
});

test("layout saves and alerts retain a separate confirmation gate", () => {
  const save = compileGChartVoice({ command: "G" }, "save the current chart layout");
  assert.equal(save.confirmation_required, true);
  const alert = compileGChartVoice({ command: "G" }, "set a price alert when it crosses 200 confirmed");
  assert.equal(alert.actions[0].feature, "alert");
  assert.equal(alert.actions[0].value.confirmed, true);
  assert.equal(alert.confirmation_required, true);
  assert.equal(alert.ready_for_live_executor, false);
});

test("snapshots remain unbound and ambiguous chart saves clarify", () => {
  const snapshot = compileGChartVoice({ command: "G" }, "take a chart snapshot");
  assert.deepEqual(values(snapshot), [["snapshot", "PNG"]]);
  assert.equal(snapshot.ready_for_live_executor, false);
  assert.equal(compileGChartVoice({ command: "G" }, "save this chart").kind, "clarify");
});

test("custom ranges require valid ordered ISO dates", () => {
  const valid = compileGChartVoice({ command: "G" }, "from 2025-01-01 to 2026-08-01");
  assert.deepEqual(valid.actions[0].value, { start: "2025-01-01", end: "2026-08-01" });
  assert.equal(compileGChartVoice({ command: "G" }, "from 2026-08-01 to 2025-01-01").kind, "clarify");
  assert.equal(compileGChartVoice({ command: "G" }, "from 2026-02-30 to 2026-03-01").kind, "clarify");
});

test("compound CLI plus unbound UI is atomic", () => {
  const result = compileGChartVoice({ command: "G", opening: true, live_indicators: ["RSI"] }, "open a one hour chart and add RSI indicator");
  assert.deepEqual(result.cli_arguments, []);
  assert.equal(result.ready_for_cli, false);
  assert.equal(result.executable_actions.length, 0);
});

test("legacy wrapper preserves G blocker wording and GF HP FA OMON behavior", () => {
  assert.match(compileChartOptionsFollowup("G", "add the supertrend indicator").blockers.join(" "), /dynamic TradingView vocabulary/);
  assert.equal(compileChartOptionsFollowup("GF", "add Microsoft revenue").actions[0].value, "MSFT");
  assert.equal(compileChartOptionsFollowup("HP", "one minute").actions[0].value, "1M");
  assert.equal(compileChartOptionsFollowup("FA", "annual cash flow").actions[0].value, "Cash Flow");
  assert.equal(compileChartOptionsFollowup("OMON", "calls only").actions[0].value, "Calls");
});

test("dedicated schema enumerates all modeled G boundaries", () => {
  const schema = JSON.parse(fs.readFileSync(new URL("../data/g-chart-nested.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.oneOf.length, 12);
  const source = JSON.stringify(schema);
  for (const feature of Object.keys(G_ACTION_STATES)) assert.match(source, new RegExp(feature.replace(" ", "\\s")), feature);
  assert.match(schema.description, /runtime-disabled/);
  assert.match(schema.description, /confirmation-gated/);
});
