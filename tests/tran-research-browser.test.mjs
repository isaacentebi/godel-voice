import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

await import("../extension/core.js");
const core = globalThis.GodelVoiceCore;

const plan = value => core.validatePlan({
  version: 1,
  command: "TRAN",
  terminal_command: "AMZN EQ TRAN",
  security_query: null,
  arguments: [],
  actions: [{ feature: "research", operation: "summarize", value }]
});

test("browser independently accepts one bounded read-only TRAN research action", () => {
  const value = {
    periods: 4,
    topics: ["AWS revenue", "margin pressure"],
    question: "Did management mention margin pressure, and how did AWS revenue trend?"
  };
  assert.deepEqual(plan(value).actions[0], { feature: "research", operation: "summarize", value });
});

test("browser rejects malformed or oversized TRAN research payloads", () => {
  const valid = { periods: 4, topics: ["AWS revenue"], question: "Explain the trend." };
  for (const value of [
    { ...valid, periods: 0 },
    { ...valid, periods: 9 },
    { ...valid, periods: 2.5 },
    { ...valid, topics: [] },
    { ...valid, topics: Array.from({ length: 6 }, (_, index) => `topic ${index}`) },
    { ...valid, topics: ["AWS revenue", "aws revenue"] },
    { ...valid, topics: ["x".repeat(81)] },
    { ...valid, question: "" },
    { ...valid, question: "x".repeat(301) },
    { ...valid, injected: true }
  ]) assert.throws(() => plan(value), /TRAN/);
  assert.throws(() => core.validatePlan({
    version: 1, command: "TRAN", terminal_command: "AMZN EQ TRAN", security_query: null,
    arguments: [], actions: [{ feature: "research", operation: "delete", value: valid }]
  }), /read-only/);
});

test("TRAN executor proves exact Earnings rows and exact period reader before bounded extraction", () => {
  const source = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
  assert.match(source, /labels\.includes\("Period"\) && labels\.includes\("Type"\) && labels\.includes\("Date"\)/);
  assert.match(source, /type !== "Earnings"/);
  assert.match(source, /rows\.length !== 1/);
  assert.match(source, /document\.elementFromPoint/);
  assert.match(source, /stackOrder\(b\.clickTarget\) - stackOrder\(a\.clickTarget\)/);
  assert.match(source, /Number\(topmost\(b\.clickTarget\)\)/);
  assert.match(source, /const openedTRANPanel = panel/);
  assert.match(source, /plan\.command === "TRAN"[\s\S]{0,80}tranPanelForPlan\(plan\)/);
  assert.match(source, /!existingWindows\.has\(windowId\(root\)\)[\s\S]{0,80}panelMatchesCommand\(root, plan\.command\)/);
  assert.match(source, /if \(openedTRANPanel\?\.isConnected && tranEarningsRows\(openedTRANPanel\)\.length\) return openedTRANPanel/);
  assert.match(source, /const resolved = tranPanelForPlan\(plan\)/);
  assert.match(source, /markPhase\("transcript_root_ms", phaseStartedAt\)/);
  assert.doesNotMatch(source, /"new exact TRAN panel root", 9000/);
  assert.match(source, /\$\{period\} Earnings Conference Call/);
  assert.match(source, /text\.length >= 2000/);
  assert.match(source, /text\.includes\("Final Transcript"\) && text\.includes\("Presentation"\)/);
  assert.match(source, /passages\.length >= 8/);
  assert.match(source, /match\.chunk\.length <= 240/);
  assert.match(source, /slice\(start, start \+ 240\)/);
  assert.match(source, /JSON\.stringify\(result\)\.length > 12_000/);
});

test("TRAN result is panel-scoped, grounded and retains exact passage navigation identity", () => {
  const source = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
  assert.match(source, /delete panel\.dataset\.godelVoiceTranResult/);
  assert.match(source, /panel\.dataset\.godelVoiceTranResult = JSON\.stringify\(result\)/);
  assert.match(source, /`TRAN Research :: \$\{result\}`/);
  assert.match(source, /answer_period: strongest\?\.period \?\? null/);
  assert.match(source, /current: strongest \? \{ period: strongest\.period, text: strongest\.text \} : null/);
  assert.match(source, /await tranSelectPeriod\(panel, strongest\.period\)/);
  assert.match(source, /if \(!tranScrollToPassage\(reader, strongest\.text\)\) result\.current = null/);
  assert.match(source, /behavior: "auto"/);
  assert.match(source, /rgba\(53, 211, 153, 0\.95\)/);
});

test("TRAN sends only bounded extracted evidence to the authenticated local summary endpoint", () => {
  const source = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
  assert.match(source, /\$\{config\.handoffUrl\}\/grounded-transcript-summary/);
  assert.match(source, /Authorization: `Bearer \$\{config\.secret\}`/);
  assert.match(source, /\.slice\(0, 8\)/);
  assert.match(source, /setTimeout\(\(\) => controller\.abort\(\), 2_300\)/);
  assert.match(source, /return validateTRANSummary\(await response\.json\(\), result\)/);
  assert.match(source, /catch \{ \/\* The local grounded evidence and deterministic summary remain usable\. \*\//);
});

test("TRAN caches only verified exact-period transcript text in bounded memory", () => {
  const source = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
  assert.match(source, /TRAN_TEXT_CACHE_TTL_MS = 15 \* 60 \* 1000/);
  assert.match(source, /TRAN_TEXT_CACHE_MAX = 64/);
  assert.match(source, /text\.length < 2000/);
  assert.match(source, /text\.includes\(`\$\{period\} Earnings Conference Call`\)/);
  assert.match(source, /cachedTRANText\(security, identity\.period\)/);
  assert.doesNotMatch(source.slice(source.indexOf("function cachedTRANText"), source.indexOf("function localTRANSummary")), /localStorage|dataset/);
});

test("TRAN publishes a bounded research session without its raw passage corpus", () => {
  const source = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
  assert.match(source, /function tranResearchSession\(panel\)/);
  assert.match(source, /periods = result\.periods\.slice\(0, 8\)/);
  assert.match(source, /topics = result\.topics\.slice\(0, 5\)/);
  assert.match(source, /current_excerpt: compactText\(result\.current\?\.text\)\.slice\(0, 600\)/);
  assert.match(source, /\.\.\.\(researchSession \? \{ research_session: researchSession \} : \{\}\)/);
  const sessionBody = source.slice(source.indexOf("function tranResearchSession"), source.indexOf("async function publishExecutorContext"));
  assert.doesNotMatch(sessionBody, /passages:/);
});
