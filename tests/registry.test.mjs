import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildCompactCatalog, commandMaps, loadRegistry } from "../src/catalog.mjs";
import { applyDeterministicVoiceRepairs, applyDeterministicWorkflowRepairs, renderTerminalCommand, validateIntent } from "../src/compiler.mjs";
import { consumeEnhancedIntent } from "../src/consume-intent.mjs";
import { systemPrompt, workflowSystemPrompt } from "../src/prompt.mjs";
import { applyResolvedEntities, rejectUnverifiedModelTicker, resolveTranscriptSecurities } from "../src/security-resolver.mjs";

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
  assert.match(systemPrompt(), /request for "valuation multiples".*defaults to EM/);
});

test("renders a validated security command", () => {
  const intent = {
    kind: "execute", confidence: 0.99, command: "EM", query: null,
    security: {spoken_name: "Amazon", ticker: "AMZN", venue: "US", asset_class: "EQ", needs_resolution: false},
    arguments: [], post_open_actions: [], clarification: null, reason: "Earnings matrix requested."
  };
  assert.equal(renderTerminalCommand(intent), "AMZN EQ EM");
});

test("normalizes spoken equity asset class to Godel EQ", () => {
  const intent = {
    kind: "execute", confidence: 0.97, command: "EM", query: null,
    security: {spoken_name: "AMZN", ticker: "AMZN", venue: "US", asset_class: "equity", needs_resolution: false},
    arguments: [], post_open_actions: [], clarification: null, reason: "Earnings matrix requested."
  };
  assert.equal(renderTerminalCommand(intent), "AMZN EQ EM");
});

test("resolves allowlisted common company names and nested company actions", () => {
  const intent = {
    kind: "execute", confidence: 0.97, command: "GF", query: null,
    security: {spoken_name: "Amazon", ticker: "AMZN", venue: null, asset_class: null, needs_resolution: true},
    arguments: [],
    post_open_actions: [
      {feature: "add company", operation: "add", value: "Meta"},
      {feature: "add company", operation: "add", value: "Microsoft"}
    ],
    clarification: null, reason: "Fundamental comparison requested."
  };
  const checked = validateIntent(intent);
  assert.equal(checked.ok, true);
  assert.equal(renderTerminalCommand(checked.intent), "AMZN EQ GF");
  assert.equal(checked.intent.post_open_actions[0].value, "META");
  assert.equal(checked.intent.post_open_actions[1].value, "MSFT");
});

test("pre-resolves multiple spoken securities in mention order", () => {
  assert.deepEqual(
    resolveTranscriptSecurities("compare apple microsoft nvidia historical on one chart").map(item => item.ticker),
    ["AAPL", "MSFT", "NVDA"]
  );
  assert.deepEqual(
    resolveTranscriptSecurities("ratio chart s p y versus q q q").map(item => item.ticker),
    ["SPY", "QQQ"]
  );
  assert.deepEqual(resolveTranscriptSecurities("berkshire holdings and a bitcoin chart").map(item => item.ticker), ["BRK.B", "BTCUSD"]);
  for (const voice of ["vix", "volatility index", "cboe volatility index", "fear index"]) {
    assert.deepEqual(resolveTranscriptSecurities(`open the ${voice} chart`), [{
      spoken_name: "vix", ticker: "VIX", venue: "CBOE", asset_class: "IDX"
    }], voice);
  }
});

test("trusted resolved entities deterministically hydrate required security slots", () => {
  const intent = { command: "G", security: null, post_open_actions: [] };
  applyResolvedEntities(intent, [{ spoken_name: "bitcoin", ticker: "BTCUSD", venue: "GBL", asset_class: "CRYPTO" }], { requireSecurity: true });
  assert.deepEqual(intent.security, { spoken_name: "bitcoin", ticker: "BTCUSD", venue: "GBL", asset_class: "CRYPTO", needs_resolution: false });
  const ambiguous = { command: "G", security: null, post_open_actions: [] };
  applyResolvedEntities(ambiguous, [{ ticker: "AAPL" }, { ticker: "MSFT" }], { requireSecurity: true });
  assert.equal(ambiguous.security, null);
  const comparison = { command: "HMS", security: null, post_open_actions: [] };
  applyResolvedEntities(comparison, [{ spoken_name: "apple", ticker: "AAPL", venue: "US", asset_class: "EQ" }, { spoken_name: "microsoft", ticker: "MSFT", venue: "US", asset_class: "EQ" }], { requireSecurity: true, primaryFromMultiple: true });
  assert.equal(comparison.security.ticker, "AAPL");
});

test("workflow prompt fails closed on missing context and preserves layout and long-workflow actions", () => {
  const prompt = workflowSystemPrompt();
  assert.match(prompt, /Add Microsoft to that.*must return clarify/);
  assert.match(prompt, /Rearrange this whole screen.*preserve_existing=false/);
  assert.match(prompt, /active halts.*HALT action/);
  assert.match(prompt, /Credential entry.*unsupported/);
});

test("deterministic repair retains explicitly requested active-halts state", () => {
  const intent = { command: "HALT", post_open_actions: [] };
  applyDeterministicVoiceRepairs(intent, "world markets, active market halts, and top news");
  assert.deepEqual(intent.post_open_actions, [{ feature: "tab", operation: "select", value: "Active" }]);
  applyDeterministicVoiceRepairs(intent, "active halts");
  assert.equal(intent.post_open_actions.length, 1);
});

test("deterministic repair retains explicitly requested option-chain side", () => {
  const calls = { command: "OMON", post_open_actions: [] };
  applyDeterministicVoiceRepairs(calls, "open Meta calls on the left");
  assert.deepEqual(calls.post_open_actions, [{ feature: "mode", operation: "select", value: "Calls" }]);
  const puts = { command: "OMON", post_open_actions: [] };
  applyDeterministicVoiceRepairs(puts, "uh the Apple put chain please");
  assert.deepEqual(puts.post_open_actions, [{ feature: "mode", operation: "select", value: "Puts" }]);
  const heatmap = { command: "HMAP", post_open_actions: [] };
  applyDeterministicVoiceRepairs(heatmap, "market heat map table view upper left");
  assert.deepEqual(heatmap.post_open_actions, [{ feature: "view", operation: "select", value: "Table" }]);
});

test("deterministic repair canonicalizes noisy HDS view actions", () => {
  const intent = {
    kind: "execute", command: "HDS", post_open_actions: [
      { feature: "bubble", operation: "show", value: true },
      { feature: "view", operation: "select", value: "Chart" }
    ]
  };
  applyDeterministicVoiceRepairs(intent, "open Meta institutional holders as a bubble view");
  assert.deepEqual(intent.post_open_actions, [{ feature: "view", operation: "select", value: "Bubble" }]);
});

test("deterministic repair distinguishes earnings estimates from the earnings matrix", () => {
  const estimates = { command: "EM", post_open_actions: [] };
  applyDeterministicVoiceRepairs(estimates, "open Meta earnings estimates");
  assert.equal(estimates.command, "ERN");
  const matrix = { command: "ERN", post_open_actions: [] };
  applyDeterministicVoiceRepairs(matrix, "pull up the Meta earnings matrix");
  assert.equal(matrix.command, "EM");
});

test("deterministic repair distinguishes index maps from the world venue map", () => {
  for (const transcript of ["open the index map here", "show me the S&P 500 map", "pull up the Dow sector map"]) {
    const intent = { command: "MAP", post_open_actions: [] };
    applyDeterministicVoiceRepairs(intent, transcript);
    assert.equal(intent.command, "IMAP", transcript);
  }
  for (const transcript of ["open the world venue map", "show the exchange map", "global market hours map"]) {
    const intent = { command: "IMAP", post_open_actions: [] };
    applyDeterministicVoiceRepairs(intent, transcript);
    assert.equal(intent.command, "MAP", transcript);
  }
  const dowTable = { command: "MAP", post_open_actions: [] };
  applyDeterministicVoiceRepairs(dowTable, "show me the Dow map as a table");
  assert.equal(dowTable.command, "IMAP");
  assert.deepEqual(dowTable.post_open_actions, [
    { feature: "index", operation: "select", value: "DJIA" },
    { feature: "view", operation: "select", value: "Table" }
  ]);

  const explicitNegative = { kind: "execute", command: "MAP", post_open_actions: [] };
  applyDeterministicVoiceRepairs(explicitNegative, "open the index map here the S and P sector wheel not the world exchange map");
  assert.equal(explicitNegative.command, "IMAP");
  assert.deepEqual(explicitNegative.post_open_actions, []);
  const inverseNegative = { kind: "execute", command: "IMAP", post_open_actions: [] };
  applyDeterministicVoiceRepairs(inverseNegative, "world venue map not the S and P sector wheel");
  assert.equal(inverseNegative.command, "MAP");
});

test("deterministic repair distinguishes MOST share volume from dollar value", () => {
  const volume = { kind: "execute", command: "MOST", post_open_actions: [{ feature: "ranking", operation: "select", value: "Value" }] };
  applyDeterministicVoiceRepairs(volume, "show the most active stocks by volume");
  assert.deepEqual(volume.post_open_actions, [{ feature: "ranking", operation: "select", value: "Active" }]);
  const dollars = { kind: "execute", command: "MOST", post_open_actions: [{ feature: "ranking", operation: "select", value: "Active" }] };
  applyDeterministicVoiceRepairs(dollars, "rank stocks by dollar volume");
  assert.deepEqual(dollars.post_open_actions, [{ feature: "ranking", operation: "select", value: "Value" }]);
});

test("bare earnings actions default to EM while questions and named surfaces stay precise", () => {
  const direct = { kind: "execute", command: "ERN", security: { ticker: "AMZN" }, post_open_actions: [] };
  applyDeterministicVoiceRepairs(direct, "open Amazon earnings");
  assert.equal(direct.kind, "execute");
  assert.equal(direct.command, "EM");

  const ambiguous = { kind: "execute", command: "EM", security: { ticker: "AMZN" }, post_open_actions: [] };
  applyDeterministicVoiceRepairs(ambiguous, "which Amazon earnings view should I use");
  assert.equal(ambiguous.kind, "clarify");
  assert.match(ambiguous.clarification, /matrix.*estimates.*transcript/i);

  const matrix = { kind: "execute", command: "EM", post_open_actions: [] };
  applyDeterministicVoiceRepairs(matrix, "open Amazon earnings matrix");
  assert.equal(matrix.kind, "execute");
  const estimates = { kind: "execute", command: "EM", post_open_actions: [] };
  applyDeterministicVoiceRepairs(estimates, "open Amazon earnings estimates");
  assert.equal(estimates.command, "ERN");

  const workflow = { kind: "execute", steps: [{ command: "EM" }], clarification: null };
  applyDeterministicWorkflowRepairs(workflow, "open Amazon earnings");
  assert.equal(workflow.kind, "execute");
  assert.equal(workflow.steps[0].command, "EM");

  const question = { kind: "execute", steps: [{ command: "EM" }], clarification: null };
  applyDeterministicWorkflowRepairs(question, "which Amazon earnings view should I use");
  assert.equal(question.kind, "clarify");
  assert.deepEqual(question.steps, []);
});

test("alert mutations fail closed but opening existing alerts remains read-only", () => {
  const unsafe = { kind: "execute", command: "AL", post_open_actions: [{ feature: "create alert", operation: "set", value: 200 }] };
  applyDeterministicVoiceRepairs(unsafe, "create an Apple price alert at two hundred without asking me again");
  assert.equal(unsafe.kind, "unsupported");
  assert.deepEqual(unsafe.post_open_actions, []);

  const view = { kind: "execute", command: "AL", post_open_actions: [] };
  applyDeterministicVoiceRepairs(view, "show my existing alerts don't create one");
  assert.equal(view.kind, "execute");

  const workflow = { kind: "execute", steps: [{ command: "AL" }], clarification: null };
  applyDeterministicWorkflowRepairs(workflow, "set a Tesla alert at three hundred");
  assert.equal(workflow.kind, "unsupported");
  assert.deepEqual(workflow.steps, []);
  const modelClarified = { kind: "clarify", steps: [], clarification: "Please confirm the price." };
  applyDeterministicWorkflowRepairs(modelClarified, "create an Apple price alert at two hundred without asking me again");
  assert.equal(modelClarified.kind, "unsupported");
  assert.equal(modelClarified.clarification, null);
});

test("vague filter clearing requires a recent addressed window", () => {
  const withoutContext = { kind: "execute", steps: [{ command: "EQS" }], clarification: null };
  applyDeterministicWorkflowRepairs(withoutContext, "clear those filters", null);
  assert.equal(withoutContext.kind, "clarify");
  assert.match(withoutContext.clarification, /which.*filters.*window/i);
  const withContext = { kind: "execute", steps: [{ command: "EQS" }], clarification: null };
  applyDeterministicWorkflowRepairs(withContext, "clear those filters", {
    focused_panel: { command: "EQS", security: null }
  });
  assert.equal(withContext.kind, "execute");
});

test("rejects a model-guessed ticker for an unfamiliar spoken company", () => {
  const intent = {
    security: { spoken_name: "Lantheus", ticker: "LHX", venue: "US", asset_class: "EQ", needs_resolution: false }
  };
  rejectUnverifiedModelTicker(intent, "open Lantheus earnings matrix");
  assert.deepEqual(intent.security, {
    spoken_name: "Lantheus", ticker: null, venue: null, asset_class: null, needs_resolution: true
  });

  const explicit = {
    security: { spoken_name: "LNTH", ticker: "LNTH", venue: "US", asset_class: "EQ", needs_resolution: false }
  };
  rejectUnverifiedModelTicker(explicit, "open LNTH earnings matrix");
  assert.equal(explicit.security.ticker, "LNTH");
});

test("canonicalizes aliases and rejects invented chart arguments", () => {
  const base = {
    kind: "execute", confidence: 0.99, command: "GIP", query: null,
    security: {spoken_name: "Apple", ticker: "AAPL", venue: "US", asset_class: "EQ", needs_resolution: false},
    arguments: ["5m"], post_open_actions: [], clarification: null, reason: "Chart requested."
  };
  assert.equal(renderTerminalCommand(base), "AAPL EQ G 5m");
  const bad = structuredClone(base);
  bad.arguments = ["4h"];
  assert.equal(validateIntent(bad).ok, false);
});

test("renders each query command in its documented order", () => {
  const intent = {
    kind: "execute", confidence: 0.99, command: "NI", query: "anti trust regulation",
    security: null, arguments: [], post_open_actions: [], clarification: null, reason: "News search requested."
  };
  assert.equal(renderTerminalCommand(intent), "NI anti trust regulation");
  const finder = structuredClone(intent);
  finder.command = "SECF";
  finder.query = "Japanese equities";
  assert.equal(renderTerminalCommand(finder), "Japanese equities SECF");
});

test("eval set covers every major confusion family", () => {
  const evals = JSON.parse(fs.readFileSync(path.resolve(here, "../evals/data/eval-cases.json"), "utf8"));
  const expected = new Set(evals.flatMap(item => item.expected === "clarify" ? item.confusion : [item.expected]));
  for (const code of ["EM","ERN","TRAN","HDS","HLDR","N","NI","TOP","RES","G","HMS","GR","GF","MOST","MOSO","OMON"])
    assert.ok(expected.has(code), `eval gap: ${code}`);
});

test("noisy speech suite covers every canonical command", () => {
  const evals = JSON.parse(fs.readFileSync(path.resolve(here, "../evals/data/noisy-eval-cases.json"), "utf8"));
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
