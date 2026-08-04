import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const corpus = JSON.parse(fs.readFileSync(new URL("../evals/data/market-news-intent-corpus-v1.json",import.meta.url),"utf8"));
const context = {globalThis:{},module:undefined};
vm.runInNewContext(fs.readFileSync(new URL("../extension/adapters/market-news.js",import.meta.url),"utf8"),context);
const api = context.globalThis.GodelVoiceMarketNewsAdapters;
const panel = command => ({getAttribute:name => name === "data-cy-command-type" ? command : null});

test("market/news natural-language corpus covers every modeled and blocked action family", () => {
  assert.ok(corpus.cases.length >= 30);
  const commands = new Set(corpus.cases.map(item => item.command));
  assert.deepEqual([...commands].sort(),["CF","HALT","HMAP","IMAP","N"]);
  const statuses = new Set(corpus.cases.map(item => item.status));
  for (const status of ["candidate-disabled","live-separate-adapter","blocked"]) assert.ok(statuses.has(status));
  for (const command of api.COMMANDS) {
    const features = new Set(corpus.cases.filter(item => item.command === command).map(item => item.action.feature));
    for (const feature of Object.keys(api.SPECS[command])) assert.ok(features.has(feature),`${command}.${feature} lacks a voice case`);
    assert.deepEqual([...corpus.blocked_coverage[command]].sort(),[...api.BLOCKED[command]].sort(),`${command} blocked coverage drifted`);
  }
});

test("candidate voice cases normalize only through bounded adapter contracts", () => {
  for (const item of corpus.cases) {
    const environment = {
      availableOptions(_panel,_command,key) { return item.live_options?.[key] ?? []; },
      availableBounds(_panel,_command,key) { return item.live_bounds?.[key] ?? null; }
    };
    if (item.status === "blocked") {
      assert.throws(() => api.normalizeAction(item.command,item.action,environment,panel(item.command)),/intentionally blocked/,item.voice);
    } else {
      const action = api.normalizeAction(item.command,item.action,environment,panel(item.command));
      assert.equal(action.feature,item.action.feature,item.voice);
      assert.equal(action.operation,item.action.operation,item.voice);
    }
  }
});

test("corpus contains noisy spoken finance phrasing, persistence warnings and artifact intent", () => {
  const voices = corpus.cases.map(item => item.voice.toLowerCase()).join("\n");
  for (const phrase of ["ten k","ten q","eight k","s and p","without overwriting","global filters","milliseconds"]) {
    assert.match(voices,new RegExp(phrase));
  }
});
