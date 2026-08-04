import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHandoffServer, HandoffStore, progressMessageForMarker } from "../src/handoff-server.mjs";

const marker = `GV1:${JSON.stringify({ version: 1, command: "HMAP", arguments: [], actions: [] })}`;

test("long transcript research gets a bounded deterministic progress phrase", () => {
  const research = `GV1:${JSON.stringify({
    version: 1, command: "TRAN", arguments: [],
    actions: [{ feature: "research", operation: "summarize", value: { periods: 4 } }]
  })}`;
  assert.equal(progressMessageForMarker(research), "I'm checking the latest four earnings calls.");
  assert.equal(progressMessageForMarker(marker), null);
});

test("handoff store deduplicates, leases, acknowledges and records diagnostics", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "godel-handoff-"));
  let now = 1_000;
  const store = new HandoffStore({
    statePath: path.join(directory, "queue.json"),
    logPath: path.join(directory, "events.jsonl"),
    clock: () => now,
    leaseMs: 500,
    dedupeMs: 1_000
  });
  const first = store.enqueue(marker);
  const duplicate = store.enqueue(marker);
  assert.equal(duplicate.deduplicated, true);
  assert.equal(duplicate.entry.id, first.entry.id);

  const leased = store.lease("arc-tab-a");
  assert.equal(leased.id, first.entry.id);
  assert.equal(store.lease("arc-tab-b"), null);
  assert.equal(store.status(first.entry.id).attempts, 1);

  store.acknowledge(first.entry.id, "completed", {
    client_id: "arc-tab-a", duration_ms: 121.6,
    message: "Done. The market heatmap is ready.\nGodel shows two active halts.",
    steps: [{ step_id: "secret-company-name", kind: "command", command: "HMAP", status: "completed", duration_ms: 81.4 }]
  });
  assert.equal(store.status(first.entry.id).status, "completed");
  assert.equal(store.status(first.entry.id).duration_ms, 122);
  assert.equal(store.status(first.entry.id).message, "Done. The market heatmap is ready. Godel shows two active halts.");
  assert.deepEqual(store.status(first.entry.id).steps[0], {
    index: 0, step_ref: "848ec30c221b", kind: "command", command: "HMAP", status: "completed", duration_ms: 81
  });
  assert.equal("marker" in store.entries[0], false);
  const log = fs.readFileSync(path.join(directory, "events.jsonl"), "utf8");
  assert.match(log, /workflow_queued/);
  assert.match(log, /workflow_acknowledged/);
  assert.doesNotMatch(log, /GV1:/);
});

test("separate VoiceInk request IDs may intentionally repeat the same relative action", () => {
  const store = new HandoffStore({ dedupeMs: 10_000 });
  const first = store.enqueue(marker, "voice-request-one");
  const second = store.enqueue(marker, "voice-request-two");
  const retry = store.enqueue(marker, "voice-request-two");
  assert.equal(first.deduplicated, false);
  assert.equal(second.deduplicated, false);
  assert.notEqual(second.entry.id, first.entry.id);
  assert.equal(retry.deduplicated, true);
  assert.equal(retry.entry.id, second.entry.id);
});

test("executor context is sanitized, persisted and expires", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "godel-voice-context-"));
  const statePath = path.join(temporary, "state.json");
  let now = 1_000;
  const store = new HandoffStore({ statePath, clock: () => now });
  const context = store.setContext({
    focused_panel: { command: "gf<script>", security: "meta;drop", connected: true },
    last_panel: { command: "HALT", security: null },
    panels: Array.from({ length: 20 }, (_, index) => ({ command: index ? "G" : "GF", security: `aapl-${index}` }))
  });
  assert.equal(context.focused_panel, null);
  assert.equal(context.panels.length, 16);
  assert.deepEqual(new HandoffStore({ statePath, clock: () => now }).recentContext(), context);
  now += 15_001;
  assert.equal(store.recentContext(), null);
  fs.rmSync(temporary, { recursive: true, force: true });
});

test("TRAN research context is bounded and outlives short-lived panel context", () => {
  let now = 1_000;
  const store = new HandoffStore({ clock: () => now });
  const value = store.setContext({
    focused_panel: { command: "TRAN", security: "AMZN" },
    research_session: {
      command: "TRAN", company: "Amazon", security: "AMZN",
      periods: ["Q2 2026", "Q1 2026"], topics: ["AWS growth", "margin pressure"],
      question: "How did AWS growth change?", summary: "AWS growth accelerated.",
      current_period: "Q2 2026", current_excerpt: "AWS revenue grew 17.5%."
    }
  });
  assert.equal(value.research_session.command, "TRAN");
  assert.equal(value.research_session.updated_at, 1_000);
  now += 15_001;
  assert.deepEqual(store.recentContext().panels, []);
  assert.equal(store.recentContext().focused_panel, null);
  assert.equal(store.recentContext().research_session.security, "AMZN");

  store.setContext({ focused_panel: { command: "HMAP" } });
  assert.equal(store.recentContext().research_session.updated_at, 1_000);
  now = 901_001;
  assert.equal(store.recentContext(), null);
});

test("TRAN research context rejects non-TRAN and oversized state", () => {
  const store = new HandoffStore();
  const base = {
    command: "TRAN", company: "Amazon", periods: ["Q2 2026"], topics: ["AWS"],
    question: "What changed?"
  };
  assert.throws(() => store.setContext({ research_session: { ...base, command: "GF" } }), /only valid for TRAN/);
  assert.throws(() => store.setContext({ research_session: { ...base, periods: Array(9).fill("Q2 2026") } }), /1-8 labels/);
  assert.throws(() => store.setContext({ research_session: { ...base, current_period: "Q1 2026" } }), /must be a requested period/);
});

test("expired leases recover after restart and queued work can be cancelled", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "godel-recovery-"));
  const statePath = path.join(directory, "queue.json");
  let now = 5_000;
  const first = new HandoffStore({ statePath, clock: () => now, leaseMs: 100 });
  const entry = first.enqueue(marker).entry;
  first.lease("old-tab");
  now += 101;
  const restarted = new HandoffStore({ statePath, clock: () => now, leaseMs: 100 });
  assert.equal(restarted.status(entry.id).status, "queued");
  restarted.cancel(entry.id);
  assert.equal(restarted.status(entry.id).status, "cancelled");
  assert.equal(restarted.lease("new-tab"), null);
});

test("an executor can immediately release a lease for bounded recovery", () => {
  const store = new HandoffStore();
  const entry = store.enqueue(marker).entry;
  store.lease("stale-extension");
  assert.equal(store.release(entry.id, "extension context invalidated", "stale-extension").status, "queued");
  assert.equal(store.lease("fresh-extension").attempts, 2);
});

test("HTTP handoff exposes leased delivery, status, acknowledgement and cancellation", async t => {
  const store = new HandoffStore();
  const handoff = createHandoffServer({ secret: "test-secret", store, port: 0 });
  const address = await handoff.listen();
  t.after(() => handoff.close());
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { Authorization: "Bearer test-secret" };

  const contextResponse = await fetch(`${base}/context`, {
    method: "POST", headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ focused_panel: { command: "GF", security: "META" }, panels: [{ command: "GF", security: "META" }] })
  });
  assert.equal(contextResponse.status, 200);
  const publishedContext = (await contextResponse.json()).context;
  assert.deepEqual(publishedContext.focused_panel, { command: "GF", security: "META", connected: true });
  const fetchedContext = await (await fetch(`${base}/context`, { headers })).json();
  assert.deepEqual(fetchedContext.context, publishedContext);

  const queuedResponse = await fetch(`${base}/plan`, { method: "POST", headers, body: marker });
  assert.equal(queuedResponse.status, 202);
  const queued = await queuedResponse.json();
  assert.equal(typeof queued.id, "string");

  const deliveryResponse = await fetch(`${base}/next?client=arc-a`, { headers });
  const delivery = await deliveryResponse.json();
  assert.deepEqual({ id: delivery.id, marker: delivery.marker, attempt: delivery.attempt }, { id: queued.id, marker, attempt: 1 });
  assert.equal((await fetch(`${base}/next?client=arc-b`, { headers })).status, 204);

  const status = await (await fetch(`${base}/status?id=${queued.id}`, { headers })).json();
  assert.equal(status.status, "inflight");
  assert.equal(status.lease_owned, false);
  const ownedStatus = await (await fetch(`${base}/status?id=${queued.id}&client=arc-a`, { headers })).json();
  assert.equal(ownedStatus.lease_owned, true);
  const ack = await fetch(`${base}/ack`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: queued.id, client_id: "arc-a", status: "completed", duration_ms: 88 })
  });
  assert.equal(ack.status, 200);
  assert.equal((await ack.json()).status, "completed");

  const secondMarker = `GV1:${JSON.stringify({ version: 1, command: "EM", arguments: [], actions: [] })}`;
  const second = await (await fetch(`${base}/plan`, { method: "POST", headers, body: secondMarker })).json();
  const cancelled = await fetch(`${base}/cancel`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: second.id })
  });
  assert.equal((await cancelled.json()).status, "cancelled");
});

test("premium completion voice is queued once after a successful acknowledgement", async t => {
  const spoken = [];
  const speaker = { speak: async (message, id) => spoken.push({ message, id }) };
  const store = new HandoffStore();
  const handoff = createHandoffServer({ secret: "test-secret", store, speaker, port: 0 });
  const address = await handoff.listen();
  t.after(() => handoff.close());
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { Authorization: "Bearer test-secret" };
  const queued = await (await fetch(`${base}/plan`, { method: "POST", headers, body: marker })).json();
  await fetch(`${base}/next?client=arc-a`, { headers });
  const body = { id: queued.id, client_id: "arc-a", status: "completed", duration_ms: 21, message: "Done. The market heatmap is ready." };
  const first = await (await fetch(`${base}/ack`, { method: "POST", headers, body: JSON.stringify(body) })).json();
  const second = await (await fetch(`${base}/ack`, { method: "POST", headers, body: JSON.stringify(body) })).json();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(first.spoken_feedback_queued, true);
  assert.equal(second.spoken_feedback_queued, true);
  assert.deepEqual(spoken, [{ message: body.message, id: queued.id }]);
});

test("premium voice speaks transcript progress once when work is leased", async t => {
  const spoken = [];
  const speaker = { speak: async (message, id) => spoken.push({ message, id }) };
  const store = new HandoffStore();
  const handoff = createHandoffServer({ secret: "test-secret", store, speaker, port: 0 });
  const address = await handoff.listen();
  t.after(() => handoff.close());
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { Authorization: "Bearer test-secret" };
  const research = `GV1:${JSON.stringify({
    version: 1, command: "TRAN", arguments: [],
    actions: [{ feature: "research", operation: "summarize", value: { periods: 4 } }]
  })}`;
  const queued = await (await fetch(`${base}/plan`, { method: "POST", headers, body: research })).json();
  await fetch(`${base}/next?client=arc-a`, { headers });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(spoken, [{ message: "I'm checking the latest four earnings calls.", id: `${queued.id}-progress` }]);
});

test("heartbeats extend leases and only the lease owner can complete or release work", () => {
  let now = 10_000;
  const store = new HandoffStore({ clock: () => now, leaseMs: 100 });
  const entry = store.enqueue(marker).entry;
  store.lease("focused-tab");
  now += 80;
  assert.equal(store.heartbeat(entry.id, "focused-tab").lease_expires_at, 10_180);
  assert.throws(() => store.heartbeat(entry.id, "wrong-tab"), /lease owner mismatch/);
  assert.throws(() => store.acknowledge(entry.id, "completed", { client_id: "wrong-tab" }), /lease owner mismatch/);
  assert.throws(() => store.release(entry.id, "retry", "wrong-tab"), /lease owner mismatch/);
  assert.equal(store.acknowledge(entry.id, "completed", { client_id: "focused-tab" }).status, "completed");
  assert.equal(store.acknowledge(entry.id, "failed", { client_id: "focused-tab" }).status, "completed");
});

test("repeated abandoned leases fail closed instead of executing forever", () => {
  let now = 1_000;
  const store = new HandoffStore({ clock: () => now, leaseMs: 10, maxAttempts: 2 });
  const entry = store.enqueue(marker).entry;
  store.lease("tab-a");
  now += 11;
  store.lease("tab-b");
  now += 11;
  store.recoverExpiredLeases();
  assert.equal(store.status(entry.id).status, "failed");
  assert.match(store.status(entry.id).error, /lease expired repeatedly/);
  assert.equal(store.lease("tab-c"), null);
});

test("HTTP health identifies the protocol and checkout and heartbeat rejects a wrong tab", async t => {
  const handoff = createHandoffServer({ secret: "test-secret", instanceId: "checkout-a", port: 0 });
  const address = await handoff.listen();
  t.after(() => handoff.close());
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { Authorization: "Bearer test-secret" };
  const health = await (await fetch(`${base}/health`, { headers })).json();
  assert.equal(health.protocol_version, 4);
  assert.equal(health.instance_id, "checkout-a");
  assert.match(health.build_id, /^[a-f0-9]{16}$/);
  assert.equal(typeof health.uptime_ms, "number");
  const queued = await (await fetch(`${base}/plan`, { method: "POST", headers, body: marker })).json();
  await fetch(`${base}/next?client=focused-tab`, { headers });
  const wrong = await fetch(`${base}/heartbeat`, {
    method: "POST", headers,
    body: JSON.stringify({ id: queued.id, client_id: "other-tab" })
  });
  assert.equal(wrong.status, 400);
  const right = await fetch(`${base}/heartbeat`, {
    method: "POST", headers,
    body: JSON.stringify({ id: queued.id, client_id: "focused-tab" })
  });
  assert.equal(right.status, 200);
});
