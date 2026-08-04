import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildWorkflowPlan } from "../src/automation-plan.mjs";
import { parseControlFollowup } from "../src/control-followup.mjs";
import { compileMOSTFollowup } from "../src/commands/most-followup.mjs";
import {
  MOST_CAP_UNITS, MOST_RANKINGS, MOST_RESULT_COUNTS, MOST_SECTORS,
  normalizeMOSTUnboundAction, rawMOSTCap
} from "../src/commands/most-actions.mjs";
import { validateWorkflowPlan } from "../src/workflow-plan.mjs";

const target = { mode: "command", command: "MOST", security: null };
const intent = action => ({
  kind: "execute", confidence: 1, command: "MOST", security: null, query: null,
  arguments: [], post_open_actions: [action], clarification: null, reason: "MOST request"
});

test("MOST voice contract exposes exact documented rankings, counts, units, and sectors", () => {
  assert.deepEqual(MOST_RANKINGS, ["Active", "Gainers", "Losers", "Value"]);
  assert.deepEqual(MOST_RESULT_COUNTS, [10, 25, 50, 100]);
  assert.deepEqual(MOST_CAP_UNITS, ["raw", "K", "M", "B", "T"]);
  assert.deepEqual(MOST_SECTORS, [
    "All", "Financial Services", "Healthcare", "Technology", "Industrials", "Consumer Cyclical",
    "Basic Materials", "Energy", "Real Estate", "Communication Services", "Consumer Defensive", "Utilities"
  ]);
});

test("noisy MOST speech compiles the full filter stack while only result count is live", () => {
  const draft = compileMOSTFollowup({ command: "MOST", target },
    "jarvis show fifty tech knology gay nerds over ten bill market cab");
  assert.deepEqual(draft.actions, [
    { feature: "ranking", operation: "select", value: "Gainers" },
    { feature: "results", operation: "select", value: 50 },
    { feature: "market_cap", operation: "set", value: { minimum: { value: 10, unit: "B" }, maximum: null } },
    { feature: "sector", operation: "select", value: "Technology" }
  ]);
  assert.equal(draft.ready_for_live_executor, false);
  assert.match(draft.blocked_reason, /ranking, market-cap, and sector/);
});

test("MOST distinguishes share activity, dollar value, gainers, and losers", () => {
  const cases = [
    ["most active stocks by share volume", "Active"],
    ["rank by dollar volume", "Value"],
    ["show the winners", "Gainers"],
    ["show the worst performers", "Losers"]
  ];
  for (const [speech, expected] of cases) {
    assert.equal(compileMOSTFollowup("MOST", speech).actions[0].value, expected);
  }
  assert.equal(compileMOSTFollowup("MOST", "gainers sorry losers").actions[0].value, "Losers");
});

test("MOST parses exact result counts and never mistakes a cap amount for result count", () => {
  for (const [speech, expected] of [["show ten results", 10], ["top twenty five", 25], ["show fifty names", 50], ["limit one hundred", 100]]) {
    const draft = compileMOSTFollowup("MOST", speech);
    assert.deepEqual(draft.actions, [{ feature: "results", operation: "select", value: expected }]);
    assert.equal(draft.ready_for_live_executor, true);
  }
  const capOnly = compileMOSTFollowup("MOST", "above ten billion market cap");
  assert.equal(capOnly.actions.some(action => action.feature === "results"), false);
  assert.match(compileMOSTFollowup("MOST", "show twenty results").blockers.join(" "), /use exactly 10, 25, 50, or 100/);
});

test("MOST parses minimum, maximum, and between bounds across K M B T units", () => {
  const cases = [
    ["above five thousand", { minimum: { value: 5, unit: "K" }, maximum: null }],
    ["under twenty million", { minimum: null, maximum: { value: 20, unit: "M" } }],
    ["at least ten billion", { minimum: { value: 10, unit: "B" }, maximum: null }],
    ["no more than two trillion", { minimum: null, maximum: { value: 2, unit: "T" } }],
    ["between five and five hundred billion", { minimum: { value: 5, unit: "B" }, maximum: { value: 500, unit: "B" } }]
  ];
  for (const [speech, expected] of cases) {
    assert.deepEqual(compileMOSTFollowup("MOST", speech).actions[0].value, expected);
  }
  assert.equal(rawMOSTCap({ value: 2, unit: "T" }), 2e12);
});

test("MOST maps only exact documented sectors", () => {
  const phrases = new Map([
    ["all sectors", "All"], ["financials", "Financial Services"], ["health care", "Healthcare"],
    ["tech", "Technology"], ["industrials", "Industrials"], ["consumer cyclical", "Consumer Cyclical"],
    ["basic materials", "Basic Materials"], ["energy", "Energy"], ["real estate", "Real Estate"],
    ["communication services", "Communication Services"], ["consumer staples", "Consumer Defensive"], ["utilities", "Utilities"]
  ]);
  for (const [speech, expected] of phrases) {
    assert.equal(compileMOSTFollowup("MOST", speech).actions.at(-1).value, expected);
  }
  assert.equal(compileMOSTFollowup("MOST", "show aerospace names"), null);
});

test("MOST fails closed on ranking, sector, count, and range contradictions", () => {
  assert.match(compileMOSTFollowup("MOST", "gainers and losers").blockers.join(" "), /Conflicting MOST rankings/);
  assert.match(compileMOSTFollowup("MOST", "energy and healthcare").blockers.join(" "), /Conflicting MOST sectors/);
  assert.match(compileMOSTFollowup("MOST", "between five hundred and five billion").blockers.join(" "), /cannot exceed/);
  assert.throws(() => normalizeMOSTUnboundAction({
    feature: "market_cap", operation: "set",
    value: { minimum: { value: 1, unit: "T" }, maximum: { value: 500, unit: "B" } }
  }), /cannot exceed/);
});

test("MOST contextual result changes preserve the other authoritative desired settings", () => {
  const draft = compileMOSTFollowup({
    command: "MOST", target,
    current_config: {
      ranking: "Losers", results: 25,
      market_cap: { minimum: { value: 5, unit: "B" }, maximum: { value: 500, unit: "B" } },
      sector: "Healthcare"
    }
  }, "show fifty results");
  assert.deepEqual(draft.actions, [{ feature: "results", operation: "select", value: 50 }]);
  assert.deepEqual(draft.desired_config, {
    ranking: "Losers", results: 50,
    market_cap: { minimum: { value: 5, unit: "B" }, maximum: { value: 500, unit: "B" } },
    sector: "Healthcare"
  });
  assert.equal(draft.ready_for_live_executor, true);
});

test("verified MOST result count still executes but compound unbound speech never degrades", () => {
  assert.deepEqual(parseControlFollowup("show 10 results in the most active stocks window").steps[0].actions,
    [{ feature: "results", operation: "select", value: 10 }]);
  assert.equal(parseControlFollowup("show fifty technology gainers in the most active stocks window"), null);
});

test("workflow and legacy schemas recognize unbound MOST actions and reject execution explicitly", () => {
  const actions = [
    { feature: "ranking", operation: "select", value: "Gainers" },
    { feature: "market_cap", operation: "set", value: { minimum: { value: 10, unit: "B" }, maximum: null } },
    { feature: "sector", operation: "select", value: "Technology" }
  ];
  for (const action of actions) {
    assert.throws(() => buildWorkflowPlan(intent(action)), /schema-valid but not live-enabled/);
    assert.throws(() => validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: null,
      steps: [{ id: "most-1", kind: "configure", target, actions: [action], required: true }]
    }), /schema-valid but not live-enabled/);
  }
});

test("provider JSON schemas expose structured MOST market-cap bounds", () => {
  for (const filename of ["intent.schema.json", "workflow.schema.json"]) {
    const schema = JSON.parse(fs.readFileSync(new URL(`../catalog/schemas/${filename}`, import.meta.url), "utf8"));
    const text = JSON.stringify(schema);
    for (const token of ["market_cap", "minimum", "maximum", "mostMarketCapBound", "raw", "K", "M", "B", "T"]) {
      assert.match(text, new RegExp(`\\b${token}\\b`));
    }
  }
});
