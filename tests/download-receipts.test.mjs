import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = { globalThis: {}, module: undefined, structuredClone, crypto, URL };
vm.runInNewContext(fs.readFileSync(new URL("../extension/download-receipts.js", import.meta.url), "utf8"), context);
const {
  DOWNLOAD_SURFACES, createDownloadReceiptManager, displayFilename,
  exactGodelDownloadSource, normalizedMime, verifiedDownloadMessage
} = context.globalThis.GodelVoiceDownloads;

function proven(command, formats) {
  return {
    ...DOWNLOAD_SURFACES[command],
    enabled: true,
    live_proof: {
      command,
      formats,
      verified_at: "2026-08-04T12:00:00Z",
      control_identity: `${command}:exact-export-control`
    }
  };
}

function manager(surface, options = {}) {
  return createDownloadReceiptManager({
    surfaces: { ...DOWNLOAD_SURFACES, [surface.live_proof.command]: surface },
    makeId: () => "receipt-1",
    now: options.now ?? (() => 1000),
    ttlMs: options.ttlMs,
    completionTtlMs: options.completionTtlMs
  });
}

const registration = {
  workflow_id: "wf-9", step_id: "step-3", panel_id: "ipo-window-2",
  command: "IPO", format: "xlsx", tab_id: 42,
  source_origin: "https://app.godelterminal.com",
  expected_scope: { rows: "full-list" }
};

function created(id, tabId = 42, patch = {}) {
  return {
    id, tabId,
    startTime: new Date(1000).toISOString(),
    url: "blob:https://app.godelterminal.com/verified-download",
    filename: "/Downloads/ipos.xlsx",
    ...patch
  };
}

test("all nine documented download surfaces remain disabled without live proof", () => {
  assert.deepEqual(Object.keys(DOWNLOAD_SURFACES).sort(), ["ANR", "EQS", "FA", "G", "GF", "HDS", "HP", "IPO", "N"]);
  for (const surface of Object.values(DOWNLOAD_SURFACES)) assert.equal(surface.enabled, false);
  const receipts = createDownloadReceiptManager({ makeId: () => "never" });
  assert.throws(() => receipts.register(registration), /disabled.*live proof/i);
});

test("registration is pre-activation and bound to workflow, step, panel, command, format and tab", () => {
  const receipts = manager(proven("IPO", ["xlsx"]));
  const receipt = receipts.register(registration);
  assert.equal(receipt.state, "registered");
  assert.equal(receipt.workflow_id, "wf-9");
  assert.equal(receipt.step_id, "step-3");
  assert.equal(receipt.panel_id, "ipo-window-2");
  assert.equal(receipt.overwrite_policy, "uniquify");
  assert.deepEqual(receipt.expected_scope, { rows: "full-list" });
  assert.throws(() => receipts.register({ ...registration, workflow_id: "wf-10" }), /already registered/i);
});

test("a registered receipt binds only to a download created by its exact tab", () => {
  const receipts = manager(proven("IPO", ["xlsx"]));
  receipts.register(registration);
  assert.equal(receipts.bindCreated(created(8, 41)), null);
  const bound = receipts.bindCreated(created(9));
  assert.equal(bound.download_id, 9);
  assert.equal(bound.state, "created");
  assert.equal(JSON.stringify(receipts.overwriteSuggestion(9)), JSON.stringify({ conflictAction: "uniquify" }));
  assert.equal(receipts.overwriteSuggestion(8), null);
});

test("completion verifies existence, extension, MIME and nonzero size before success", () => {
  const receipts = manager(proven("IPO", ["xlsx"]));
  receipts.register(registration);
  receipts.bindCreated(created(9));
  const result = receipts.complete({
    id: 9, state: "complete", exists: true,
    filename: "/Downloads/Godel IPOs.xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fileSize: 1224
  });
  assert.equal(result.state, "verified");
  assert.equal(result.size_bytes, 1224);
  assert.match(result.filename, /Godel IPOs\.xlsx$/);
});

for (const [label, patch, expected] of [
  ["extension", { filename: "/Downloads/ipos.csv" }, "unexpected_extension:csv"],
  ["MIME", { mime: "text/plain" }, "unexpected_mime:text/plain"],
  ["size", { fileSize: 0 }, "empty_download"],
  ["existence", { exists: false }, "downloaded_file_not_found"]
]) {
  test(`completion fails closed on invalid ${label}`, () => {
    const receipts = manager(proven("IPO", ["xlsx"]));
    receipts.register(registration);
    receipts.bindCreated(created(9));
    const result = receipts.complete({
      id: 9, state: "complete", exists: true,
      filename: "/Downloads/ipos.xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      fileSize: 20,
      ...patch
    });
    assert.equal(result.state, "failed");
    assert.equal(result.failure_reason, expected);
  });
}

test("registration refuses unknown formats, missing identity and non-Godel origins", () => {
  const receipts = manager(proven("IPO", ["xlsx"]));
  assert.throws(() => receipts.register({ ...registration, format: "csv" }), /Unverified IPO download format/);
  assert.throws(() => receipts.register({ ...registration, panel_id: "" }), /workflow, step, and panel IDs/);
  assert.throws(() => receipts.register({ ...registration, source_origin: "https://example.com" }), /Godel Terminal origin/);
});

test("stale registrations fail without claiming a later unrelated download", () => {
  let clock = 1000;
  const receipts = manager(proven("IPO", ["xlsx"]), { now: () => clock, ttlMs: 500 });
  receipts.register(registration);
  clock = 1600;
  assert.equal(receipts.bindCreated(created(11)), null);
  assert.equal(receipts.get("receipt-1").state, "failed");
  assert.equal(receipts.get("receipt-1").failure_reason, "download_not_created_before_deadline");
});

test("registered and created receipts survive service-worker restart", () => {
  let serial = 0;
  const surface = proven("IPO", ["xlsx"]);
  const first = createDownloadReceiptManager({
    surfaces: { ...DOWNLOAD_SURFACES, IPO: surface }, now: () => 1000, makeId: () => `receipt-${++serial}`
  });
  first.register(registration);
  first.bindCreated(created(91));
  const second = createDownloadReceiptManager({
    surfaces: { ...DOWNLOAD_SURFACES, IPO: surface }, now: () => 1100, makeId: () => `receipt-${++serial}`
  });
  second.restore(first.snapshot());
  assert.deepEqual(JSON.parse(JSON.stringify(second.overwriteSuggestion(91))), { conflictAction: "uniquify" });
  const result = second.complete({
    id: 91, state: "complete", exists: true, filename: "/Downloads/ipos.xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileSize: 44
  });
  assert.equal(result.workflow_id, "wf-9");
  assert.equal(result.panel_id, "ipo-window-2");
  assert.equal(result.state, "verified");
});

test("download creation requires exact Godel origin and post-registration timing", () => {
  const receipts = manager(proven("IPO", ["xlsx"]));
  receipts.register(registration);
  assert.equal(receipts.bindCreated(created(1, 42, { url: "https://example.com/export.xlsx" })), null);
  assert.equal(receipts.bindCreated(created(2, 42, { startTime: new Date(-5000).toISOString() })), null);
  assert.equal(receipts.bindCreated(created(6, 42, { filename: "/Downloads/other.pdf" })), null);
  assert.equal(receipts.bindCreated(created(3, 42, {
    url: "https://app.godelterminal.com/download/ipo",
    finalUrl: "https://example.com/redirected.xlsx"
  })), null);
  assert.equal(receipts.bindCreated(created(4)).download_id, 4);
  assert.equal(exactGodelDownloadSource(created(5)), true);
});

test("a created download expires if the browser never reports completion", () => {
  let clock = 1000;
  const receipts = manager(proven("IPO", ["xlsx"]), { now: () => clock, completionTtlMs: 500 });
  receipts.register(registration);
  receipts.bindCreated(created(7));
  clock = 1600;
  assert.equal(receipts.get("receipt-1").state, "failed");
  assert.equal(receipts.get("receipt-1").failure_reason, "download_not_completed_before_deadline");
  assert.equal(receipts.overwriteSuggestion(7), null);
});

test("verified completion narration is concise and never speaks an absolute path", () => {
  const receipts = manager(proven("IPO", ["xlsx"]));
  receipts.register(registration);
  receipts.bindCreated(created(12));
  const receipt = receipts.complete({
    id: 12, state: "complete", exists: true,
    filename: "/Users/isaac/Downloads/Godel IPOs.xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; charset=binary",
    fileSize: 100
  });
  assert.equal(normalizedMime("text/csv; charset=utf-8"), "text/csv");
  assert.equal(displayFilename(receipt.filename), "Godel IPOs.xlsx");
  assert.equal(verifiedDownloadMessage(receipt), "Downloaded full IPO list as Godel IPOs.xlsx.");
  assert.equal(verifiedDownloadMessage({ ...receipt, state: "failed" }), null);
});

test("restore rejects receipts that no longer match a live-proven surface", () => {
  const surface = proven("IPO", ["xlsx"]);
  const receipts = createDownloadReceiptManager({
    surfaces: { ...DOWNLOAD_SURFACES, IPO: surface }, now: () => 1000, makeId: () => "receipt-restored"
  });
  receipts.restore([{ ...registration, receipt_id: "bad-format", state: "registered",
    command: "IPO", expected_format: "csv", registered_at: 1000, overwrite_policy: "uniquify" }]);
  receipts.restore([{ ...registration, receipt_id: "bad-origin", state: "registered",
    command: "IPO", expected_format: "xlsx", registered_at: 1000, overwrite_policy: "uniquify",
    source_origin: "https://example.com" }]);
  assert.equal(receipts.snapshot().length, 0);
});

test("background exposes spoken completion only through the verified receipt formatter", () => {
  const background = fs.readFileSync(new URL("../extension/background.js", import.meta.url), "utf8");
  assert.match(background, /spoken_message: GodelVoiceDownloads\.verifiedDownloadMessage\(receipt\)/);
  assert.doesNotMatch(background, /spoken_message:\s*["'`]Downloaded/);
});
