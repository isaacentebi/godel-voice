import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildCompactCatalog, commandMaps, loadRegistry } from "../src/catalog.mjs";
import { renderTerminalCommand, validateIntent } from "../src/compiler.mjs";
import { consumeEnhancedIntent } from "../src/consume-intent.mjs";
import { systemPrompt } from "../src/prompt.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const registry = loadRegistry();
const maps = commandMaps(registry);

const documentedIndex = "DES FA ERN EM SI GR ANR DVD QM FOCUS TAS HCP WEI WEIF IMAP HMAP GLCO FX MOST HDS N TOP TREND HALT ALLQ SECF WJI EQS OMON OVME CALC BROK AUM G HMS HP CF IPO TRAN HELP CHAT ACM PDF AL NOTE ENT CHANGE".split(" ");
const observedLiveExtras = "Q RES MAP CITADEL PAT PRT HLDR MOSO GF KELLY NI ERR".split(" ");

test("contains every command from the official public index", () => {
  for (const code of documentedIndex) assert.ok(maps.canonical.has(code), `missing ${code}`);
});

test("contains every additional command observed in live autocomplete", () => {
  for (const code of observedLiveExtras) assert.ok(maps.canonical.has(code), `missing ${code}`);
});

test("aliases resolve uniquely to canonical commands", () => {
  assert.equal(maps.accepted.get("GIP"), "G");
  assert.equal(maps.accepted.get("OPT"), "OMON");
  assert.equal(maps.accepted.get("SEARCH"), "SECF");
  assert.equal(maps.accepted.get("CN"), "N");
  assert.equal(new Set(maps.accepted.keys()).size, maps.accepted.size);
});

test("compact catalogue contains the complex nested features", () => {
  const compact = buildCompactCatalog(registry);
  assert.match(compact, /class action:show\|hide\|only/);
  assert.match(compact, /resolution argument:1m\|5m\|15m/);
  assert.match(compact, /tab:All\|Active\|Resumed/);
  assert.match(compact, /mode:Both\|Calls\|Puts/);
  assert.ok(compact.length < 50000, `catalog too large: ${compact.length}`);
  assert.ok(systemPrompt().length < 60000, `system prompt too large: ${systemPrompt().length}`);
});

test("renders a validated security command", () => {
  const intent = {
    kind: "execute", confidence: 0.99, command: "EM", query: null,
    security: {spoken_name: "Amazon", ticker: "AMZN", venue: "US", asset_class: "EQ", needs_resolution: false},
    arguments: [], post_open_actions: [], clarification: null, reason: "Earnings matrix requested."
  };
  assert.equal(renderTerminalCommand(intent), "AMZN US EQ EM");
});

test("normalizes spoken equity asset class to Godel EQ", () => {
  const intent = {
    kind: "execute", confidence: 0.97, command: "EM", query: null,
    security: {spoken_name: "AMZN", ticker: "AMZN", venue: "US", asset_class: "equity", needs_resolution: false},
    arguments: [], post_open_actions: [], clarification: null, reason: "Earnings matrix requested."
  };
  assert.equal(renderTerminalCommand(intent), "AMZN US EQ EM");
});

test("canonicalizes aliases and rejects invented chart arguments", () => {
  const base = {
    kind: "execute", confidence: 0.99, command: "GIP", query: null,
    security: {spoken_name: "Apple", ticker: "AAPL", venue: "US", asset_class: "EQ", needs_resolution: false},
    arguments: ["5m"], post_open_actions: [], clarification: null, reason: "Chart requested."
  };
  assert.equal(renderTerminalCommand(base), "AAPL US EQ G 5m");
  const bad = structuredClone(base);
  bad.arguments = ["4h"];
  assert.equal(validateIntent(bad).ok, false);
});

test("renders free text before query-scope commands", () => {
  const intent = {
    kind: "execute", confidence: 0.99, command: "NI", query: "anti trust regulation",
    security: null, arguments: [], post_open_actions: [], clarification: null, reason: "News search requested."
  };
  assert.equal(renderTerminalCommand(intent), "anti trust regulation NI");
});

test("eval set covers every major confusion family", () => {
  const evals = JSON.parse(fs.readFileSync(path.resolve(here, "../data/eval-cases.json"), "utf8"));
  const expected = new Set(evals.flatMap(item => item.expected === "clarify" ? item.confusion : [item.expected]));
  for (const code of ["EM","ERN","TRAN","HDS","HLDR","N","NI","TOP","RES","G","HMS","GR","GF","MOST","MOSO","OMON"])
    assert.ok(expected.has(code), `eval gap: ${code}`);
});

test("noisy speech suite covers every canonical command", () => {
  const evals = JSON.parse(fs.readFileSync(path.resolve(here, "../data/noisy-eval-cases.json"), "utf8"));
  const covered = new Set(evals.filter(item => item.expected !== "clarify").map(item => item.expected));
  for (const code of maps.canonical.keys()) assert.ok(covered.has(code), `no noisy speech case for ${code}`);
  assert.ok(evals.some(item => item.expected === "clarify"), "no noisy ambiguity case");
  assert.ok(evals.some(item => item.id.startsWith("self-correct")), "no self-correction case");
});

test("consumes a VoiceInk-enhanced JSON result", () => {
  const enhanced = `\`\`\`json
  {"kind":"execute","confidence":0.98,"command":"HALT","security":null,"query":null,"arguments":[],"post_open_actions":[{"feature":"tab","operation":"select","value":"Active"}],"clarification":null,"reason":"Active halts requested."}
  \`\`\``;
  const result = consumeEnhancedIntent(enhanced);
  assert.equal(result.terminalCommand, "HALT");
  assert.equal(result.intent.post_open_actions[0].value, "Active");
});
