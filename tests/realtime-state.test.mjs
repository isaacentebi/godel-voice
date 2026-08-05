import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadState() {
  const context = { globalThis: null, setTimeout, clearTimeout, queueMicrotask };
  context.globalThis = context;
  vm.runInNewContext(
    fs.readFileSync(new URL("../extension/realtime.js", import.meta.url), "utf8"),
    context
  );
  return context.GodelVoiceRealtimeState;
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function tick() {
  await new Promise(resolve => setImmediate(resolve));
}

test("Realtime event trace executes completed transcript turns in strict FIFO order", async () => {
  const state = loadState();
  const gates = [deferred(), deferred(), deferred()];
  const trace = [];
  const coordinator = state.createCoordinator({
    runTurn: async turn => {
      trace.push(`start:${turn.transcript}`);
      await gates[turn.index].promise;
      trace.push(`done:${turn.transcript}`);
    },
    sendResponse: () => {}
  });

  coordinator.enqueueTurn({ transcript: "first", index: 0 });
  coordinator.enqueueTurn({ transcript: "second", index: 1 });
  coordinator.enqueueTurn({ transcript: "third", index: 2 });
  await tick();
  assert.deepEqual(trace, ["start:first"]);

  gates[0].resolve();
  await tick();
  assert.deepEqual(trace, ["start:first", "done:first", "start:second"]);
  gates[1].resolve();
  await tick();
  assert.deepEqual(trace, ["start:first", "done:first", "start:second", "done:second", "start:third"]);
  gates[2].resolve();
  await tick();
  assert.deepEqual(trace.at(-1), "done:third");
  assert.equal(coordinator.snapshot().turnRunning, false);
});

test("Realtime event trace permits only one response.create lifecycle at a time", () => {
  const state = loadState();
  const sent = [];
  const coordinator = state.createCoordinator({
    runTurn: async () => {},
    sendResponse: response => sent.push(response.event.id)
  });

  coordinator.enqueueResponse({ kind: "one", event: { id: "response-1", event_id: "request-1" } });
  coordinator.enqueueResponse({ kind: "two", event: { id: "response-2", event_id: "request-2" } });
  assert.deepEqual(sent, ["response-1"]);
  assert.equal(coordinator.snapshot().queuedResponses, 1);

  coordinator.responseCreated("provider-1");
  assert.equal(coordinator.responseDone("different-provider"), false);
  assert.deepEqual(sent, ["response-1"]);
  coordinator.responseDone("provider-1");
  assert.deepEqual(sent, ["response-1", "response-2"]);
  coordinator.responseFailed(new Error("provider race"), "request-2");
  assert.deepEqual(sent, ["response-1", "response-2", "response-2"]);
  coordinator.responseDone();
  assert.equal(coordinator.snapshot().activeResponse, false);
});

test("Realtime event trace rearms batching during speech and drops only the failed segment", () => {
  const state = loadState();
  const timers = new Map();
  let timerId = 0;
  let speaking = true;
  const batches = [];
  const batcher = state.createTranscriptBatcher({
    graceMs: 180,
    isSpeechActive: () => speaking,
    onBatch: batch => batches.push(Array.from(batch, segment => segment.text)),
    setTimer: callback => {
      const id = ++timerId;
      timers.set(id, callback);
      return id;
    },
    clearTimer: id => timers.delete(id)
  });
  const fireLatest = () => {
    const id = Math.max(...timers.keys());
    const callback = timers.get(id);
    timers.delete(id);
    callback();
  };

  batcher.add({ turnId: "turn-a", text: "open Amazon" });
  batcher.add({ turnId: "turn-b", text: "and Meta" });
  batcher.fail("turn-b");
  fireLatest();
  assert.deepEqual(batches, []);
  assert.equal(batcher.snapshot().scheduled, true);
  assert.deepEqual(Array.from(batcher.snapshot().segments, segment => segment.turnId), ["turn-a"]);

  speaking = false;
  fireLatest();
  assert.deepEqual(batches, [["open Amazon"]]);
  assert.equal(batcher.snapshot().segments.length, 0);
});

test("Realtime event trace retains grounded output until the speaking turn is batched", () => {
  const state = loadState();
  const sent = [];
  let responseAllowed = false;
  const coordinator = state.createCoordinator({
    runTurn: async () => {},
    sendResponse: response => sent.push(response.event.id),
    canSendResponse: () => responseAllowed
  });

  coordinator.deferResponse({ kind: "grounded", event: { id: "verified-result" } });
  assert.equal(coordinator.snapshot().deferredResponses, 1);
  coordinator.releaseDeferredResponses();
  assert.deepEqual(sent, []);
  responseAllowed = true;
  coordinator.kickResponses();
  assert.deepEqual(sent, ["verified-result"]);
});

test("Realtime active intent survives a page replacement until an explicit stop", () => {
  const state = loadState();
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };

  const firstDocument = state.createIntentStore(storage, "jarvis-active");
  assert.equal(firstDocument.isActive(), false);
  assert.equal(firstDocument.activate(), true);
  assert.equal(values.get("jarvis-active"), "on");

  // A pagehide only relinquishes the current transport. A replacement
  // document sees the same tab-scoped intent and can reconnect itself.
  const replacementDocument = state.createIntentStore(storage, "jarvis-active");
  assert.equal(replacementDocument.isActive(), true);

  // Only an explicit user stop clears the persistent intent.
  assert.equal(replacementDocument.deactivate(), false);
  assert.equal(replacementDocument.isActive(), false);
  assert.equal(state.createIntentStore(storage, "jarvis-active").isActive(), false);
});

test("Realtime intent storage failure never prevents the current document from starting", () => {
  const state = loadState();
  const deniedStorage = {
    getItem: () => { throw new Error("denied"); },
    setItem: () => { throw new Error("denied"); },
    removeItem: () => { throw new Error("denied"); }
  };
  const store = state.createIntentStore(deniedStorage, "jarvis-active");

  assert.equal(store.isActive(), false);
  assert.equal(store.activate(), true);
  assert.equal(store.deactivate(), false);
});
