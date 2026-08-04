import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { compileHMAPFollowup, HMAP_ACTION_STATES } from "../src/commands/hmap-followup.mjs";
import { parseControlFollowup } from "../src/control-followup.mjs";

const focused = { focused_panel: { window_id: "hmap-1", command: "HMAP", security: null } };

test("compiles a broad noisy HMAP request in deterministic toolbar order", () => {
  const result = compileHMAPFollowup({}, "uh use my semis watch list, size by absolute percint change, label with percentage change, hide the sector headers, stop animayshun, refresh the heat map every two seconds, auto colors and open movers");
  assert.equal(result.command, "HMAP");
  assert.deepEqual(result.actions, [
    { feature: "watchlist", operation: "select", value: "Semis" },
    { feature: "size by", operation: "select", value: "Chg % abs" },
    { feature: "label", operation: "select", value: "Chg %" },
    { feature: "sectors", operation: "select", value: "Hide" },
    { feature: "animate", operation: "select", value: "Off" },
    { feature: "update interval", operation: "set", value: 2000 },
    { feature: "color", operation: "select", value: "Auto" },
    { feature: "movers", operation: "select", value: "Open" }
  ]);
  assert.equal(result.ready_for_live_executor, false);
  assert.equal(result.executable_actions.length, 0);
});

test("canonicalizes the two index universes and spoken millisecond counts", () => {
  const sp = compileHMAPFollowup({}, "switch the heat map to the s and p five hundred and update every seven hundred fifty milliseconds");
  assert.deepEqual(sp.actions.slice(0, 2), [
    { feature: "universe", operation: "select", value: "S&P 500" },
    { feature: "update interval", operation: "set", value: 750 }
  ]);
  const dow = compileHMAPFollowup({}, "show the Dow Jones heatmap");
  assert.deepEqual(dow.actions[0], { feature: "universe", operation: "select", value: "DJIA" });
});

test("index universe and Map/Table are the only live HMAP nested actions", () => {
  assert.equal(HMAP_ACTION_STATES.universe, "live");
  assert.equal(HMAP_ACTION_STATES.view, "live");
  for (const [feature, state] of Object.entries(HMAP_ACTION_STATES)) {
    if (!["universe", "view"].includes(feature)) assert.equal(state, "unbound", feature);
  }
  const noisy = compileHMAPFollowup({}, "uh jarvis switch this heat map to the dow jones please");
  assert.equal(noisy.ready_for_live_executor, true);
  assert.deepEqual(noisy.executable_actions, [{ feature: "universe", operation: "select", value: "DJIA" }]);
  const candidate = compileHMAPFollowup({}, "switch this heatmap to table view");
  assert.equal(candidate.ready_for_live_executor, true);
  assert.deepEqual(candidate.executable_actions, [{ feature: "view", operation: "select", value: "Table" }]);
  const workflow = parseControlFollowup("switch this heatmap to table view", focused);
  assert.equal(workflow.steps[0].actions[0].value, "Table");
});

test("a live universe plus live view compiles atomically", () => {
  const candidate = compileHMAPFollowup({}, "switch this heatmap to the S and P five hundred in table view");
  assert.equal(candidate.ready_for_live_executor, true);
  assert.deepEqual(candidate.executable_actions, [
    { feature: "universe", operation: "select", value: "S&P 500" },
    { feature: "view", operation: "select", value: "Table" }
  ]);
});

test("a compound request with an unbound control never partially executes Table", () => {
  const candidate = compileHMAPFollowup({}, "hide sector headers and switch this heatmap to table view");
  assert.deepEqual(candidate.actions.map(action => action.feature), ["sectors", "view"]);
  assert.equal(candidate.executable_actions.length, 0);
  assert.equal(parseControlFollowup("hide sector headers and switch this heatmap to table view", focused), null);
});

test("contradictory index, toggle, color, Movers and view phrases clarify", () => {
  for (const phrase of [
    "use the S and P and Dow heatmap",
    "show sector headers and hide sector headers on this heatmap",
    "turn on animation and turn off animation on this heatmap",
    "use auto color and manual color on this heatmap",
    "open movers and close movers on this heatmap",
    "switch the heatmap to table view and map view"
  ]) {
    const result = compileHMAPFollowup({}, phrase);
    assert.equal(result.kind, "clarify", phrase);
    assert.equal(result.actions.length, 0, phrase);
  }
});

test("manual color parameters stay independently blocked", () => {
  const result = compileHMAPFollowup({}, "use manual heatmap colors from minus five to plus five");
  assert.deepEqual(result.actions, [{ feature: "color", operation: "select", value: "Manual" }]);
  assert.ok(result.blockers.some(value => /manual color parameters/.test(value)));
  assert.equal(result.ready_for_live_executor, false);
});

test("tile quick-action handoff requires exact live tile and action options and remains unbound", () => {
  const absent = compileHMAPFollowup({}, "from the META tile open Description");
  assert.ok(absent.blockers.some(value => /exact live tile/.test(value)));
  const exact = compileHMAPFollowup({ live_tiles: ["META"], live_quick_actions: ["Description", "Chart"] }, "from the META tile open Description");
  assert.deepEqual(exact.actions, [{
    feature: "tile quick action", operation: "handoff", value: { ticker: "META", action: "Description" }
  }]);
  assert.equal(exact.ready_for_live_executor, false);
});

test("dedicated schema enumerates strict exact controls without promoting runtime", () => {
  const schema = JSON.parse(fs.readFileSync(new URL("../catalog/contracts/hmap-nested.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.oneOf.length, 11);
  const serialized = JSON.stringify(schema);
  for (const value of ["S&P 500", "DJIA", "Auto", "Manual", "Open", "Closed", "Map", "Table"]) assert.match(serialized, new RegExp(value.replace(/[&]/g, "\\$&")));
  assert.match(schema.description, /runtime-disabled/);
});
