import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = JSON.parse(fs.readFileSync(path.join(root, "data", "commands.json"), "utf8"));
const matrix = JSON.parse(fs.readFileSync(path.join(root, "data", "contracts", "capability-matrix.json"), "utf8"));

const byCode = new Map(matrix.commands.map(command => [command.code, command]));
const validWindow = new Set(matrix.enums.window);
const validCoverage = new Set(matrix.enums.coverage);
const validMethod = new Set(matrix.enums.method);
const validSafety = new Set(matrix.enums.safety);
const validExport = new Set(matrix.enums.export_status);

test("capability matrix covers every canonical command exactly once", () => {
  assert.equal(matrix.commands.length, registry.commands.length);
  assert.equal(byCode.size, registry.commands.length, "duplicate matrix command");
  assert.deepEqual([...byCode.keys()].sort(), registry.commands.map(command => command.code).sort());
});

test("matrix joins losslessly to registry scope, aliases and features", () => {
  for (const command of registry.commands) {
    const adaptation = byCode.get(command.code);
    assert.equal(adaptation.scope, command.scope, `${command.code} scope drift`);
    assert.deepEqual(adaptation.aliases, command.aliases ?? [], `${command.code} alias drift`);
    assert.equal(adaptation.features_ref, `data/commands.json#${command.code}.features`);
    assert(command.features.length > 0, `${command.code} has no UI feature inventory`);
  }
});

test("every command has a validated execution, safety, evidence and voice record", () => {
  for (const command of matrix.commands) {
    assert.match(command.syntax, /\S/, `${command.code} syntax`);
    assert(validWindow.has(command.window), `${command.code} window`);
    assert(validCoverage.has(command.coverage), `${command.code} coverage`);
    assert(validMethod.has(command.method), `${command.code} method`);
    assert(validSafety.has(command.safety), `${command.code} safety`);
    assert(validExport.has(command.export?.status), `${command.code} export status`);
    assert(Array.isArray(command.voice) && command.voice.length > 0, `${command.code} voice examples`);
    assert(Array.isArray(command.evidence) && command.evidence.length > 0, `${command.code} evidence`);
    if (registry.commands.find(item => item.code === command.code).status === "documented") {
      assert(command.evidence.some(item => item.startsWith("https://godelterminal.com/docs/")), `${command.code} official evidence`);
    } else {
      assert(command.evidence.some(item => item.startsWith("live-")), `${command.code} live evidence`);
    }
  }
});

test("current nested coverage is not overstated", () => {
  const partial = matrix.commands.filter(command => command.coverage === "partial-nested").map(command => command.code).sort();
  assert.deepEqual(partial, ["EM", "GF", "GR", "HMAP", "HMS", "IMAP", "MOST"]);
  assert.equal(byCode.get("EM").method, "native-callback");
  assert.equal(byCode.get("GF").method, "native-callback");
  assert.equal(byCode.get("GR").method, "stable-dom+trusted-cdp");
  assert.equal(byCode.get("HMS").method, "stable-dom+trusted-cdp");
  assert.equal(byCode.get("HMAP").method, "stable-dom+trusted-cdp");
  assert.equal(byCode.get("IMAP").method, "stable-dom");
  assert.equal(byCode.get("MOST").method, "native-callback");
});

test("verified exports retain control, interaction, adapter and natural-language audit", () => {
  const expected = ["ANR", "EQS", "FA", "G", "HDS", "HP", "IPO", "N"];
  const actual = matrix.commands.filter(command => command.export.status === "verified").map(command => command.code).sort();
  assert.deepEqual(actual, expected.sort());
  for (const code of actual) {
    const output = byCode.get(code).export;
    assert(Array.isArray(output.formats) && output.formats.length > 0, `${code} formats`);
    assert.match(output.control, /\S/, `${code} control`);
    assert.match(output.interaction, /\S/, `${code} interaction`);
    assert.match(output.adapter, /\S/, `${code} adapter`);
    assert.match(output.voice, /\S/, `${code} export voice phrase`);
  }
});

test("observed export icons are never promoted to verified downloads", () => {
  const observed = matrix.commands.filter(command => command.export.status === "observed-unverified");
  assert(observed.length > 0);
  for (const command of observed) {
    assert.match(command.export.adapter, /unsupported|verify/i, `${command.code} fail-closed export adapter`);
  }
});

test("window actions and command-inside-command flows are inventoried", () => {
  assert(matrix.window_management.confirmed_native_transition.length >= 9);
  assert(matrix.window_management.dom_only_unique_control.length >= 2);
  assert(matrix.window_management.unknown.length >= 4);
  assert(matrix.window_management.unsafe.length >= 3);
  const transitions = new Set(matrix.cross_command_transitions.map(item => item.from));
  for (const command of ["DES", "ALLQ", "OMON", "G", "HDS", "QM", "N", "CHANGE", "IPO", "CF", "TRAN", "CHAT"]) {
    assert(transitions.has(command), `missing ${command} child transition`);
  }
});

test("portable setup and known syntax gaps remain explicit", () => {
  assert(matrix.portable_setup_prerequisites.length >= 6);
  assert.equal(byCode.get("NI").syntax, "NI [FREE TEXT]");
  assert.equal(byCode.get("SECF").syntax, "[FREE TEXT] SECF or bare SECF");
});
