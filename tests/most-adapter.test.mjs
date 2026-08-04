import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = { globalThis: {}, module: undefined, setTimeout, Event: class {} };
vm.runInNewContext(fs.readFileSync(new URL("../extension/adapters/most.js", import.meta.url), "utf8"), context);
const most = context.globalThis.GodelVoiceMOSTAdapter;
const plain = value => JSON.parse(JSON.stringify(value));

function panel() {
  return {
    textContent: "MOST ACTIVE",
    getAttribute(name) { return name === "data-cy-command-type" ? "MOST" : null; },
    querySelectorAll() { return []; }
  };
}

function harness(initial = {}) {
  const state = {
    controls: { ranking: "Active", results: "10", minimum: "", maximum: "", sector: "All", ...initial.controls },
    metadata: {
      ranking: "Active", limit: 10, sector: "All", minimum_market_cap: null,
      maximum_market_cap: null, rows: [], ...initial.metadata
    },
    writes: []
  };
  const adapter = most.createMOSTAdapter({
    readControl(_root, key) { return state.controls[key]; },
    readResultMetadata() { return state.metadata; },
    setControl(_root, key, value) {
      state.writes.push([key, value]);
      state.controls[key] = value;
      if (key === "ranking") state.metadata.ranking = value;
      if (key === "results") state.metadata.limit = Number(value);
      if (key === "sector") {
        state.metadata.sector = value;
        state.metadata.rows = value === "All" ? state.metadata.rows : state.metadata.rows.map(row => ({ ...row, sector: value }));
      }
      if (key === "minimum") state.metadata.minimum_market_cap = value;
      if (key === "maximum") state.metadata.maximum_market_cap = value;
    },
    async waitForCompletion(assertion) { return assertion(); }
  });
  return { adapter, state };
}

test("exports the documented bounded enums", () => {
  assert.deepEqual(plain(most.RANKINGS), ["Active", "Gainers", "Losers", "Value"]);
  assert.deepEqual(plain(most.RESULT_COUNTS), [10, 25, 50, 100]);
  assert.equal(most.SECTORS.length, 12);
  assert.ok(most.SECTORS.includes("Communication Services"));
});

test("normalizes units and rejects an inverted market-cap range", () => {
  assert.equal(most.rawValue(most.normalizeBound("10B")), 10e9);
  assert.equal(most.canonicalBound(most.normalizeBound({ value: 250, unit: "M" })), "250M");
  assert.throws(() => most.normalizeRange({ minimum: "10B", maximum: "500M" }), /cannot exceed/);
  assert.throws(() => most.normalizeBound("minus ten billion"), /Invalid/);
});

test("ranking is idempotent only when control and result metadata agree", async () => {
  const { adapter, state } = harness();
  const first = await adapter.run(panel(), { feature: "ranking", operation: "select", value: "Active" });
  assert.equal(first.changed, false);
  state.metadata.ranking = "Losers";
  const second = await adapter.run(panel(), { feature: "ranking", operation: "select", value: "Active" });
  assert.equal(second.changed, true);
  assert.deepEqual(state.writes, [["ranking", "Active"]]);
});

test("applies and proves result count with rendered-row bounds", async () => {
  const { adapter, state } = harness({ metadata: { rows: Array.from({ length: 25 }, () => ({})) } });
  const result = await adapter.run(panel(), { feature: "results", operation: "select", value: 25 });
  assert.equal(result.changed, true);
  assert.equal(state.metadata.limit, 25);
  state.metadata.rows.push({});
  assert.throws(() => most.assertCompletion(panel(), most.normalizeAction({ feature: "results", operation: "select", value: 25 }), {
    readControl: (_root, key) => state.controls[key], readResultMetadata: () => state.metadata
  }), /more rows/);
});

test("sector requires every returned row to carry matching authoritative metadata", async () => {
  const { adapter, state } = harness({ metadata: { rows: [{ sector: "Healthcare" }, { sector: "Healthcare" }] } });
  await adapter.run(panel(), { feature: "sector", operation: "select", value: "Technology" });
  assert.deepEqual(state.metadata.rows.map(row => row.sector), ["Technology", "Technology"]);
  state.metadata.rows[1].sector = "Energy";
  assert.throws(() => most.assertCompletion(panel(), most.normalizeAction({ feature: "sector", operation: "select", value: "Technology" }), {
    readControl: (_root, key) => state.controls[key], readResultMetadata: () => state.metadata
  }), /do not prove/);
});

test("market-cap applies exact canonical values and verifies every result row", async () => {
  const { adapter, state } = harness({ metadata: { rows: [{ market_cap: 15e9 }, { market_cap: 250e9 }] } });
  const result = await adapter.run(panel(), {
    feature: "market_cap", operation: "set",
    value: { minimum: { value: 10, unit: "B" }, maximum: "500B" }
  });
  assert.equal(result.changed, true);
  assert.deepEqual(state.writes, [["minimum", "10B"], ["maximum", "500B"]]);
  state.metadata.rows.push({ market_cap: 2e9 });
  assert.throws(() => most.assertCompletion(panel(), result.action, {
    readControl: (_root, key) => state.controls[key], readResultMetadata: () => state.metadata
  }), /below the minimum/);
});

test("fails closed on unsupported values, wrong panels, and missing metadata", async () => {
  const { adapter } = harness();
  await assert.rejects(adapter.run(panel(), { feature: "ranking", operation: "select", value: "Momentum" }), /Unsupported/);
  await assert.rejects(adapter.run(panel(), { feature: "results", operation: "select", value: 20 }), /Unsupported/);
  await assert.rejects(adapter.run(panel(), { feature: "sector", operation: "select", value: "Crypto" }), /Unsupported/);
  await assert.rejects(adapter.run({ textContent: "CHAT", getAttribute() { return "CHAT"; }, querySelectorAll() { return []; } },
    { feature: "ranking", operation: "select", value: "Active" }), /not MOST/);

  const unsafe = most.createMOSTAdapter({
    readControl: () => "Gainers", readResultMetadata: () => null,
    setControl() {}, async waitForCompletion(assertion) { return assertion(); }
  });
  await assert.rejects(unsafe.run(panel(), { feature: "ranking", operation: "select", value: "Gainers" }), /metadata is unavailable/);
});

test("does not contain generic active-class success logic", () => {
  const source = fs.readFileSync(new URL("../extension/adapters/most.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /classList\.(?:contains|toggle).*active/i);
  assert.doesNotMatch(source, /matches\([^)]*\.active/i);
  assert.match(source, /aria-selected/);
  assert.match(source, /readResultMetadata/);
});
