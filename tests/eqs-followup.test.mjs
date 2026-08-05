import assert from "node:assert/strict";
import test from "node:test";
import { compileEQSFollowup } from "../src/commands/eqs-followup.mjs";

const values = result => result.actions.map(({ feature, operation, value }) => ({ feature, operation, value }));

test("compiles exact observed valuation and fundamental range labels deterministically", () => {
  const result = compileEQSFollowup("EQS", "set forward pee between 5 and 25, trailing price to sales under eight, and forward revenue above 2 billion");
  assert.deepEqual(values(result), [
    { feature: "range_filter", operation: "add", value: { field: "P/E (Fwd)", minimum: 5, maximum: 25 } },
    { feature: "range_filter", operation: "add", value: { field: "P/S (TTM)", minimum: null, maximum: 8 } },
    { feature: "range_filter", operation: "add", value: { field: "Rev. (Fwd 12mo, USD)", minimum: 2e9, maximum: null } }
  ]);
  assert.equal(result.ready_for_live_executor, true);
});

test("normalizes finance size units and noisy price-to-sales speech", () => {
  const result = compileEQSFollowup("EQS", "market cap above ten bill and forward price to sails below eight then run the screen");
  assert.deepEqual(values(result), [
    { feature: "range_filter", operation: "add", value: { field: "Market Cap (USD)", minimum: 10e9, maximum: null } },
    { feature: "range_filter", operation: "add", value: { field: "P/S (Fwd)", minimum: null, maximum: 8 } },
    { feature: "screen", operation: "run", value: null }
  ]);
});

test("accepts natural range phrasing and spoken multiple suffixes without changing the exact EQS fields", () => {
  const result = compileEQSFollowup("EQS", "forward P E from ten times through twenty five x and market cap greater than or equal to ten billion then run it");
  assert.deepEqual(values(result), [
    { feature: "range_filter", operation: "add", value: { field: "P/E (Fwd)", minimum: 10, maximum: 25 } },
    { feature: "range_filter", operation: "add", value: { field: "Market Cap (USD)", minimum: 10e9, maximum: null } },
    { feature: "screen", operation: "run", value: null }
  ]);
  assert.equal(result.ready_for_live_executor, true);
});

test("maps only the authenticated American technology shortcut to exact live values", () => {
  const result = compileEQSFollowup("EQS", "screen American tech companies with forward P E below thirty then run it");
  assert.deepEqual(values(result), [
    { feature: "range_filter", operation: "add", value: { field: "P/E (Fwd)", minimum: null, maximum: 30 } },
    { feature: "list_filter", operation: "add", value: { field: "HQ Country", items: ["United States"] } },
    { feature: "list_filter", operation: "add", value: { field: "Sector", items: ["Technology"] } },
    { feature: "screen", operation: "run", value: null }
  ]);
  assert.equal(result.ready_for_live_executor, true);
});

test("compiles only explicit dynamic list values and preserves runtime validation", () => {
  const result = compileEQSFollowup("EQS", "currency usd venue nasdaq hq country japan sector technology sub sector semiconductors");
  assert.deepEqual(values(result), [
    { feature: "list_filter", operation: "add", value: { field: "Currency", items: ["USD"] } },
    { feature: "list_filter", operation: "add", value: { field: "Venue", items: ["NASDAQ"] } },
    { feature: "list_filter", operation: "add", value: { field: "HQ Country", items: ["japan"] } },
    { feature: "list_filter", operation: "add", value: { field: "Sector", items: ["technology"] } },
    { feature: "list_filter", operation: "add", value: { field: "Sub-Sector", items: ["semiconductors"] } }
  ]);
});

test("compiles private-company, primary-listing and no-trade booleans", () => {
  const result = compileEQSFollowup("EQS", "exclude private companies primary listings only and hide dead tickers");
  assert.deepEqual(values(result), [
    { feature: "boolean_filter", operation: "add", value: { field: "Private Company", value: false } },
    { feature: "primary_listings", operation: "select", value: true },
    { feature: "hide_no_trades", operation: "select", value: true }
  ]);
});

test("Run and Clear are deterministic and carry authenticated readiness", () => {
  const run = compileEQSFollowup({ command: "EQS", target: { mode: "command", command: "EQS", security: null } }, "run this screen");
  assert.deepEqual(values(run), [{ feature: "screen", operation: "run", value: null }]);
  assert.equal(run.ready_for_live_executor, true);
  assert.equal(run.blocked_reason, null);
  const clear = compileEQSFollowup("EQS", "clear all the filters");
  assert.deepEqual(values(clear), [{ feature: "screen", operation: "clear", value: null }]);
});

test("fails closed on an unbounded named filter, wrong context and unrelated language", () => {
  const ambiguous = compileEQSFollowup("EQS", "add forward net income");
  assert.deepEqual(values(ambiguous), []);
  assert.match(ambiguous.blockers[0], /without an exact minimum/);
  assert.equal(compileEQSFollowup("HDS", "run this screen"), null);
  assert.equal(compileEQSFollowup("EQS", "make the window larger"), null);
});
