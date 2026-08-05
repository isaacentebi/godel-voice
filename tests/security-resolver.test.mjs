import assert from "node:assert/strict";
import test from "node:test";
import { compileCFFollowup } from "../src/commands/cf-followup.mjs";
import { compileQMFollowup } from "../src/commands/qm-followup.mjs";
import { parseControlFollowup } from "../src/control-followup.mjs";
import { rejectUnverifiedModelTicker, resolveTranscriptSecurities } from "../src/security-resolver.mjs";

const tickers = utterance => resolveTranscriptSecurities(utterance).map(item => item.ticker);

test("offline resolution handles punctuation, possessives, ASR splits and spoken ticker letters", () => {
  assert.deepEqual(tickers("compare Alphabet, ServiceNow, Eli Lilly and Coca-Cola"), ["GOOG", "NOW", "LLY", "KO"]);
  assert.deepEqual(tickers("open a m z n and m s f t earnings charts"), ["AMZN", "MSFT"]);
  assert.deepEqual(tickers("Google's company profile"), ["GOOG"]);
  assert.deepEqual(tickers("show me the micro soft chart"), ["MSFT"]);
});

test("ambiguous company words require security context and contextual ticker codes require an explicit cue", () => {
  assert.deepEqual(tickers("block the current window and do it now"), []);
  assert.deepEqual(tickers("show me Amazon's stock price now"), ["AMZN"]);
  assert.deepEqual(tickers("show me ticker NOW"), ["NOW"]);
  assert.deepEqual(tickers("open the Block earnings chart"), ["XYZ"]);
  assert.deepEqual(tickers("show the Unity stock chart"), ["U"]);
});

test("the fast open, watchlist and filings consumers share the same catalog", () => {
  const open = parseControlFollowup("open ServiceNow earnings matrix");
  assert.equal(open.steps[0].command, "EM");
  assert.match(open.steps[0].terminal_command, /^NOW (?:US )?EQ EM$/);

  const watchlist = compileQMFollowup("QM", "add A M Z N ServiceNow and A M Z N to mega caps watch list confirm");
  assert.deepEqual(watchlist.actions[0].value.securities.map(item => item.ticker), ["AMZN", "NOW"]);

  const filings = compileCFFollowup("CF", "show me A M Z N ten q filings inside godel");
  assert.equal(filings.actions[0].value.security.ticker, "AMZN");
});

test("explicit spelled tickers remain trusted while unfamiliar company-to-ticker guesses fail closed", () => {
  const guessed = { security: { spoken_name: "Lantheus", ticker: "LHX", venue: "US", asset_class: "EQ", needs_resolution: false } };
  rejectUnverifiedModelTicker(guessed, "open Lantheus earnings matrix");
  assert.equal(guessed.security.ticker, null);
  assert.equal(guessed.security.needs_resolution, true);

  const spelled = { security: { spoken_name: "L N T H", ticker: "LNTH", venue: "US", asset_class: "EQ", needs_resolution: false } };
  rejectUnverifiedModelTicker(spelled, "open L N T H earnings matrix");
  assert.equal(spelled.security.ticker, "LNTH");
});
