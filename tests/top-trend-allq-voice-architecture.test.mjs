import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ALLQ_DESTINATIONS, TREND_TIMEFRAMES, compileALLQVoice, compileTOPVoice,
  compileTRENDVoice, compileTopTrendAllQVoice, groundedTOPFact
} from "../src/commands/top-trend-allq-followup.mjs";

const article = (rank, extra = {}) => ({ id: `story-${rank}`, rank, headline: `Headline ${rank}`, source: "Reuters", time: `${rank}:00 PM`, ...extra });
const topContext = { live_articles: [article(1, { observed: true, panel: "TOP" }), article(2, { observed: true, panel: "TOP" })] };
const selectedQuote = { id: "quote-1", ticker: "META", venue: "NASDAQ", active: true };

test("documented enums are closed", () => {
  assert.deepEqual(TREND_TIMEFRAMES, ["1H", "24H", "WEEK", "MONTH"]);
  assert.deepEqual(ALLQ_DESTINATIONS, ["Q", "G", "DES", "FOCUS", "OMON"]);
});

test("TOP resolves a spoken rank to one exact live identity", () => {
  const result = compileTOPVoice(topContext, "please read the second Rooters story");
  assert.equal(result.kind, "candidate");
  assert.deepEqual(result.actions[0].value, { id: "story-2", rank: 2, headline: "Headline 2", source: "Reuters", time: "2:00 PM" });
  assert.equal(result.actions[0].scope, "reader");
  assert.deepEqual(result.grounded_fact, result.actions[0].value);
  assert.deepEqual(result.executable_actions, []);
});

test("TOP selected language requires exact selected context", () => {
  const ok = compileTOPVoice({ selected_article: article(1) }, "open this story");
  assert.equal(ok.kind, "candidate");
  assert.equal(ok.actions[0].value.id, "story-1");
  const missing = compileTOPVoice({}, "open the current headline");
  assert.equal(missing.kind, "clarify");
  assert.deepEqual(missing.actions, []);
});

test("TOP rejects unknown and ambiguous live ranks", () => {
  assert.equal(compileTOPVoice(topContext, "open number 9").kind, "clarify");
  assert.equal(compileTOPVoice({ live_articles: [article(1), article(1, { id: "duplicate" })] }, "read the first story").kind, "clarify");
});

test("TOP blocks external navigation", () => {
  const result = compileTOPVoice(topContext, "open the first story on the Reuters website in a new tab");
  assert.equal(result.kind, "blocked");
  assert.deepEqual(result.actions, []);
});

test("TOP grounded facts require observed TOP data", () => {
  assert.equal(groundedTOPFact({}, article(1)), null);
  assert.equal(groundedTOPFact({}, article(1, { observed: true, panel: "NEWS" })), null);
  assert.deepEqual(groundedTOPFact({}, article(1, { observed: true, panel: "TOP" })), { id: "story-1", rank: 1, headline: "Headline 1", source: "Reuters", time: "1:00 PM" });
});

test("TOP correction discards the earlier rank", () => {
  const result = compileTOPVoice(topContext, "open the first story wait no read the second story");
  assert.equal(result.actions[0].value.rank, 2);
});

test("TREND compiles every documented timeframe", () => {
  const cases = [["last one hour", "1H"], ["today", "24H"], ["this week", "WEEK"], ["monthly trendin", "MONTH"]];
  for (const [voice, expected] of cases) assert.equal(compileTRENDVoice({}, voice).actions[0].value, expected);
});

test("TREND can atomically select one timeframe and refresh", () => {
  const result = compileTRENDVoice({ current_state: { layout: "table" } }, "show the past 24 hours and refresh now");
  assert.deepEqual(result.actions.map(action => action.feature), ["timeframe", "refresh"]);
  assert.deepEqual(result.desired_state, { layout: "table", timeframe: "24H" });
});

test("TREND correction and contradiction handling are deterministic", () => {
  assert.equal(compileTRENDVoice({}, "show this week actually show this month").actions[0].value, "MONTH");
  const conflict = compileTRENDVoice({}, "show this week and this month");
  assert.equal(conflict.kind, "clarify");
  assert.deepEqual(conflict.actions, []);
});

test("TREND enforces known subscription absence", () => {
  const result = compileTRENDVoice({ paid_subscription: false }, "refresh trends now");
  assert.equal(result.kind, "blocked");
  assert.deepEqual(result.actions, []);
});

test("ALLQ active-only filter preserves unrelated state", () => {
  const on = compileALLQVoice({ current_state: { tree: "venue" } }, "show active all coats only");
  assert.equal(on.actions[0].value, "on");
  assert.deepEqual(on.desired_state, { tree: "venue", active_only: true });
  const off = compileALLQVoice({}, "include inactive quotes");
  assert.equal(off.actions[0].value, "off");
});

test("ALLQ contradictory active filters clarify atomically", () => {
  const result = compileALLQVoice({}, "show only active quotes and include inactive quotes");
  assert.equal(result.kind, "clarify");
  assert.deepEqual(result.actions, []);
});

test("ALLQ hands one exact quote identity to every documented destination", () => {
  const cases = [["quote panel", "Q"], ["chart", "G"], ["company description", "DES"], ["focus", "FOCUS"], ["option chain", "OMON"]];
  for (const [spoken, expected] of cases) {
    const result = compileALLQVoice({ selected_quote: selectedQuote }, `open this in ${spoken}`);
    assert.equal(result.actions[0].value.destination, expected);
    assert.deepEqual(result.actions[0].value.quote, selectedQuote);
  }
});

test("ALLQ may express multiple explicit row handoffs", () => {
  const result = compileALLQVoice({ selected_quote: selectedQuote }, "open this in the chart, description, and option chain");
  assert.deepEqual(result.actions.map(action => action.value.destination), ["G", "DES", "OMON"]);
});

test("ALLQ handoff requires valid selected-row identity", () => {
  for (const selected_quote of [undefined, { id: "x", ticker: "meta", venue: "NASDAQ" }, { id: "x", ticker: "META" }]) {
    const result = compileALLQVoice({ selected_quote }, "open this in the chart");
    assert.equal(result.kind, "clarify");
    assert.deepEqual(result.actions, []);
  }
});

test("ALLQ correction discards the earlier destination", () => {
  const result = compileALLQVoice({ selected_quote: selectedQuote }, "open in chart no sorry open in focus");
  assert.deepEqual(result.actions.map(action => action.value.destination), ["FOCUS"]);
});

test("ALLQ compounds are atomic when a selected quote is missing", () => {
  const result = compileALLQVoice({}, "show active quotes only and open this in the option chain");
  assert.equal(result.kind, "clarify");
  assert.deepEqual(result.actions, []);
});

test("schema declares strict runtime-disabled safety", () => {
  const schema = JSON.parse(fs.readFileSync(new URL("../catalog/contracts/top-trend-allq-nested.schema.json", import.meta.url)));
  assert.equal(schema["x-runtime-enabled"], false);
  assert.equal(schema["x-safety"]["atomic-on-clarification"], true);
  assert.equal(schema.oneOf.length, 5);
});

test("dispatcher routes only an explicit supported command", () => {
  assert.equal(compileTopTrendAllQVoice({ command: "TOP", ...topContext }, "open the first story").command, "TOP");
  assert.equal(compileTopTrendAllQVoice({ command: "TREND" }, "show this week").command, "TREND");
  assert.equal(compileTopTrendAllQVoice({ command: "ALLQ" }, "active quotes only").command, "ALLQ");
  assert.equal(compileTopTrendAllQVoice({ command: "NEWS" }, "open the first story"), null);
});
