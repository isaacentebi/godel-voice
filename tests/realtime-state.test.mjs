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

test("Realtime never retries a response after any audio became audible", () => {
  const state = loadState();
  const sent = [];
  const failures = [];
  const coordinator = state.createCoordinator({
    runTurn: async () => {},
    sendResponse: response => sent.push(response.event.id),
    onError: error => failures.push(error.message)
  });

  coordinator.enqueueResponse({ kind: "grounded", event: { id: "only-once", event_id: "request-once" } });
  coordinator.responseCreated("provider-once");
  assert.equal(coordinator.responseStarted("provider-once"), true);
  assert.equal(coordinator.responseFailed(new Error("late provider failure"), "provider-once"), true);
  assert.deepEqual(sent, ["only-once"]);
  assert.deepEqual(failures, ["late provider failure"]);
  assert.equal(coordinator.snapshot().activeResponse, false);
});

test("Realtime still retries once when a response fails before first audio", () => {
  const state = loadState();
  const sent = [];
  const coordinator = state.createCoordinator({
    runTurn: async () => {},
    sendResponse: response => sent.push(response.event.id)
  });

  coordinator.enqueueResponse({ kind: "grounded", event: { id: "retryable", event_id: "request-retry" } });
  coordinator.responseCreated("provider-retry");
  assert.equal(coordinator.responseFailed(new Error("no audio"), "provider-retry"), true);
  assert.deepEqual(sent, ["retryable", "retryable"]);
  assert.equal(coordinator.responseStarted("provider-retry"), false, "late audio from the cancelled attempt stays unauthorized");
});

test("Realtime does not start the next response until the prior audio buffer drains", () => {
  const state = loadState();
  const sent = [];
  let audioPlaying = false;
  const coordinator = state.createCoordinator({
    runTurn: async () => {},
    sendResponse: response => sent.push(response.event.id),
    canSendResponse: () => !audioPlaying
  });

  coordinator.enqueueResponse({ kind: "first", event: { id: "first", event_id: "request-first" } });
  coordinator.responseCreated("provider-first");
  coordinator.responseStarted("provider-first");
  audioPlaying = true;
  coordinator.enqueueResponse({ kind: "second", event: { id: "second", event_id: "request-second" } });
  coordinator.responseDone("provider-first");
  assert.deepEqual(sent, ["first"], "response.done may precede audio-buffer stopped");

  audioPlaying = false;
  coordinator.kickResponses();
  assert.deepEqual(sent, ["first", "second"]);
});

test("Realtime reconnect preserves only responses that never became audible", () => {
  const state = loadState();
  const sent = [];
  const coordinator = state.createCoordinator({
    runTurn: async () => {},
    sendResponse: response => sent.push(response.event.id)
  });

  coordinator.enqueueResponse({ kind: "pending", event: { id: "pending", event_id: "request-pending" } });
  coordinator.responseCreated("provider-pending");
  coordinator.reset({ preserveResponses: true });
  assert.equal(coordinator.snapshot().queuedResponses, 1);
  coordinator.kickResponses();
  assert.deepEqual(sent, ["pending", "pending"]);

  coordinator.responseCreated("provider-audible");
  coordinator.responseStarted("provider-audible");
  coordinator.reset({ preserveResponses: true });
  assert.equal(coordinator.snapshot().queuedResponses, 0);
  coordinator.kickResponses();
  assert.deepEqual(sent, ["pending", "pending"], "audible speech is never replayed after reconnect");
});

test("Realtime can remove a stale queued progress acknowledgement before completion", () => {
  const state = loadState();
  const sent = [];
  let allowResponses = false;
  const coordinator = state.createCoordinator({
    runTurn: async () => {},
    sendResponse: response => sent.push(response.event.id),
    canSendResponse: () => allowResponses
  });

  coordinator.enqueueResponse({ kind: "progress", workflowProgressId: "workflow-1", event: { id: "stale-progress" } });
  coordinator.deferResponse({ kind: "progress", workflowProgressId: "workflow-1", event: { id: "stale-deferred" } });
  assert.equal(coordinator.dropResponses(response => response.workflowProgressId === "workflow-1"), 2);
  allowResponses = true;
  coordinator.kickResponses();
  assert.deepEqual(sent, []);
});

test("Realtime can cancel any unaudible active response when the user resumes speaking", () => {
  const state = loadState();
  const sent = [];
  const coordinator = state.createCoordinator({
    runTurn: async () => {},
    sendResponse: response => sent.push(response.event.id)
  });
  coordinator.enqueueResponse({ kind: "grounded_result", event: { id: "active-final" } });
  assert.equal(coordinator.cancelActiveResponse(() => true), true);
  assert.equal(coordinator.snapshot().activeResponse, false);
  assert.deepEqual(sent, ["active-final"]);
});

test("Realtime never treats already audible speech as a queued response", () => {
  const state = loadState();
  const coordinator = state.createCoordinator({
    runTurn: async () => {},
    sendResponse: () => {}
  });
  coordinator.enqueueResponse({ kind: "grounded_result", event: { id: "audible-final" } });
  coordinator.responseCreated("provider-audible");
  coordinator.responseStarted("provider-audible");
  assert.equal(coordinator.cancelActiveResponse(() => true), false);
  assert.equal(coordinator.snapshot().activeResponse, true);
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
