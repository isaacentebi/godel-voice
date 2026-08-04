import assert from "node:assert/strict";
import test from "node:test";
import { buildSafeEvaluationReport, safeFailureCategory, safeLatencySummary } from "../src/run-safe-model-evals.mjs";

test("safe report contains scores and latency but no prompt-shaped or credential fields", () => {
  const route = { id: "cerebras-test", model: "openai/gpt-oss-120b", provider_only: ["cerebras"], allow_fallbacks: false };
  const report = buildSafeEvaluationReport({
    routes: [route],
    configuration: { repeat: 1, concurrency: 1, request_timeout_ms: 1600, request_retries: 0 },
    generatedAt: "2026-08-04T00:00:00.000Z",
    runs: [{
      route_id: route.id, case_id: "case-1", repeat: 1,
      semantic_success: true, exact_plan_valid: true, available: true, well_formed: true,
      model: route.model, provider: "cerebras", provider_latency_ms: 500, total_latency_ms: 540,
      retry_count: 0, failure_category: null,
      utterance: "secret transcript", prompt: "secret prompt", api_key: "sk-or-v1-secret"
    }]
  });
  const serialized = JSON.stringify(report);
  assert.equal(report.reports[0].exact_plan_validity.accuracy, 1);
  assert.equal(report.reports[0].provider_latency_ms.p50, 500);
  assert.equal(report.reports[0].total_latency_ms.p50, 540);
  assert.equal(report.reports[0].route.provider_pin_ok, true);
  assert.doesNotMatch(serialized, /secret transcript|secret prompt|sk-or|"utterance"|"prompt"|"api_key"/i);
});

test("safe report distinguishes semantic success from exact executable-plan validity", () => {
  const route = { id: "route", model: "model", provider_only: ["groq"], allow_fallbacks: false };
  const report = buildSafeEvaluationReport({
    routes: [route],
    configuration: { repeat: 1, concurrency: 1, request_timeout_ms: 3200, request_retries: 0 },
    runs: [{ route_id: "route", case_id: "case", repeat: 1, semantic_success: true, exact_plan_valid: false, available: true, well_formed: true, model: "model", provider: "groq", provider_latency_ms: 1200, total_latency_ms: 1300 }]
  });
  assert.equal(report.reports[0].semantic_success.accuracy, 1);
  assert.equal(report.reports[0].exact_plan_validity.accuracy, 0);
});

test("safe helpers aggregate tails and expose only coarse failure categories", () => {
  assert.deepEqual(safeLatencySummary([100, 200, 300, 400]), { count: 4, p50: 200, p90: 400, p95: 400, max: 400 });
  assert.equal(safeFailureCategory(new DOMException("sk-or-v1-do-not-log", "TimeoutError")), "timeout");
  assert.equal(safeFailureCategory(new Error("Provider error 429: secret body")), "provider_availability");
  assert.equal(safeFailureCategory(new Error("Unexpected token in JSON")), "malformed_response");
});

test("provider pinning accepts an explicit gateway display-name alias", () => {
  const route = {
    id: "gemini", model: "google/gemini-3.6-flash",
    provider_only: ["google-vertex/global"], observed_provider_names: ["Google"],
    allow_fallbacks: false
  };
  const report = buildSafeEvaluationReport({
    routes: [route],
    configuration: { repeat: 1, concurrency: 1, request_timeout_ms: 6000, request_retries: 0 },
    runs: [{ route_id: "gemini", case_id: "case", repeat: 1, semantic_success: true,
      exact_plan_valid: true, available: true, well_formed: true,
      model: route.model, provider: "Google", provider_latency_ms: 900, total_latency_ms: 910 }]
  });
  assert.equal(report.reports[0].route.provider_pin_ok, true);
});
