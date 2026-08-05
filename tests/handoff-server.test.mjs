import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHandoffServer, HandoffStore, progressMessageForMarker } from "../src/handoff-server.mjs";

const marker = `GV1:${JSON.stringify({ version: 1, command: "HMAP", arguments: [], actions: [] })}`;

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function waitUntil(predicate, timeoutMs = 1_000) {
  const deadline = performance.now() + timeoutMs;
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error("condition did not become true before timeout");
    await delay(2);
  }
}

function delayNextResponseFinish(server, milliseconds = 75) {
  server.prependListener("request", (request, response) => {
    if (!request.url?.startsWith("/next?")) return;
    const end = response.end.bind(response);
    response.end = (...arguments_) => {
      setTimeout(() => {
        if (!response.destroyed) end(...arguments_);
      }, milliseconds);
      return response;
    };
  });
}

function openDisposableRequest(url, headers) {
  const request = http.get(url, { headers });
  request.on("response", response => response.resume());
  request.on("error", () => {});
  return request;
}

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

test("handoff diagnostics retain bounded per-action GF latency", () => {
  const store = new HandoffStore();
  const entry = store.enqueue(marker).entry;
  store.lease("arc-tab-a");
  store.acknowledge(entry.id, "completed", {
    client_id: "arc-tab-a",
    steps: [{
      step_id: "gf-comparison", kind: "command", command: "GF", status: "completed", duration_ms: 9300,
      nested_actions: [
        { action: "setRange", subject: "5Y", attempt: 1, status: "completed", duration_ms: 41.6 },
        { action: "addCompany", subject: "META<script>", attempt: 9, status: "completed", duration_ms: 302.2 },
        { action: "addMetric", subject: "META:operating_margin", attempt: 1, status: "completed", duration_ms: 411.8 }
      ]
    }]
  });
  assert.deepEqual(store.status(entry.id).steps[0].nested_actions, [
    { index: 0, action: "setRange", subject: "5Y", attempt: 1, status: "completed", duration_ms: 42 },
    { index: 1, action: "addCompany", subject: "METAscript", attempt: 3, status: "completed", duration_ms: 302 },
    { index: 2, action: "addMetric", subject: "META:operating_margin", attempt: 1, status: "completed", duration_ms: 412 }
  ]);
});

test("handoff diagnostics preserve only bounded workflow latency phases", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "godel-workflow-phases-"));
  const logPath = path.join(directory, "events.jsonl");
  const store = new HandoffStore({ logPath });
  const entry = store.enqueue(marker).entry;
  store.lease("arc-tab-a");
  store.acknowledge(entry.id, "completed", {
    client_id: "arc-tab-a",
    phases: {
      lifecycle_barrier_ms: 5123.6,
      workspace_prepare_ms: 841.2,
      layout_ms: -9,
      reconcile_ms: 72.8,
      completion_fact_ms: 4.4,
      transcript: "never retain this",
      api_key: "never retain this either"
    }
  });

  assert.deepEqual(store.status(entry.id).phases, {
    lifecycle_barrier_ms: 5124,
    workspace_prepare_ms: 841,
    layout_ms: 0,
    reconcile_ms: 73,
    completion_fact_ms: 4
  });
  const log = fs.readFileSync(logPath, "utf8");
  assert.doesNotMatch(log, /never retain this|api_key|transcript/);
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

test("executor affinity prevents a second Godel tab from stealing targeted work", () => {
  const store = new HandoffStore();
  const ownerA = "gx-owner-a";
  const ownerB = "gx-owner-b";
  const generationA = "gd-document-a";
  const generationB = "gd-document-b";
  const entry = store.enqueue(marker, "two-tab-request", ownerA, generationA).entry;

  assert.equal(store.lease(ownerB, ownerB, generationB), null);
  const leased = store.lease(ownerA, ownerA, generationA);
  assert.equal(leased.id, entry.id);
  assert.equal(leased.executor_id, ownerA);
  assert.equal(leased.document_generation, generationA);
});

test("executor contexts remain separated while a tab keeps context across document generations", () => {
  const store = new HandoffStore();
  const ownerA = "gx-owner-a";
  const ownerB = "gx-owner-b";
  store.setContext({ focused_panel: { command: "GF", security: "META" } }, ownerA, "gd-a-1");
  store.setContext({ focused_panel: { command: "EM", security: "AMZN" } }, ownerB, "gd-b-1");

  assert.equal(store.recentContext(15_000, 900_000, ownerA).focused_panel.security, "META");
  assert.equal(store.recentContext(15_000, 900_000, ownerB).focused_panel.security, "AMZN");

  store.setContext({ focused_panel: { command: "HMAP" } }, ownerA, "gd-a-2");
  assert.equal(store.currentDocumentGeneration(ownerA), "gd-a-2");
  assert.equal(store.recentContext(15_000, 900_000, ownerA).focused_panel.command, "HMAP");
  assert.equal(store.recentContext(15_000, 900_000, ownerB).focused_panel.security, "AMZN");
});

test("a pinned Realtime executor stays pinned when it publishes fresh context", () => {
  let now = 1_000;
  const store = new HandoffStore({ clock: () => now });
  store.setContext({ focused_panel: { command: "HMAP" } }, "gx-owner-a", "gd-a");
  store.armExecutor("gx-owner-a", "gd-a");

  now = 2_000;
  store.setContext({ focused_panel: { command: "EM", security: "AMZN" } }, "gx-owner-a", "gd-a");

  assert.equal(store.armedPinned, true);
  assert.deepEqual(store.armedExecutor(), {
    executor_id: "gx-owner-a", document_generation: "gd-a", armed_at: now
  });
});

test("background context cannot steal a pinned executor after its owner publishes context", () => {
  let now = 1_000;
  const store = new HandoffStore({ clock: () => now });
  store.setContext({ focused_panel: { command: "HMAP" } }, "gx-owner-a", "gd-a");
  store.armExecutor("gx-owner-a", "gd-a");
  const entry = store.enqueue(marker, "pinned-owner", "gx-owner-a", "gd-a").entry;
  store.lease("gx-owner-a", "gx-owner-a", "gd-a");

  now = 2_000;
  store.setContext({ focused_panel: { command: "GF", security: "AMZN" } }, "gx-owner-a", "gd-a");
  assert.equal(store.armedPinned, true);

  now = 3_000;
  store.setContext({ focused_panel: { command: "EM", security: "META" } }, "gx-owner-b", "gd-b");
  assert.deepEqual(store.armedExecutor(), {
    executor_id: "gx-owner-a", document_generation: "gd-a", armed_at: 2_000
  });
  assert.equal(store.armedPinned, true);
  assert.equal(store.status(entry.id).cancel_requested, false);
  assert.ok(store.heartbeat(entry.id, "gx-owner-a", "gx-owner-a", "gd-a"));
});

test("stale document generations fail closed for delivery and acknowledgement", () => {
  const store = new HandoffStore();
  const owner = "gx-stable-owner";
  store.setContext({ focused_panel: { command: "HMAP" } }, owner, "gd-old");
  const stale = store.enqueue(marker, "stale-document-request", owner, "gd-old").entry;
  store.setContext({ focused_panel: { command: "HMAP" } }, owner, "gd-new");

  assert.equal(store.lease(owner, owner, "gd-new"), null);
  assert.equal(store.status(stale.id).status, "failed");
  assert.match(store.status(stale.id).error, /document changed/);

  const fresh = store.enqueue(marker, "fresh-document-request", owner, "gd-new").entry;
  store.lease(owner, owner, "gd-new");
  assert.throws(() => store.acknowledge(fresh.id, "completed", {
    client_id: owner, executor_id: owner, document_generation: "gd-old"
  }), /stale executor document/);
  assert.equal(store.acknowledge(fresh.id, "completed", {
    client_id: owner, executor_id: owner, document_generation: "gd-new"
  }).status, "completed");
});

test("arming a new owner revokes the previous owner's inflight authority", () => {
  const store = new HandoffStore();
  store.armExecutor("gx-owner-a", "gd-a");
  const entry = store.enqueue(marker, "owner-revocation", "gx-owner-a", "gd-a").entry;
  store.lease("gx-owner-a", "gx-owner-a", "gd-a");
  store.armExecutor("gx-owner-b", "gd-b");
  assert.equal(store.status(entry.id).status, "cancelled");
  assert.equal(store.status(entry.id).cancel_requested, true);
  assert.equal(store.heartbeat(entry.id, "gx-owner-a", "gx-owner-a", "gd-a"), null);
  assert.throws(() => store.acknowledge(entry.id, "completed", {
    client_id: "gx-owner-a", executor_id: "gx-owner-a", document_generation: "gd-a"
  }), /cancelled workflow/);
});

test("armed ownership survives ordinary pauses and an expired pin can be reclaimed", async t => {
  let now = 1_000;
  const store = new HandoffStore({ clock: () => now });
  store.setContext({ focused_panel: { command: "HMAP" } }, "gx-owner", "gd-document");
  const handoff = createHandoffServer({ secret: "test-secret", store, port: 0, clock: () => now });
  const address = await handoff.listen();
  t.after(() => handoff.close());
  now += 15_001;
  const paused = await fetch(`http://127.0.0.1:${address.port}/plan`, {
    method: "POST", headers: { Authorization: "Bearer test-secret" }, body: marker
  });
  assert.equal(paused.status, 202);
  const pausedId = (await paused.json()).id;
  assert.equal(store.lease("gx-owner", "gx-owner", "gd-document").id, pausedId);
  store.acknowledge(pausedId, "completed", {
    client_id: "gx-owner", executor_id: "gx-owner", document_generation: "gd-document"
  });

  now += 60 * 60_000 + 1;
  assert.equal(store.armedExecutor(), null);
  store.setContext({ focused_panel: { command: "HMAP" } }, "gx-new-owner", "gd-new-document");
  const reclaimed = await fetch(`http://127.0.0.1:${address.port}/plan`, {
    method: "POST", headers: { Authorization: "Bearer test-secret" }, body: marker
  });
  assert.equal(reclaimed.status, 202);
  const reclaimedId = (await reclaimed.json()).id;
  assert.equal(store.lease("gx-new-owner", "gx-new-owner", "gd-new-document").id, reclaimedId);
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

test("delivery abandonment can only return the exact transport lease", () => {
  const store = new HandoffStore();
  const entry = store.enqueue(marker).entry;
  const first = store.lease("dead-client");
  const deadDeliveryLeaseId = first.delivery_lease_id;
  assert.equal(store.abandonDelivery(entry.id, deadDeliveryLeaseId).attempts, 0);

  const replacement = store.lease("replacement-client");
  assert.notEqual(replacement.delivery_lease_id, deadDeliveryLeaseId);
  assert.equal(store.abandonDelivery(entry.id, deadDeliveryLeaseId), null);
  assert.equal(store.status(entry.id).status, "inflight");
  assert.equal(store.status(entry.id).attempts, 1);
});

test("expired work cannot be revived or acknowledged by its former lease owner", () => {
  let now = 10_000;
  const store = new HandoffStore({ clock: () => now, leaseMs: 100 });
  const entry = store.enqueue(marker, "expiring-work").entry;
  store.lease("old-owner");
  now += 101;
  assert.equal(store.status(entry.id).status, "queued");
  assert.equal(store.heartbeat(entry.id, "old-owner"), null);
  assert.throws(() => store.acknowledge(entry.id, "completed", { client_id: "old-owner" }), /not leased/);
  assert.equal(store.lease("new-owner").attempts, 2);
});

test("cancelled inflight work becomes terminal immediately and cannot revive as completed", () => {
  let now = 20_000;
  const store = new HandoffStore({ clock: () => now, leaseMs: 100 });
  const entry = store.enqueue(marker, "cancel-expiry").entry;
  store.lease("owner");
  store.cancel(entry.id);
  assert.equal(store.status(entry.id).status, "cancelled");
  assert.equal("marker" in store.entries[0], false);
  assert.equal(store.status(entry.id).finished_at, now);
  assert.equal(store.heartbeat(entry.id, "owner"), null);
  assert.throws(() => store.acknowledge(entry.id, "completed", { client_id: "owner" }), /cancelled workflow/);
  assert.equal(store.acknowledge(entry.id, "cancelled", { client_id: "owner" }).status, "cancelled");
  assert.equal(store.acknowledge(entry.id, "failed", { client_id: "owner" }).status, "cancelled");
});

test("arming a replacement executor retires queued work and cancels inflight work", () => {
  const store = new HandoffStore();
  store.armExecutor("gx-owner-a", "gd-generation-a");
  const queued = store.enqueue(marker, "queued-a", "gx-owner-a", "gd-generation-a").entry;
  const inflight = store.enqueue(marker, "inflight-a", "gx-owner-a", "gd-generation-a").entry;
  store.lease("gx-owner-a", "gx-owner-a", "gd-generation-a");
  store.armExecutor("gx-owner-b", "gd-generation-b");
  assert.equal(store.status(queued.id).status, "cancelled");
  assert.equal(store.status(queued.id).cancel_requested, true);
  assert.equal(store.status(inflight.id).status, "failed");
  assert.equal(store.counts().queued ?? 0, 0);
  assert.equal(store.counts().inflight ?? 0, 0);
});

test("a disarmed old owner cannot leave targeted work behind after another owner starts", () => {
  const store = new HandoffStore();
  store.armExecutor("gx-owner-a", "gd-a");
  const queued = store.enqueue(marker, "disarm-rearm", "gx-owner-a", "gd-a").entry;
  assert.equal(store.disarmExecutor("gx-owner-a", "gd-a"), true);
  store.armExecutor("gx-owner-b", "gd-b");
  assert.equal(store.status(queued.id).status, "failed");
});

test("queued workflows expire instead of remaining permanent zombies", () => {
  let now = 30_000;
  const store = new HandoffStore({ clock: () => now, queuedTtlMs: 100 });
  const entry = store.enqueue(marker, "queued-expiry").entry;
  now += 101;
  assert.equal(store.status(entry.id).status, "failed");
  assert.match(store.status(entry.id).error, /expired before delivery/);
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

test("bounded long-poll leases newly queued work without waiting for a polling interval", async t => {
  const store = new HandoffStore();
  const handoff = createHandoffServer({ secret: "test-secret", store, port: 0 });
  const address = await handoff.listen();
  t.after(() => handoff.close());
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { Authorization: "Bearer test-secret" };
  const startedAt = performance.now();
  const pending = fetch(`${base}/next?client=arc-long&wait_ms=1000`, { headers });
  await new Promise(resolve => setTimeout(resolve, 15));
  const queued = await (await fetch(`${base}/plan`, { method: "POST", headers, body: marker })).json();
  const deliveryResponse = await pending;
  const elapsedMs = performance.now() - startedAt;
  assert.equal(deliveryResponse.status, 200);
  assert.equal((await deliveryResponse.json()).id, queued.id);
  assert.ok(elapsedMs < 250, `long-poll delivery took ${Math.round(elapsedMs)} ms`);
});

test("an immediate /next abort before response finish returns the exact lease without consuming an attempt", async t => {
  const store = new HandoffStore();
  const handoff = createHandoffServer({ secret: "test-secret", store, port: 0 });
  delayNextResponseFinish(handoff.server);
  const address = await handoff.listen();
  t.after(() => handoff.close());
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { Authorization: "Bearer test-secret" };
  const queued = store.enqueue(marker, "immediate-dead-client").entry;

  const deadClient = openDisposableRequest(`${base}/next?client=dead-immediate`, headers);
  await waitUntil(() => store.entries.find(entry => entry.id === queued.id)?.leased_to === "dead-immediate");
  deadClient.destroy();
  await waitUntil(() => store.status(queued.id).status === "queued");
  assert.equal(store.status(queued.id).attempts, 0);

  const replacement = await fetch(`${base}/next?client=replacement-immediate`, { headers });
  assert.equal(replacement.status, 200);
  assert.deepEqual(await replacement.json(), {
    id: queued.id, marker, attempt: 1, lease_ms: store.leaseMs,
    premium_voice: false, realtime: false
  });
});

test("destroy-socket/enqueue race requeues a long-poll lease and wakes its replacement immediately", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "godel-dead-delivery-"));
  const logPath = path.join(directory, "events.jsonl");
  const store = new HandoffStore({ logPath });
  const handoff = createHandoffServer({ secret: "test-secret", store, port: 0 });
  delayNextResponseFinish(handoff.server);
  const address = await handoff.listen();
  t.after(() => handoff.close());
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { Authorization: "Bearer test-secret" };

  const deadClient = openDisposableRequest(`${base}/next?client=dead-long&wait_ms=1000`, headers);
  await delay(15);
  const queued = store.enqueue(marker, "long-poll-dead-client").entry;
  deadClient.destroy();
  await waitUntil(() => store.status(queued.id).status === "queued"
    && fs.readFileSync(logPath, "utf8").includes("workflow_delivery_abandoned"));

  const replacementStartedAt = performance.now();
  const response = await fetch(`${base}/next?client=replacement-long`, { headers });
  const elapsedMs = performance.now() - replacementStartedAt;
  assert.equal(response.status, 200);
  assert.equal((await response.json()).id, queued.id);
  assert.equal(store.status(queued.id).attempts, 1);
  assert.equal(store.entries.find(entry => entry.id === queued.id)?.leased_to, "replacement-long");
  assert.ok(elapsedMs < 350, `replacement lease took ${Math.round(elapsedMs)} ms`);
  assert.match(fs.readFileSync(logPath, "utf8"), /workflow_delivery_abandoned/);
});

test("long-poll timeout and executor supersession return an empty 204 fallback", async t => {
  const handoff = createHandoffServer({ secret: "test-secret", port: 0 });
  const address = await handoff.listen();
  t.after(() => handoff.close());
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { Authorization: "Bearer test-secret" };
  const timedOut = await fetch(`${base}/next?client=arc-timeout&wait_ms=15`, { headers });
  assert.equal(timedOut.status, 204);

  const first = fetch(`${base}/next?client=arc-one&executor=arc-one&wait_ms=1000`, { headers });
  await new Promise(resolve => setTimeout(resolve, 10));
  const second = fetch(`${base}/next?client=arc-one&executor=arc-one&wait_ms=1000`, { headers });
  assert.equal((await first).status, 204);
  await new Promise(resolve => setTimeout(resolve, 10));
  const queued = await (await fetch(`${base}/plan`, { method: "POST", headers, body: marker })).json();
  const replacement = await second;
  assert.equal(replacement.status, 200);
  assert.equal((await replacement.json()).id, queued.id);
});

test("ownership changes wake an ineligible long-poll and shutdown drains held requests", async t => {
  const handoff = createHandoffServer({ secret: "test-secret", port: 0 });
  const address = await handoff.listen();
  let closed = false;
  t.after(() => closed ? undefined : handoff.close());
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { Authorization: "Bearer test-secret" };
  const ownershipWait = fetch(`${base}/next?client=old-owner&executor=old-owner&generation=old-document&wait_ms=1000`, { headers });
  await new Promise(resolve => setTimeout(resolve, 10));
  const context = await fetch(`${base}/context`, {
    method: "POST",
    headers: {
      ...headers, "Content-Type": "application/json",
      "X-Godel-Executor-Id": "new-owner", "X-Godel-Document-Generation": "new-document"
    },
    body: JSON.stringify({ focused_panel: { command: "HMAP" } })
  });
  assert.equal(context.status, 200);
  assert.equal((await ownershipWait).status, 204);

  const shutdownWait = fetch(`${base}/next?client=new-owner&executor=new-owner&generation=new-document&wait_ms=25000`, { headers });
  await new Promise(resolve => setTimeout(resolve, 10));
  await handoff.close();
  closed = true;
  assert.equal((await shutdownWait).status, 204);
});

test("HTTP rejects a late completed acknowledgement after terminal failure", async t => {
  const spoken = [];
  const store = new HandoffStore();
  const handoff = createHandoffServer({
    secret: "test-secret", store, port: 0,
    speaker: { speak: async (...args) => spoken.push(args) }
  });
  const address = await handoff.listen();
  t.after(() => handoff.close());
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { Authorization: "Bearer test-secret" };
  const queued = await (await fetch(`${base}/plan`, { method: "POST", headers, body: marker })).json();
  await fetch(`${base}/next?client=arc-failed`, { headers });
  const failed = await fetch(`${base}/ack`, {
    method: "POST", headers,
    body: JSON.stringify({ id: queued.id, client_id: "arc-failed", status: "failed", error: "terminal failure" })
  });
  assert.equal(failed.status, 200);
  assert.equal((await failed.json()).status, "failed");

  const lateSuccess = await fetch(`${base}/ack`, {
    method: "POST", headers,
    body: JSON.stringify({ id: queued.id, client_id: "arc-failed", status: "completed", message: "late success" })
  });
  assert.equal(lateSuccess.ok, false);
  assert.equal(lateSuccess.status, 400);
  assert.match((await lateSuccess.json()).error, /failed workflow cannot be acknowledged as completed/);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(store.status(queued.id).status, "failed");
  assert.deepEqual(spoken, []);
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

test("premium voice speaks transcript progress only after the /next response finishes", async t => {
  const spoken = [];
  const speaker = { speak: async (message, id) => spoken.push({ message, id }) };
  const store = new HandoffStore();
  const handoff = createHandoffServer({ secret: "test-secret", store, speaker, port: 0 });
  delayNextResponseFinish(handoff.server);
  const address = await handoff.listen();
  t.after(() => handoff.close());
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { Authorization: "Bearer test-secret" };
  const research = `GV1:${JSON.stringify({
    version: 1, command: "TRAN", arguments: [],
    actions: [{ feature: "research", operation: "summarize", value: { periods: 4 } }]
  })}`;
  const queued = await (await fetch(`${base}/plan`, { method: "POST", headers, body: research })).json();
  const delivery = fetch(`${base}/next?client=arc-a`, { headers });
  await waitUntil(() => store.status(queued.id).status === "inflight");
  assert.deepEqual(spoken, []);
  assert.equal((await delivery).status, 200);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(spoken, [{ message: "I'm checking the latest four earnings calls.", id: `${queued.id}-progress` }]);
});

test("aborted /next delivery never speaks transcript progress", async t => {
  const spoken = [];
  const speaker = { speak: async (message, id) => spoken.push({ message, id }) };
  const store = new HandoffStore();
  const handoff = createHandoffServer({ secret: "test-secret", store, speaker, port: 0 });
  delayNextResponseFinish(handoff.server);
  const address = await handoff.listen();
  t.after(() => handoff.close());
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { Authorization: "Bearer test-secret" };
  const research = `GV1:${JSON.stringify({
    version: 1, command: "TRAN", arguments: [],
    actions: [{ feature: "research", operation: "summarize", value: { periods: 4 } }]
  })}`;
  const queued = store.enqueue(research, "aborted-progress").entry;
  const deadClient = openDisposableRequest(`${base}/next?client=dead-progress`, headers);
  await waitUntil(() => store.status(queued.id).status === "inflight");
  deadClient.destroy();
  await waitUntil(() => store.status(queued.id).status === "queued");
  await delay(100);
  assert.deepEqual(spoken, []);
  assert.equal(store.entries.find(entry => entry.id === queued.id)?.progress_queued, undefined);
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
