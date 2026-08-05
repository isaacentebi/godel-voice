import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parseControlFollowup } from "../src/control-followup.mjs";
import { compileChartOptionsFollowup } from "../src/commands/chart-options-followup.mjs";

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
  }
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
  assert.equal(plan.steps[0].terminal_command, "AMZN US EQ HMS");
  assert.deepEqual(plan.steps[0].actions.map(action => action.value), ["META", "MSFT", "5Y", "Side-by-side"]);
});

test("multi-company fundamentals comparison stays in one authenticated GF panel", () => {
  const plan = parseControlFollowup("compare Amazon and Meta operating margins and revenue over five years");
  assert.deepEqual(plan.steps.map(step => step.command), ["GF"]);
  assert.equal(plan.steps[0].terminal_command, "AMZN US EQ GF");
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
  assert.deepEqual(plan.steps.map(step => step.kind), ["control", "control", "command"]);
  assert.deepEqual(plan.steps.slice(0, 2).map(step => step.operation), ["close", "close"]);
  assert.equal(plan.steps[2].command, "GF");
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
  assert.deepEqual(plan.steps.map(step => step.kind), ["control", "control", "command"]);
  assert.deepEqual(plan.steps.slice(0, 2).map(step => step.operation), ["close", "close"]);
  assert.deepEqual(plan.steps.slice(0, 2).map(step => step.failure_policy), ["continue", "continue"]);
  assert.equal(plan.steps[2].terminal_command, "AMZN US EQ GF");
  assert.deepEqual(plan.steps[2].actions, [
    { feature: "range", operation: "select", value: "5Y" },
    { feature: "add company", operation: "add", value: "META" },
    { feature: "margin metric", operation: "add", value: "Operating Margin" },
    { feature: "add metric", operation: "add", value: "Revenue" }
  ]);
});

test("close-all then open stays local when the Voice screen is already empty", () => {
  const plan = parseControlFollowup(
    "Close all other windows, then open a chart comparing Amazon and Meta operating margin and revenue over the last five years.",
    { panels: [] }
  );
  assert.deepEqual(plan.steps.map(step => step.kind), ["command"]);
  assert.equal(plan.steps[0].terminal_command, "AMZN US EQ GF");
  assert.deepEqual(plan.steps[0].actions.map(action => action.value), ["5Y", "META", "Operating Margin", "Revenue"]);
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
    assert.equal(plan.steps[0].terminal_command, "AMZN US EQ GF", voice);
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
