import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inventory = JSON.parse(fs.readFileSync(path.join(root, "catalog", "contracts", "nested-capability-inventory-v2.json"), "utf8"));
const commands = JSON.parse(fs.readFileSync(path.join(root, "catalog", "commands.json"), "utf8"));
const commandCodes = new Set(commands.commands.map(command => command.code));
const allowedStates = new Set(Object.keys(inventory.states));

function records() {
  return inventory.families.flatMap(family =>
    family.commands
      ? family.commands.flatMap(command => (command.actions ?? []).map(action => ({ family, command, action })))
      : (family.actions ?? []).map(action => ({ family, command: null, action })));
}

test("inventory covers the five requested capability families", () => {
  assert.deepEqual(inventory.families.map(family => family.id), [
    "maps_heatmaps",
    "screeners_and_discovery",
    "holdings_and_filings",
    "exports_and_downloads",
    "workspace_and_layout"
  ]);
});

test("every command joins to the canonical command catalogue", () => {
  for (const family of inventory.families) {
    for (const command of family.commands ?? []) {
      assert.ok(commandCodes.has(command.command), `${family.id}:${command.command}`);
    }
  }
});

test("every nested action has a valid state, operation, completion policy and evidence", () => {
  for (const { family, command, action } of records()) {
    const label = `${family.id}:${command?.command ?? "workspace"}:${action.id}`;
    assert.match(action.id, /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/, label);
    assert.match(action.operation, /\S/, label);
    assert.ok(allowedStates.has(action.state), `${label}:${action.state}`);
    assert.ok(Array.isArray(action.evidence) && action.evidence.length > 0, `${label}:evidence`);
    assert.match(action.completion ?? action.limitations?.join(" ") ?? "", /\S/, `${label}:completion`);
  }
});

test("descriptive inventory never promotes documentation alone to executable support", () => {
  for (const { action } of records()) {
    if (action.evidence.some(item => String(item).startsWith("https://"))
      && !action.evidence.some(item => String(item).startsWith("extension/") || String(item).startsWith("src/") || String(item).startsWith("reports/"))) {
      assert.notEqual(action.state, "source-verified", action.id);
    }
  }
});

test("IMAP index/view are verified, sort is candidate-disabled, and sector remains unbound", () => {
  const imap = inventory.families[0].commands.find(command => command.command === "IMAP");
  assert.equal(imap.actions.find(action => action.id === "index.select").state, "source-verified");
  assert.equal(imap.actions.find(action => action.id === "view.select").state, "source-verified");
  const sector = imap.actions.find(action => action.id === "sector.drilldown");
  assert.equal(sector.value.type, "exact-live-text");
  assert.equal(sector.state, "live-observed-unbound");
  assert.match(sector.prerequisites.join(" "), /model guesses forbidden/);
  const sort = imap.actions.find(action => action.id === "members.sort");
  assert.equal(sort.state,"candidate-disabled");
  assert.deepEqual(sort.value.directions,["Ascending","Descending"]);
  assert.match(sort.completion,/monotonic/);
  assert.equal(imap.actions.find(action => action.id === "movers.select").state,"unsupported");
  assert.equal(imap.actions.find(action => action.id === "subindustry.drilldown").state,"unsupported");
});

test("unknown export formats and header icons remain blocked", () => {
  const exports = inventory.families.find(family => family.id === "exports_and_downloads").commands;
  for (const code of ["ANR", "HDS"]) {
    const entry = exports.find(command => command.command === code);
    assert.deepEqual(entry.formats, []);
    assert.notEqual(entry.state, "source-verified");
  }
  for (const code of ["HMAP", "HALT", "WJI", "CHAT"]) {
    assert.equal(exports.find(command => command.command === code).state, "unsupported");
  }
});

test("workspace inventory preserves the exact implementation enums", () => {
  const workspace = inventory.families.find(family => family.id === "workspace_and_layout");
  const layout = workspace.actions.find(action => action.id === "workflow.layout");
  assert.deepEqual(layout.value.preset, ["research", "market", "comparison", "options", "grid", "focus"]);
  const move = workspace.actions.find(action => action.id === "window.move");
  assert.deepEqual(move.value.allowed, ["full", "left", "right", "top", "bottom", "top-left", "top-right", "bottom-left", "bottom-right"]);
  assert.equal(workspace.actions.find(action => action.id === "screen.close").state, "unsupported");
  assert.equal(workspace.actions.find(action => action.id === "window.move_between_screens").state, "unsupported");
});

test("every user-facing command group includes natural voice examples", () => {
  for (const family of inventory.families) {
    if (family.id === "exports_and_downloads") {
      for (const command of family.commands) {
        if (command.state === "unsupported") assert.ok(command.limitations?.length > 0, command.command);
        else assert.match(command.voice ?? "", /\S/, command.command);
      }
      continue;
    }
    if (family.commands) {
      for (const command of family.commands) assert.ok(command.voice?.length > 0, `${family.id}:${command.command}`);
    } else {
      assert.ok(family.voice?.length > 0, family.id);
    }
  }
});

test("missing families are explicit and non-empty", () => {
  assert.ok(inventory.missing_or_blocked_families.length >= 7);
  for (const item of inventory.missing_or_blocked_families) {
    assert.match(item.family, /\S/);
    assert.match(item.reason, /\S/);
  }
});
