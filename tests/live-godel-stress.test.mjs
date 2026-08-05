import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { compileNaturalRequest } from "../src/compile-natural-request.mjs";
import { encodeWorkflowPlan } from "../src/workflow-plan.mjs";
import {
  assertExpectedLiveSemantics,
  assertLiveReadOnlyMarker,
  completedWithoutSkippedWork,
  LocalHandoffClient,
  normalizeLivePlanSemantics,
  resetWorkspaceMarker,
  runLiveGodelStress,
  validateLiveStressCases,
  WorkflowTimeoutError
} from "../src/run-live-godel-stress.mjs";

const defaultCases = JSON.parse(fs.readFileSync(
  new URL("../evals/data/godel-live-stress-cases-v1.json", import.meta.url), "utf8"
));

test("default live cases are bounded, deterministic and restricted to proven read-only surfaces", async () => {
  const cases = validateLiveStressCases(defaultCases);
  assert.equal(cases.length, 10);
  for (const item of cases) {
    const compiled = await compileNaturalRequest(item.phrase, {
      context: null,
      compile: async () => { throw new Error("default live cases must not call a model"); }
    });
    assert.equal(compiled.route, "local", item.id);
    const plan = assertLiveReadOnlyMarker(compiled.marker);
    assert.doesNotThrow(() => assertExpectedLiveSemantics(plan, item.expected_semantics), item.id);
  }
});

test("live case validation requires explicit read-only intent and enforces its bound", () => {
  assert.throws(() => validateLiveStressCases({ cases: [{ id: "unsafe", phrase: "open chat" }] }), /read_only=true/);
  assert.throws(() => validateLiveStressCases({ cases: [{
    id: "missing-semantics", phrase: "open heatmap", read_only: true
  }] }), /expected_semantics/);
  const many = Array.from({ length: 21 }, (_, index) => ({
    id: `case-${index}`, phrase: "open heatmap", read_only: true
  }));
  assert.throws(() => validateLiveStressCases({ cases: many }), /1-20/);
  assert.throws(() => assertLiveReadOnlyMarker(resetWorkspaceMarker()), /not in the safe window set/);
  assert.throws(() => assertLiveReadOnlyMarker(encodeWorkflowPlan({
    version: 2, failure_policy: "stop_on_any", layout: null,
    steps: [{ id: "move-last", kind: "control", operation: "move",
      target: { mode: "last", command: null, security: null }, value: "left", required: true }]
  })), /one exact proven command target/);
  assert.throws(() => assertLiveReadOnlyMarker(encodeWorkflowPlan({
    version: 2, failure_policy: "stop_on_any", layout: null,
    steps: [{ id: "unsafe-screen", kind: "control", operation: "reset_workspace",
      target: { mode: "command", command: "HMAP", security: null }, value: null, required: true }]
  })), /not in the safe window set/);
});

test("live case validation is idempotent and never turns an omitted timeout into one second", () => {
  const once = validateLiveStressCases(defaultCases);
  const twice = validateLiveStressCases({ cases: once });
  assert.equal(once[0].timeout_ms, null);
  assert.equal(twice[0].timeout_ms, null);
  assert.equal(twice.find(item => item.id === "tran-amazon-four-call-research").timeout_ms, 120_000);
});

test("live success requires every reported workflow and layout step to complete", () => {
  assert.equal(completedWithoutSkippedWork({
    status: "completed", steps: [{ kind: "command", status: "completed" }]
  }), true);
  assert.equal(completedWithoutSkippedWork({
    status: "completed", steps: [
      { kind: "command", status: "completed" },
      { kind: "control", operation: "layout", status: "skipped" }
    ]
  }), false);
  assert.equal(completedWithoutSkippedWork({ status: "completed", steps: [] }), false);
});

test("every attempted case queues verified cleanup even when compilation or execution fails", async () => {
  const safeMarker = (await compileNaturalRequest("open the S&P 500 market heatmap in table view", {
    context: null,
    compile: async () => { throw new Error("model unavailable"); }
  })).marker;
  const cleanupMarker = resetWorkspaceMarker();
  const expectedSemantics = normalizeLivePlanSemantics(assertLiveReadOnlyMarker(safeMarker));
  const queued = [];
  const cancelled = [];
  let caseWaits = 0;
  const handoff = {
    async queue(marker) {
      const cleanup = marker === cleanupMarker;
      queued.push(cleanup ? "cleanup" : "case");
      return `${cleanup ? "cleanup" : "case"}-${queued.length}`;
    },
    async waitForTerminal(id) {
      if (id.startsWith("cleanup")) return {
        status: { status: "completed", duration_ms: 12, phases: { reconcile_ms: 3 },
          steps: [{ kind: "control", operation: "resetworkspace", status: "completed", duration_ms: 8 }] }, elapsed_ms: 14
      };
      caseWaits += 1;
      if (caseWaits === 1) throw new WorkflowTimeoutError();
      return { status: { status: "completed", duration_ms: 20, phases: { layout_ms: 4 },
        steps: [{ kind: "command", command: "HMAP", status: "completed", duration_ms: 15 }] }, elapsed_ms: 22 };
    },
    async cancel(id) { cancelled.push(id); }
  };
  let compilations = 0;
  const report = await runLiveGodelStress({
    cases: [
      { id: "compile-failure", phrase: "first private phrase", read_only: true, expected_semantics: expectedSemantics },
      { id: "execution-timeout", phrase: "second private phrase", read_only: true, expected_semantics: expectedSemantics },
      { id: "successful-case", phrase: "third private phrase", read_only: true, expected_semantics: expectedSemantics }
    ],
    handoff,
    compilePhrase: async () => {
      compilations += 1;
      if (compilations === 1) throw new Error("compiler failed");
      return { kind: "execute", route: "local", marker: safeMarker };
    },
    timeoutMs: 1_000,
    cleanupTimeoutMs: 1_000
  });

  assert.deepEqual(queued, ["cleanup", "cleanup", "case", "cleanup", "case", "cleanup"]);
  assert.equal(cancelled.length, 1);
  assert.equal(report.cases.length, 3);
  assert.ok(report.cases.every(item => item.cleanup.status === "completed"));
  assert.equal(report.passed, false);
  assert.doesNotMatch(JSON.stringify(report), /private phrase|compiler failed/);
});

test("a safe but semantically wrong compilation fails before the case is queued", async () => {
  const correct = await compileNaturalRequest("open the S&P 500 market heatmap in table view", { context: null });
  const wrong = await compileNaturalRequest("open the market heatmap", { context: null });
  const expectedSemantics = normalizeLivePlanSemantics(assertLiveReadOnlyMarker(correct.marker));
  const cleanupMarker = resetWorkspaceMarker();
  const queued = [];
  const handoff = {
    async queue(marker) {
      queued.push(marker === cleanupMarker ? "cleanup" : "case");
      return `workflow-${queued.length}`;
    },
    async waitForTerminal() {
      return { status: { status: "completed", duration_ms: 1, phases: {},
        steps: [{ kind: "control", operation: "resetworkspace", status: "completed" }] }, elapsed_ms: 1 };
    },
    async cancel() {}
  };
  const report = await runLiveGodelStress({
    cases: [{ id: "wrong-safe-plan", phrase: "private phrase", read_only: true, expected_semantics: expectedSemantics }],
    handoff,
    compilePhrase: async () => wrong,
    timeoutMs: 1_000,
    cleanupTimeoutMs: 1_000
  });
  assert.deepEqual(queued, ["cleanup", "cleanup"]);
  assert.equal(report.cases[0].failure_stage, "compile_semantics");
  assert.equal(report.cases[0].workflow, null);
  assert.equal(report.passed, false);
});

test("a failed cleanup fails closed and prevents additional live cases", async () => {
  const marker = (await compileNaturalRequest("open the S&P 500 market heatmap in table view", {
    context: null,
    compile: async () => { throw new Error("model unavailable"); }
  })).marker;
  const expectedSemantics = normalizeLivePlanSemantics(assertLiveReadOnlyMarker(marker));
  let cleanupRuns = 0;
  const handoff = {
    async queue(candidate) { return candidate === resetWorkspaceMarker() ? `cleanup-${++cleanupRuns}` : "case"; },
    async waitForTerminal(id) {
      if (id === "cleanup-1") return { status: { status: "completed", duration_ms: 1, phases: {},
        steps: [{ kind: "control", status: "completed" }] }, elapsed_ms: 1 };
      if (id === "cleanup-2") return { status: { status: "failed", duration_ms: 1, phases: {},
        steps: [{ kind: "control", status: "failed" }] }, elapsed_ms: 1 };
      return { status: { status: "completed", duration_ms: 1, phases: {},
        steps: [{ kind: "command", status: "completed" }] }, elapsed_ms: 1 };
    },
    async cancel() {}
  };
  const report = await runLiveGodelStress({
    cases: [
      { id: "one", phrase: "one", read_only: true, expected_semantics: expectedSemantics },
      { id: "two", phrase: "two", read_only: true, expected_semantics: expectedSemantics }
    ],
    handoff,
    compilePhrase: async () => ({ kind: "execute", route: "local", marker }),
    timeoutMs: 1_000,
    cleanupTimeoutMs: 1_000
  });
  assert.equal(report.cases.length, 1);
  assert.equal(report.cases[0].cleanup.status, "failed");
  assert.equal(report.passed, false);
});

test("local handoff client authenticates queue requests and polls to terminal status", async () => {
  const calls = [];
  let now = 0;
  let statusCalls = 0;
  const response = (status, value) => ({
    status,
    ok: status >= 200 && status < 300,
    text: async () => value == null ? "" : JSON.stringify(value)
  });
  const client = new LocalHandoffClient({
    secret: "test-secret",
    clock: () => now,
    sleep: async ms => { now += ms; },
    pollMs: 25,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/plan")) return response(202, { id: "workflow-1" });
      statusCalls += 1;
      return response(200, statusCalls === 1
        ? { status: "queued" }
        : { status: "completed", duration_ms: 9, phases: { layout_ms: 2 } });
    }
  });
  const id = await client.queue("GV2:{}", "request-1");
  const terminal = await client.waitForTerminal(id, 1_000);
  assert.equal(terminal.status.status, "completed");
  assert.equal(calls[0].options.headers.Authorization, "Bearer test-secret");
  assert.equal(calls[0].options.headers["X-Godel-Request-Id"], "request-1");
});
