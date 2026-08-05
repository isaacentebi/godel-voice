import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parseControlFollowup } from "../src/control-followup.mjs";
import { compileChartOptionsFollowup } from "../src/commands/chart-options-followup.mjs";
import { compileDeterministicDesk } from "../src/deterministic-desks.mjs";

const cases = JSON.parse(fs.readFileSync(new URL("../evals/data/deterministic-desk-cases-v1.json", import.meta.url)));
const catalog = JSON.parse(fs.readFileSync(new URL("../catalog/contracts/deterministic-desks-v1.json", import.meta.url)));
const commands = JSON.parse(fs.readFileSync(new URL("../catalog/commands.json", import.meta.url))).commands;

test("every deterministic desk case compiles or declines exactly", () => {
  for (const item of cases) {
    const plan = parseControlFollowup(item.utterance);
    if (item.expected_kind === "decline") {
      assert.equal(plan, null, item.id);
      continue;
    }
    assert.deepEqual(plan.steps.map(step => step.command), item.expected_commands, item.id);
    assert.equal(plan.layout.preset, item.expected_layout, item.id);
    if (Object.hasOwn(item, "expected_new_screen")) {
      assert.equal(plan.layout.new_screen, item.expected_new_screen, item.id);
    }
  }
});

test("a named research desk keeps every requested native panel in spoken order", () => {
  const plan = parseControlFollowup(
    "build a clean amazon research desk with description matrix estimates filings transcript and news"
  );
  assert.deepEqual(plan.steps.map(step => step.command), ["DES", "EM", "ERN", "CF", "TRAN", "N"]);
  assert.deepEqual(plan.steps.map(step => step.terminal_command), [
    "AMZN EQ DES", "AMZN EQ EM", "AMZN EQ ERN",
    "AMZN EQ CF", "AMZN EQ TRAN", "AMZN EQ N"
  ]);
});

test("noisy VoiceInk company desk language stays deterministic", () => {
  const plan = parseControlFollowup(
    "jarvis clean screen for micro soft uh company overview earnins matt tricks estimates fill ins holders and news arrange it like a research desk"
  );
  assert.deepEqual(plan.steps.map(step => step.command), ["DES", "EM", "ERN", "CF", "HDS", "N"]);
  assert.ok(plan.steps.every(step => step.terminal_command.startsWith("MSFT EQ ")));
  assert.equal(plan.layout.new_screen, true);
});

test("a corrected earnings desk honors explicit panels and placement", () => {
  const plan = parseControlFollowup(
    "no wait open a microsoft earnings desk with company overview earnings matrix filings and a price chart in the upper right"
  );
  assert.deepEqual(plan.steps.map(step => step.command), ["DES", "EM", "CF", "G"]);
  assert.equal(plan.steps.at(-1).layout.placement, "top-right");
});

test("macro strip opens native market surfaces on a fresh screen", () => {
  const plan = parseControlFollowup("put world indexes futures commodities and fx across a fresh screen");
  assert.deepEqual(plan.steps.map(step => step.command), ["WEI", "WEIF", "GLCO", "FX"]);
  assert.equal(plan.layout.preset, "market");
  assert.equal(plan.layout.new_screen, true);
});

test("market maps remain distinct and preserve spoken placement", () => {
  const plan = parseControlFollowup(
    "new market screen index sector wheel upper left world exchange opening map lower left heat map upper right and active halts lower right"
  );
  assert.deepEqual(plan.steps.map(step => step.command), ["IMAP", "MAP", "HMAP", "HALT"]);
  assert.deepEqual(plan.steps.map(step => step.layout.placement), [
    "top-left", "bottom-left", "top-right", "bottom-right"
  ]);
  assert.deepEqual(plan.steps.at(-1).actions, [
    { feature: "tab", operation: "select", value: "Active" }
  ]);
});

test("market placement binds both preposed and relational phrases", () => {
  const preposed = parseControlFollowup(
    "new market screen on the left put the heatmap and on the right active halts"
  );
  assert.deepEqual(preposed.steps.map(step => step.layout.placement), ["left", "right"]);

  const relational = parseControlFollowup(
    "new market screen put the heatmap on the left and beneath it active halts"
  );
  assert.deepEqual(relational.steps.map(step => step.layout.placement), ["left", "bottom"]);
});

test("macro aliases retain every requested surface including verified VIX", () => {
  const custom = parseControlFollowup(
    "new macro screen with world markets futures commodities and currencies"
  );
  assert.deepEqual(custom.steps.map(step => step.command), ["WEI", "WEIF", "GLCO", "FX"]);
  assert.equal(custom.layout.new_screen, true);

  const vix = parseControlFollowup(
    "open a market dashboard with global indices futures commodities and VIX"
  );
  assert.deepEqual(vix.steps.map(step => step.command), ["WEI", "WEIF", "GLCO", "G"]);
  assert.equal(vix.steps.at(-1).terminal_command, "VIX CBOE IDX G");
});

test("custom macro content is never replaced by the default desk", () => {
  const commodity = parseControlFollowup("open a macro monitor with commodities");
  assert.deepEqual(commodity.steps.map(step => step.command), ["GLCO"]);

  const freshDefault = parseControlFollowup("new macro screen");
  assert.deepEqual(freshDefault.steps.map(step => step.command), ["WEI", "WEIF", "G"]);
  assert.equal(freshDefault.layout.new_screen, true);

  assert.equal(
    parseControlFollowup("fresh market screen heatmap active halts and market movers"),
    null
  );
});

test("long market overview remains a single ordered zero-model plan", () => {
  const plan = parseControlFollowup(
    "new screen world indices index futures commodities fx heat map impact map all halts most active stocks most active options top Reuters trending tickers and IPO calendar"
  );
  assert.deepEqual(plan.steps.map(step => step.command), [
    "WEI", "WEIF", "GLCO", "FX", "HMAP", "IMAP", "HALT", "MOST", "MOSO", "TOP", "TREND", "IPO"
  ]);
  assert.deepEqual(plan.steps[6].actions, [
    { feature: "tab", operation: "select", value: "All" }
  ]);
  assert.equal(plan.layout.new_screen, true);
});

test("mixed market and research cockpit stays zero-model and preserves every requested step", () => {
  const plan = parseControlFollowup(
    "on a new screen open the market heat map table view upper left active halts lower left most active stocks upper right top Reuters lower right then amazon description earnings matrix estimates filings transcript and finally maximize the matrix"
  );
  assert.deepEqual(plan.steps.map(step => step.kind === "control" ? step.operation : step.command), [
    "HMAP", "HALT", "MOST", "TOP", "DES", "EM", "ERN", "CF", "TRAN", "maximize"
  ]);
  assert.deepEqual(plan.steps.slice(0, 4).map(step => step.layout.placement), [
    "top-left", "bottom-left", "top-right", "bottom-right"
  ]);
  assert.deepEqual(plan.steps[0].actions, [{ feature: "view", operation: "select", value: "Table" }]);
  assert.deepEqual(plan.steps[1].actions, [{ feature: "tab", operation: "select", value: "Active" }]);
  assert.deepEqual(plan.steps.at(-1).target, { mode: "command", command: "EM", security: "AMZN" });
  assert.equal(plan.layout.new_screen, true);
});

test("mixed market and company requests never compile as a partial desk", () => {
  const plan = compileDeterministicDesk({
    transcript: "new screen world indices and amazon earnings matrix",
    text: "new screen world indices and amazon earnings matrix",
    security: "AMZN",
    explicitlyOpening: true
  });
  assert.equal(plan, null);
});

test("unverified research configuration stays off the deterministic desk route", () => {
  for (const transcript of [
    "open an Amazon research desk with annual financial statements and filings",
    "open an Amazon research desk with earnings matrix and filings if available"
  ]) {
    assert.equal(compileDeterministicDesk({
      transcript, text: transcript.toLowerCase(), security: "AMZN", explicitlyOpening: true
    }), null, transcript);
  }
});

test("close-open-maximize compiles as one ordered replacement", () => {
  const plan = parseControlFollowup(
    "close the previous chart open meta earnings estimates and make that full screen"
  );
  assert.deepEqual(plan.steps.map(step => step.kind), ["control", "command", "control"]);
  assert.deepEqual(plan.steps.filter(step => step.kind === "control").map(step => step.operation), [
    "close", "maximize"
  ]);
  assert.equal(plan.steps[1].terminal_command, "META EQ ERN");
});

test("market fundamentals desk preserves both requested metrics atomically", () => {
  const plan = parseControlFollowup("open a heatmap on the left side and an Amazon chart on the right side with operating margins and revenues");
  assert.deepEqual(plan.steps.map(step => step.layout.placement), ["left", "right"]);
  assert.deepEqual(plan.steps[1].actions, [
    { feature: "margin metric", operation: "add", value: "Operating Margin" },
    { feature: "add metric", operation: "add", value: "Revenue" }
  ]);
});

test("GF metric grammar supports plural multi-series without denominator leakage", () => {
  const multi = compileChartOptionsFollowup({ command: "GF" }, "show operating margins and revenues");
  assert.deepEqual(multi.executable_actions.map(action => action.value), ["Operating Margin", "Revenue"]);
  const ratio = compileChartOptionsFollowup({ command: "GF" }, "show R and D as percent of revenue");
  assert.deepEqual(ratio.executable_actions.map(action => action.value), ["R&D as % of Revenue"]);
});

test("options desk uses only the verified strike-depth nested control", () => {
  const plan = parseControlFollowup("open an Nvidia options desk with fifteen strikes");
  assert.deepEqual(plan.steps[1].actions, [{ feature: "strike depth", operation: "set", value: 15 }]);
  assert.deepEqual(plan.steps[0].actions, []);
  assert.deepEqual(plan.steps[2].actions, []);
});

test("price comparison desk uses the verified HMS membership and display contract", () => {
  const plan = parseControlFollowup("compare Amazon Meta and Microsoft over five years side by side");
  assert.equal(plan.steps[0].terminal_command, "AMZN EQ HMS");
  assert.deepEqual(plan.steps[0].actions.map(action => action.value), ["META", "MSFT", "5Y", "Side-by-side"]);
});

test("multi-company fundamentals comparison stays in one authenticated GF panel", () => {
  const plan = parseControlFollowup("compare Amazon and Meta operating margins and revenue over five years");
  assert.deepEqual(plan.steps.map(step => step.command), ["GF"]);
  assert.equal(plan.steps[0].terminal_command, "AMZN EQ GF");
  assert.deepEqual(plan.steps[0].actions, [
    { feature: "range", operation: "select", value: "5Y" },
    { feature: "add company", operation: "add", value: "META" },
    { feature: "margin metric", operation: "add", value: "Operating Margin" },
    { feature: "add metric", operation: "add", value: "Revenue" }
  ]);
});

test("close-all plus a supported comparison compiles atomically", () => {
  const context = { panels: [
    { command: "HMAP", connected: true },
    { command: "EM", security: "META", connected: true }
  ] };
  const plan = parseControlFollowup(
    "close all the other windows, then compare Amazon and Meta operating margin and revenue",
    context
  );
  assert.deepEqual(plan.steps.map(step => step.kind), ["control", "command"]);
  assert.equal(plan.steps[0].operation, "reset_workspace");
  assert.equal(plan.steps[1].command, "GF");
});

test("open-a-chart comparing grammar keeps cleanup and the full GF comparison", () => {
  const context = { panels: [
    { command: "G", security: "MSFT", connected: true },
    { command: "HMAP", connected: true }
  ] };
  const plan = parseControlFollowup(
    "Close all other windows, then open a chart comparing Amazon and Meta operating margin and revenue over the last five years.",
    context
  );
  assert.deepEqual(plan.steps.map(step => step.kind), ["control", "command"]);
  assert.equal(plan.steps[0].operation, "reset_workspace");
  assert.equal(plan.steps[1].terminal_command, "AMZN EQ GF");
  assert.deepEqual(plan.steps[1].actions, [
    { feature: "range", operation: "select", value: "5Y" },
    { feature: "add company", operation: "add", value: "META" },
    { feature: "margin metric", operation: "add", value: "Operating Margin" },
    { feature: "add metric", operation: "add", value: "Revenue" }
  ]);
});

test("close-all remains an explicit idempotent reset when the Voice screen is already empty", () => {
  const plan = parseControlFollowup(
    "Close all other windows, then open a chart comparing Amazon and Meta operating margin and revenue over the last five years.",
    { panels: [] }
  );
  assert.deepEqual(plan.steps.map(step => step.kind), ["control", "command"]);
  assert.equal(plan.steps[0].operation, "reset_workspace");
  assert.equal(plan.steps[1].terminal_command, "AMZN EQ GF");
  assert.deepEqual(plan.steps[1].actions.map(action => action.value), ["5Y", "META", "Operating Margin", "Revenue"]);
});

test("spoken comparison variants stay on the same zero-model GF route", () => {
  const variants = [
    "open a graph com pairing Amazon and Meta operation margin and revenue for five years",
    "chart Amazon compared with Meta operating margins and revenues over 5Y",
    "compare Amazon verses Meta operating margin and revenue for the last five years"
  ];
  for (const voice of variants) {
    const plan = parseControlFollowup(voice);
    assert.equal(plan.steps[0].command, "GF", voice);
    assert.equal(plan.steps[0].terminal_command, "AMZN EQ GF", voice);
    assert.deepEqual(plan.steps[0].actions.map(action => action.value), ["5Y", "META", "Operating Margin", "Revenue"], voice);
  }
});

test("operating income is not silently substituted for operating margin", () => {
  const context = { panels: [{ command: "HMAP", connected: true }] };
  assert.equal(parseControlFollowup(
    "Close all other windows, then open a chart comparing Amazon and Meta operating income and revenue over the last five years.",
    context
  ), null);
});

test("close-all plus an unsupported comparison declines before closing anything", () => {
  const context = { panels: [{ command: "HMAP", connected: true }] };
  assert.equal(parseControlFollowup(
    "close all the other windows, then compare Amazon and Meta NOPAT",
    context
  ), null);
});

test("desk catalog references only real Godel commands and keeps blocked controls explicit", () => {
  const known = new Set(commands.map(command => command.code));
  for (const workflow of catalog.workflows) {
    for (const command of workflow.commands) assert.ok(known.has(command), `${workflow.id}:${command}`);
  }
  const options = catalog.workflows.find(workflow => workflow.id === "options-desk");
  assert.deepEqual(options.enabled_nested_actions, ["OMON.strike_depth.set"]);
  assert.ok(options.blocked_nested_actions.includes("OMON.expiration.select"));
  assert.ok(catalog.workflows.every(workflow => !(workflow.enabled_nested_actions ?? []).some(action => /export/i.test(action))));
});
