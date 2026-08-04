import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compileHMAPFollowup } from "../src/hmap-followup.mjs";
import { parseControlFollowup } from "../src/control-followup.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const truth = readJson("data/contracts/live-runtime-truth-v1.json");
const contracts = readJson("data/contracts/adapter-contracts-v1.json");
const inventory = readJson("data/contracts/nested-capability-inventory-v2.json");
const guide = fs.readFileSync(path.join(root, "docs/user-guide.md"), "utf8");

function contracted() {
  return contracts.contracts.flatMap(contract => (contract.actions ?? []).map(action => ({
    id: `${contract.command}.${action.id}`, command: contract.command, action
  })));
}

test("truth file, contracts, guide, and capability cross-reference agree on the exact 16 controls", () => {
  const enabled = contracted().filter(item => item.action.binding.enabled).map(item => item.id);
  const current = truth.current_contract_controls.map(item => item.id);
  const guideBlock = guide.match(/<!-- enabled-controls:start -->([\s\S]*?)<!-- enabled-controls:end -->/)?.[1] ?? "";
  const guideIds = [...guideBlock.matchAll(/^- ([A-Z]+\.[a-z0-9_.]+)$/gm)].map(match => match[1]);
  assert.equal(current.length, 16);
  assert.deepEqual(current, enabled);
  assert.deepEqual(guideIds, enabled);
  assert.deepEqual(inventory.live_runtime_cross_reference.current_contract_controls, enabled);
  assert.equal(truth.policies.enabled_contract_count, enabled.length);
});

test("every current control names all validator layers, exact postconditions, proof date, limitations, and honest VoiceInk status", () => {
  const core = fs.readFileSync(path.join(root, "extension/core.js"), "utf8");
  const workflow = fs.readFileSync(path.join(root, "src/workflow-plan.mjs"), "utf8");
  for (const item of truth.current_contract_controls) {
    assert.match(item.command, /^[A-Z]+$/, item.id);
    assert.ok(item.postconditions.length >= 1, `${item.id} postconditions`);
    assert.match(item.live_proof.date, /^2026-08-0[34]$/, `${item.id} proof date`);
    assert.match(item.live_proof.evidence, /\S/, `${item.id} proof evidence`);
    assert.ok(item.limitations.length >= 1, `${item.id} limitations`);
    for (const layer of ["browser", "workflow", "fast_parser", "adapter"]) {
      assert.match(item.validators[layer] ?? "", /\S/, `${item.id} ${layer}`);
    }
    assert.match(core, new RegExp(`\\b${item.command}: new Set\\(`), `${item.id} browser allowlist`);
    assert.match(workflow, new RegExp(`\\b${item.command}: new Set\\(`), `${item.id} workflow allowlist`);
    assert.equal(typeof item.real_post_code_voiceink.exists, "boolean", `${item.id} voice exists`);
    assert.equal(typeof item.real_post_code_voiceink.successful, "boolean", `${item.id} voice success`);
    if (!item.real_post_code_voiceink.exists) assert.equal(item.real_post_code_voiceink.successful, false, item.id);
  }
});

test("all 78 unbound contracts are non-executable and absent from current truth", () => {
  const executableKinds = new Set(contracts.policy.executable_binding_kinds);
  const nonExecutableKinds = new Set(contracts.policy.non_executable_binding_kinds);
  const current = new Set(truth.current_contract_controls.map(item => item.id));
  const disabled = contracted().filter(item => !item.action.binding.enabled);
  assert.equal(disabled.length, 78);
  assert.equal(truth.policies.disabled_contract_count, disabled.length);
  for (const item of disabled) {
    assert.equal(current.has(item.id), false, `${item.id} leaked into current truth`);
    assert.ok(nonExecutableKinds.has(item.action.binding.kind), `${item.id} unknown disabled kind`);
    assert.equal(executableKinds.has(item.action.binding.kind), false, `${item.id} executable despite disabled binding`);
  }
});

test("mixed live plus unbound nested requests execute nothing", () => {
  const mixed = compileHMAPFollowup({}, "hide sector headers and switch this heatmap to table view");
  assert.deepEqual(mixed.actions.map(action => action.feature), ["sectors", "view"]);
  assert.equal(mixed.ready_for_live_executor, false);
  assert.deepEqual(mixed.executable_actions, []);
  assert.equal(parseControlFollowup("hide sector headers and switch this heatmap to table view", {
    focused_panel: { window_id: "hmap-1", command: "HMAP", security: null }
  }), null);
  assert.match(truth.policies.atomicity, /all-or-nothing/i);
});

test("legacy GF HALT and GR stay separate and cannot inflate current contract coverage", () => {
  assert.deepEqual(truth.legacy_runtime_adapters.map(item => item.id), [
    "GF.legacy.configure", "HALT.legacy.tab.select", "GR.legacy.partial"
  ]);
  assert.deepEqual(inventory.live_runtime_cross_reference.legacy_runtime_adapters,
    truth.legacy_runtime_adapters.map(item => item.id));
  assert.equal(truth.legacy_runtime_adapters.some(item => item.contract_promoted), false);
  assert.equal(truth.legacy_runtime_adapters.find(item => item.id.startsWith("GR.")).status, "existing-runtime-unverified");
  assert.match(guide, /three legacy runtime adapters not promoted/);
});

test("failed CF and News Pause audits remain explicitly disabled", () => {
  const failures = new Map(truth.known_failed_or_unbound_controls.map(item => [item.id, item]));
  assert.equal(failures.get("CF.feed.configure").enabled, false);
  assert.match(failures.get("CF.feed.configure").reason, /unrelated 144, S-4, and 424B5 rows/);
  assert.equal(failures.get("N.pause.select").enabled, false);
  const cf = contracts.contracts.find(item => item.command === "CF");
  assert.equal(cf.actions.some(action => action.binding.enabled), false);
  const news = contracts.contracts.find(item => item.command === "N");
  assert.deepEqual(news.actions.filter(action => action.binding.enabled).map(action => action.id), ["query.set"]);
});
