import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));

test("docs gap inventory exhaustively joins the canonical registry", async () => {
  const [inventory, registry] = await Promise.all([
    readJson("data/docs-registry-gap-inventory-2026-08-03.json"),
    readJson("data/commands.json")
  ]);
  const documented = registry.commands.filter((item) => item.status === "documented").map((item) => item.code).sort();
  const liveUndocumented = registry.commands.filter((item) => item.status === "live-undocumented").map((item) => item.code).sort();

  assert.equal(inventory.coverage.canonical_command_count, registry.commands.length);
  assert.equal(inventory.coverage.canonical_feature_count, registry.commands.reduce((sum, item) => sum + item.features.length, 0));
  assert.deepEqual([...inventory.coverage.officially_documented_codes].sort(), documented);
  assert.deepEqual([...inventory.coverage.live_undocumented_codes].sort(), liveUndocumented);
  assert.deepEqual(inventory.registry_findings.missing_canonical_commands, []);
  assert.deepEqual(inventory.registry_findings.documented_aliases_missing, []);
});

test("verified and documentation-only findings remain strictly separate", async () => {
  const [inventory, contracts] = await Promise.all([
    readJson("data/docs-registry-gap-inventory-2026-08-03.json"),
    readJson("data/adapter-contracts-v1.json")
  ]);
  const enabled = new Set(contracts.contracts.flatMap((contract) =>
    (contract.actions || []).filter((action) => action.binding?.enabled === true).map((action) => `${contract.command}:${action.id}`)
  ));
  const snapshot = new Set(inventory.verified_runtime_snapshot.flatMap((item) => item.actions.map((action) => `${item.command}:${action}`)));

  assert.deepEqual([...snapshot].sort(), [...enabled].sort());
  assert.ok(inventory.documented_unbound.length >= 25);
  for (const gap of inventory.documented_unbound) {
    assert.equal(enabled.has(`${gap.command}:${gap.id.split(`${gap.command}.`)[1]}`), false, `${gap.id} must not be enabled`);
    assert.match(gap.source, /^https:\/\/godelterminal\.com\/docs\/commands\//);
    assert.ok(gap.completion);
  }
});

test("download inventory is fail-closed and format ambiguity is explicit", async () => {
  const inventory = await readJson("data/docs-registry-gap-inventory-2026-08-03.json");
  assert.equal(inventory.downloads.length, 9);
  assert.equal(inventory.downloads.some((item) => item.state === "verified-runtime"), false);
  for (const code of ["FA", "HP", "EQS", "IPO", "N", "G", "ANR", "HDS", "GF"]) {
    assert.ok(inventory.downloads.some((item) => item.command === code), `missing ${code} download audit`);
  }
  for (const item of inventory.downloads.filter((entry) => entry.documented_formats.length === 0)) assert.ok(item.blocker);
  assert.ok(inventory.download_activation_gate.includes("never silently overwrite"));
});
