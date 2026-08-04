(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GodelVoiceDownloads = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const GODEL_ORIGIN = "https://app.godelterminal.com";
  const DEFAULT_TTL_MS = 30_000;
  const MIME_BY_EXTENSION = Object.freeze({
    xlsx: Object.freeze([
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ]),
    json: Object.freeze(["application/json", "text/json"]),
    csv: Object.freeze(["text/csv", "application/csv", "application/vnd.ms-excel"]),
    pdf: Object.freeze(["application/pdf"]),
    png: Object.freeze(["image/png"]),
    jpg: Object.freeze(["image/jpeg"]),
    jpeg: Object.freeze(["image/jpeg"]),
    webp: Object.freeze(["image/webp"])
  });

  // Documentation establishes that these surfaces exist, not that Jarvis can
  // safely activate and verify them. A command is enabled only after a checked
  // live-proof record replaces this default entry.
  const DOWNLOAD_SURFACES = Object.freeze({
    FA: Object.freeze({ artifact: "financial statement", formats: ["xlsx", "json"], enabled: false }),
    HP: Object.freeze({ artifact: "all loaded OHLCV rows", formats: ["xlsx", "json"], enabled: false }),
    EQS: Object.freeze({ artifact: "completed screener results", formats: ["csv", "json"], enabled: false }),
    IPO: Object.freeze({ artifact: "full IPO list", formats: ["xlsx"], enabled: false }),
    N: Object.freeze({ artifact: "current open article", formats: ["pdf"], enabled: false }),
    G: Object.freeze({ artifact: "chart snapshot", formats: [], enabled: false }),
    ANR: Object.freeze({ artifact: "analyst ratings table", formats: [], enabled: false }),
    HDS: Object.freeze({ artifact: "holder table", formats: [], enabled: false }),
    GF: Object.freeze({ artifact: "fundamentals chart/data chooser", formats: [], enabled: false })
  });

  const clean = value => String(value ?? "").trim();
  const upper = value => clean(value).toUpperCase();
  const lower = value => clean(value).toLowerCase();

  function extensionOf(filename) {
    const match = lower(filename).match(/\.([a-z0-9]+)$/);
    return match?.[1] ?? "";
  }

  function validateProof(surface, command) {
    if (!surface?.enabled) throw new Error(`Download remains disabled for ${command}: live proof is missing`);
    const proof = surface.live_proof;
    if (!proof || proof.command !== command || !proof.verified_at || !proof.control_identity
      || !Array.isArray(proof.formats) || proof.formats.length < 1) {
      throw new Error(`Download remains disabled for ${command}: live proof is incomplete`);
    }
    for (const format of proof.formats) {
      if (!surface.formats.includes(lower(format))) throw new Error(`Invalid live-proof format for ${command}`);
    }
  }

  function validateRegistration(input, surfaces) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid download registration");
    const command = upper(input.command);
    const surface = surfaces[command];
    if (!surface) throw new Error(`No documented download surface for ${command || "unknown command"}`);
    validateProof(surface, command);
    const format = lower(input.format);
    if (!surface.formats.includes(format) || !surface.live_proof.formats.includes(format)) {
      throw new Error(`Unverified ${command} download format: ${format || "missing"}`);
    }
    const workflowId = clean(input.workflow_id);
    const stepId = clean(input.step_id);
    const panelId = clean(input.panel_id);
    if (!workflowId || !stepId || !panelId) throw new Error("Download must be bound to workflow, step, and panel IDs");
    const tabId = Number(input.tab_id);
    if (!Number.isInteger(tabId) || tabId < 0) throw new Error("Download registration requires a valid Godel tab ID");
    const sourceOrigin = clean(input.source_origin || GODEL_ORIGIN);
    if (sourceOrigin !== GODEL_ORIGIN) throw new Error("Download source must be the Godel Terminal origin");
    return {
      command, surface, format, workflowId, stepId, panelId, tabId, sourceOrigin,
      expectedScope: input.expected_scope ?? null
    };
  }

  function createDownloadReceiptManager(options = {}) {
    const surfaces = options.surfaces ?? DOWNLOAD_SURFACES;
    const now = options.now ?? (() => Date.now());
    const makeId = options.makeId ?? (() => crypto.randomUUID());
    const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    const pending = new Map();
    const downloadToReceipt = new Map();
    const receipts = new Map();

    function expire() {
      const cutoff = now() - ttlMs;
      for (const [id, receipt] of pending) {
        if (receipt.registered_at >= cutoff) continue;
        receipt.state = "failed";
        receipt.failure_reason = "download_not_created_before_deadline";
        receipt.finished_at = now();
        pending.delete(id);
      }
    }

    function register(input) {
      expire();
      const value = validateRegistration(input, surfaces);
      if ([...pending.values()].some(item => item.tab_id === value.tabId)) {
        throw new Error("A Godel download is already registered for this tab");
      }
      const id = makeId();
      const receipt = {
        receipt_id: id,
        state: "registered",
        workflow_id: value.workflowId,
        step_id: value.stepId,
        panel_id: value.panelId,
        command: value.command,
        artifact: value.surface.artifact,
        expected_format: value.format,
        expected_scope: value.expectedScope,
        tab_id: value.tabId,
        source_origin: value.sourceOrigin,
        registered_at: now(),
        overwrite_policy: "uniquify",
        download_id: null,
        filename: null,
        mime: null,
        size_bytes: null,
        failure_reason: null,
        finished_at: null
      };
      pending.set(id, receipt);
      receipts.set(id, receipt);
      return structuredClone(receipt);
    }

    function bindCreated(item) {
      expire();
      if (!item || !Number.isInteger(item.id) || !Number.isInteger(item.tabId)) return null;
      const candidates = [...pending.values()].filter(receipt => receipt.tab_id === item.tabId);
      if (candidates.length !== 1) return null;
      const receipt = candidates[0];
      if (downloadToReceipt.has(item.id)) throw new Error("Download ID is already bound to another workflow");
      pending.delete(receipt.receipt_id);
      receipt.state = "created";
      receipt.download_id = item.id;
      downloadToReceipt.set(item.id, receipt.receipt_id);
      return structuredClone(receipt);
    }

    function overwriteSuggestion(downloadId) {
      const receiptId = downloadToReceipt.get(downloadId);
      if (!receiptId) return null;
      // Do not suggest DownloadItem.filename: it may be an absolute path while
      // Chrome accepts only a relative suggested filename. Preserve Godel's
      // name and change only the conflict policy.
      return { conflictAction: "uniquify" };
    }

    function complete(item) {
      const receiptId = downloadToReceipt.get(item?.id);
      if (!receiptId) return null;
      const receipt = receipts.get(receiptId);
      if (receipt.state === "verified" || receipt.state === "failed") return structuredClone(receipt);
      const ext = extensionOf(item.filename);
      const mime = lower(item.mime);
      const size = Math.max(Number(item.fileSize) || 0, Number(item.totalBytes) || 0, Number(item.bytesReceived) || 0);
      let failure = null;
      if (item.state !== "complete") failure = item.error ? `browser:${item.error}` : "browser_download_not_complete";
      else if (item.exists !== true) failure = "downloaded_file_not_found";
      else if (ext !== receipt.expected_format) failure = `unexpected_extension:${ext || "missing"}`;
      else if (!MIME_BY_EXTENSION[ext]?.includes(mime)) failure = `unexpected_mime:${mime || "missing"}`;
      else if (size <= 0) failure = "empty_download";
      receipt.filename = clean(item.filename) || null;
      receipt.mime = mime || null;
      receipt.size_bytes = size;
      receipt.finished_at = now();
      receipt.failure_reason = failure;
      receipt.state = failure ? "failed" : "verified";
      downloadToReceipt.delete(item.id);
      return structuredClone(receipt);
    }

    function get(receiptId) {
      const value = receipts.get(clean(receiptId));
      return value ? structuredClone(value) : null;
    }

    function snapshot() {
      expire();
      return [...receipts.values()].map(value => structuredClone(value));
    }

    function restore(values) {
      if (!Array.isArray(values)) return;
      for (const stored of values) {
        if (!stored || typeof stored !== "object" || !clean(stored.receipt_id)) continue;
        if (!surfaces[upper(stored.command)] || !["registered", "created", "verified", "failed"].includes(stored.state)) continue;
        const receipt = structuredClone(stored);
        receipts.set(receipt.receipt_id, receipt);
        if (receipt.state === "registered") pending.set(receipt.receipt_id, receipt);
        if (receipt.state === "created" && Number.isInteger(receipt.download_id)) {
          downloadToReceipt.set(receipt.download_id, receipt.receipt_id);
        }
      }
      expire();
    }

    return { register, bindCreated, overwriteSuggestion, complete, get, snapshot, restore };
  }

  return {
    DOWNLOAD_SURFACES,
    GODEL_ORIGIN,
    MIME_BY_EXTENSION,
    createDownloadReceiptManager,
    extensionOf,
    validateRegistration
  };
});
