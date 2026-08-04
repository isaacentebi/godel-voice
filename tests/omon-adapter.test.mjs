import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const context = { globalThis: {}, module: undefined };
vm.runInNewContext(fs.readFileSync(new URL("../extension/adapters/omon.js", import.meta.url), "utf8"), context);
const api = context.globalThis.GodelVoiceOMONAdapter;

const panel = command => ({ getAttribute: name => name === "data-cy-command-type" ? command : null });
const proof = {
  authenticated_session: true,
  panel_identity: "OMON",
  control_kind: "slider",
  independent_label: true,
  rendered_rows_change: true,
  observed_step: 5,
  observed_values: [10, 15]
};

function harness(initial = 10) {
  let state = {
    slider_value: initial,
    label_value: initial,
    label_text: `${initial} Strikes`,
    rendered_strike_rows: initial * 2
  };
  const writes = [];
  const binding = {
    readBounds() { return { minimum: 5, maximum: 50, step: 5 }; },
    readState() { return { ...state }; },
    async setStrikeDepth(_panel, value) {
      writes.push(value);
      state = { slider_value: value, label_value: value, label_text: `${value} Strikes`, rendered_strike_rows: value * 2 };
    },
    async waitForCompletion(assertion) { return assertion(); }
  };
  const environment = api.createStrikeDepthEnvironment(binding, proof);
  return { adapter: api.createOMONAdapter(environment), writes, setState(value) { state = value; } };
}

test("binds only with authenticated slider, label and row-change proof", () => {
  assert.throws(() => api.createStrikeDepthEnvironment({}, proof), /binding is incomplete/);
  assert.throws(() => api.createStrikeDepthEnvironment({
    readBounds() {}, readState() {}, setStrikeDepth() {}, waitForCompletion() {}
  }, { ...proof, independent_label: false }), /authenticated live proof/);
});

test("sets exact live OMON strike depth and proves independent rendered state", async () => {
  const { adapter, writes } = harness(10);
  const result = await adapter.run(panel("OMON"), { feature: "strike depth", operation: "set", value: 15 });
  assert.equal(result.changed, true);
  assert.equal(JSON.stringify(writes), JSON.stringify([15]));
  assert.equal(result.action.value, 15);
});

test("strike-depth selection is idempotent", async () => {
  const { adapter, writes } = harness(15);
  const result = await adapter.run(panel("OMON"), { feature: "strike depth", operation: "set", value: 15 });
  assert.equal(result.changed, false);
  assert.equal(writes.length, 0);
});

test("rejects guessed values, wrong panels and unrelated option actions", async () => {
  const { adapter } = harness();
  await assert.rejects(() => adapter.run(panel("OMON"), { feature: "strike depth", operation: "set", value: 12 }), /steps of 5/);
  await assert.rejects(() => adapter.run(panel("G"), { feature: "strike depth", operation: "set", value: 15 }), /not OMON/);
  await assert.rejects(() => adapter.run(panel("OMON"), { feature: "expiry", operation: "select", value: "Aug 07" }), /Unsupported OMON action/);
});

test("fails closed when slider, label or rendered rows do not agree", async () => {
  let state = { slider_value: 10, label_value: 10, label_text: "10 Strikes", rendered_strike_rows: 20 };
  const environment = api.createStrikeDepthEnvironment({
    readBounds() { return { minimum: 5, maximum: 50, step: 5 }; },
    readState() { return state; },
    async setStrikeDepth() {
      state = { slider_value: 15, label_value: 10, label_text: "10 Strikes", rendered_strike_rows: 20 };
    },
    async waitForCompletion(assertion) { return assertion(); }
  }, proof);
  const adapter = api.createOMONAdapter(environment);
  await assert.rejects(() => adapter.run(panel("OMON"), { feature: "strike depth", operation: "set", value: 15 }), /did not update/);
});
