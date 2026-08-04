import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { compileNewsCandidate, compileNewsFollowup, NEWS_ACTION_STATES } from "../src/news-followup.mjs";

const target = { mode: "focused", command: "N", security: "AMZN" };

test("the exact query remains the only live News action", () => {
  assert.equal(NEWS_ACTION_STATES.query, "live");
  for (const [feature, state] of Object.entries(NEWS_ACTION_STATES)) if (feature !== "query") assert.notEqual(state, "live", feature);
  const plan = compileNewsFollowup(target, "search this news feed for OpenAI antitrust");
  assert.deepEqual(plan.steps[0].actions, [{ feature: "query", operation: "set", value: "openai antitrust" }]);
});

test("window scope, watchlist, documented Before date and pause preserve omitted state", () => {
  const result = compileNewsCandidate({
    command: "N", live_watchlists: ["Semis", "Core"],
    current_state: { query: "chips", "date range": "All", pause: "Live", untouched: "keep" }
  }, "on this news feed use my Semis watch list before August first 2026 and pause the feed");
  assert.deepEqual(result.actions, [
    { feature: "watchlist", operation: "select", value: "Semis", scope: "window" },
    { feature: "before date", operation: "set", value: "2026-08-01", scope: "window" },
    { feature: "pause", operation: "select", value: "Paused", scope: "window" }
  ]);
  assert.equal(result.desired_state.query, "chips");
  assert.equal(result.desired_state.untouched, "keep");
  assert.equal(result.ready_for_live_executor, false);
});

test("security and global scopes require exact non-conflicting identity", () => {
  const security = compileNewsCandidate({ command: "N", resolved_security: { ticker: "META" } }, "scope this news to this ticker");
  assert.deepEqual(security.actions[0], { feature: "scope", operation: "select", value: "Security:META", scope: "window" });
  const global = compileNewsCandidate({ command: "N" }, "show all news from everywhere");
  assert.equal(global.actions[0].value, "Global");
  const conflict = compileNewsCandidate({ command: "N", live_watchlists: ["Core"] }, "show all news using my Core watchlist");
  assert.equal(conflict.kind, "clarify");
  assert.equal(conflict.actions.length, 0);
});

test("dynamic account-draft vocabularies must resolve against exact live options", () => {
  const context = {
    command: "N",
    live_sources: ["Reuters", "Bloomberg", "Zacks"],
    live_categories: ["Mergers and Acquisitions", "Markets"],
    live_languages: ["English", "German"]
  };
  const result = compileNewsCandidate(context,
    "include Reuters and Bloomberg sources exclude categories Mergers and Acquisitions languages English and German include keywords guidance and capex exclude keywords lawsuit hide class actions");
  assert.deepEqual(result.actions, [
    { feature: "sources", operation: "include", value: ["Reuters", "Bloomberg"], scope: "account-draft" },
    { feature: "categories", operation: "exclude", value: ["Mergers and Acquisitions"], scope: "account-draft" },
    { feature: "languages", operation: "select", value: ["English", "German"], scope: "account-draft" },
    { feature: "include keywords", operation: "set", value: ["guidance", "capex"], scope: "account-draft" },
    { feature: "exclude keywords", operation: "set", value: ["lawsuit"], scope: "account-draft" },
    { feature: "class action", operation: "select", value: "Hide", scope: "account-draft" }
  ]);
  assert.equal(result.confirmation_required, false);
  assert.equal(result.ready_for_live_executor, false);
});

test("unknown dynamic values and more than twenty keywords fail closed", () => {
  const unknown = compileNewsCandidate({ command: "N", live_sources: ["Reuters"] }, "exclude Zacks sources from news");
  assert.ok(unknown.blockers.some(value => /exact value/.test(value)));
  assert.equal(unknown.actions.length, 0);
  const words = Array.from({ length: 21 }, (_, index) => `term${index + 1}`).join(" and ");
  const tooMany = compileNewsCandidate({ command: "N" }, `news include keywords ${words}`);
  assert.ok(tooMany.blockers.some(value => /1 and 20/.test(value)));
});

test("global-only filters cannot masquerade as per-window state", () => {
  const result = compileNewsCandidate({ command: "N", live_sources: ["Reuters"] }, "on this news window include Reuters sources");
  assert.ok(result.blockers.some(value => /account-global, not per-window/.test(value)));
  assert.equal(result.ready_for_live_executor, false);
});

test("global saved, reset and clear mutations are confirmation-gated", () => {
  for (const [phrase, operation] of [
    ["save these news filters globally", "save"],
    ["reset my global news filters to recommended", "reset"],
    ["clear my saved news filters", "clear"]
  ]) {
    const result = compileNewsCandidate({ command: "N" }, phrase);
    assert.equal(result.actions.at(-1).operation, operation, phrase);
    assert.equal(result.actions.at(-1).scope, "account", phrase);
    assert.equal(result.confirmation_required, true, phrase);
    assert.equal(result.ready_for_live_executor, false, phrase);
  }
});

test("clear requires explicit local versus global scope", () => {
  const ambiguous = compileNewsCandidate({ command: "N" }, "clear the news filters");
  assert.equal(ambiguous.kind, "clarify");
  const local = compileNewsCandidate({ command: "N", current_state: { query: "rates" } }, "clear this news window filters");
  assert.deepEqual(local.actions, [{ feature: "clear", operation: "clear", value: null, scope: "window" }]);
});

test("article selection/open/PDF bind the same exact live article identity", () => {
  const result = compileNewsCandidate({ command: "N", live_articles: [
    { id: "a1", title: "First" }, { id: "a2", title: "Second headline" }
  ] }, "open the second article and save this article as PDF");
  assert.deepEqual(result.actions, [
    { feature: "article reader", operation: "open", value: { id: "a2", title: "Second headline" }, scope: "window" },
    { feature: "article pdf", operation: "download", value: { article_id: "a2", format: "PDF" }, scope: "artifact" }
  ]);
  assert.equal(result.ready_for_live_executor, false);
});

test("article navigation, inline context and TTS require reader context", () => {
  const result = compileNewsCandidate({ command: "N", reader_open: true }, "go back to news, show inline context and read the article aloud");
  assert.deepEqual(result.actions, [
    { feature: "reader back", operation: "back", value: null, scope: "window" },
    { feature: "inline context", operation: "select", value: "Show", scope: "window" },
    { feature: "tts", operation: "select", value: "On", scope: "window" }
  ]);
  const missing = compileNewsCandidate({ command: "N" }, "go back to the news feed");
  assert.ok(missing.blockers.some(value => /open article reader/.test(value)));
});

test("PDF and selected-article actions fail without authoritative identity", () => {
  const result = compileNewsCandidate({ command: "N", selected_article: true }, "save this article as PDF");
  assert.ok(result.blockers.some(value => /identity/.test(value)));
  assert.equal(result.actions.length, 0);
});

test("corrections win while explicit contradictions clarify", () => {
  const corrected = compileNewsCandidate({ command: "N" }, "pause the feed wait no resume this news feed");
  assert.equal(corrected.actions[0].value, "Live");
  for (const phrase of [
    "pause and resume this news feed",
    "show class actions and hide class actions in news",
    "show and hide inline context in this news article",
    "turn on tts and turn off tts in this news reader",
    "show news for all dates before 2026-08-01"
  ]) assert.equal(compileNewsCandidate({ command: "N", reader_open: true }, phrase).kind, "clarify", phrase);
});

test("unsupported After/Since date semantics never degrade to Before or All", () => {
  for (const phrase of ["show news after 2026-08-01", "news since August first 2026", "news from last week"]) {
    const result = compileNewsCandidate({ command: "N" }, phrase);
    assert.ok(result.blockers.some(value => /only All or Before/.test(value)), phrase);
    assert.equal(result.actions.some(action => action.feature === "before date"), false);
  }
});

test("compound query plus unbound control is atomic and does not execute query alone", () => {
  const candidate = compileNewsCandidate({ command: "N" }, "search this news feed for rate cuts and pause the feed");
  assert.deepEqual(candidate.actions.map(action => action.feature), ["query", "pause"]);
  assert.equal(candidate.executable_actions.length, 0);
  assert.equal(compileNewsFollowup(target, "search this news feed for rate cuts and pause the feed"), null);
});

test("dedicated schema contains every modeled scope and safety boundary", () => {
  const schema = JSON.parse(fs.readFileSync(new URL("../data/contracts/news-nested.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.oneOf.length, 18);
  const source = JSON.stringify(schema);
  for (const value of ["window", "account-draft", "account", "artifact", "Show", "Hide", "Only", "PDF"]) assert.match(source, new RegExp(value));
  assert.match(schema.description, /only live action/);
});
