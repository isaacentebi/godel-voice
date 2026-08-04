import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileVoiceRequest, compileVoiceWorkflow } from "./compiler.mjs";
import { gradeResult, readJson, validateCases, validateRoute } from "./model-eval-harness.mjs";

const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const FAILURE_CATEGORIES = new Set(["timeout", "provider_availability", "malformed_response", "local_plan_validation", "validation_or_configuration"]);

function finiteInteger(value, fallback, minimum = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.trunc(parsed)) : fallback;
}

function safeLabel(value, field) {
  const text = String(value ?? "");
  if (!SAFE_LABEL.test(text)) throw new Error(`Unsafe ${field}`);
  return text;
}

function quantile(sorted, fraction) {
  if (!sorted.length) return null;
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

export function safeLatencySummary(values) {
  const sorted = values.filter(Number.isFinite).map(Number).sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
    p95: quantile(sorted, 0.95),
    max: sorted.at(-1) ?? null
  };
}

export function safeFailureCategory(error) {
  const name = String(error?.name ?? "");
  const message = String(error?.message ?? error ?? "");
  if (/Timeout|Abort/i.test(name) || /timeout|timed out|ETIMEDOUT/i.test(message)) return "timeout";
  if (/Provider error|fetch failed|ECONN|rate.?limit|\b(?:408|425|429|5\d\d)\b/i.test(message)) return "provider_availability";
  if (/JSON|no message content|response payload|workflow kind|workflow steps/i.test(message)) return "malformed_response";
  if (/plan|unsupported action|unknown UI feature|workflow step/i.test(message)) return "local_plan_validation";
  return "validation_or_configuration";
}

function passRate(values) {
  const applicable = values.filter(value => typeof value === "boolean");
  const passed = applicable.filter(Boolean).length;
  return { passed, total: applicable.length, accuracy: applicable.length ? passed / applicable.length : null };
}

function providerPinOk(route, runs) {
  const pins = (route.provider_only ?? []).map(value => String(value).toLowerCase());
  if (!pins.length) return null;
  const observedAliases = (route.observed_provider_names ?? []).map(value => String(value).toLowerCase());
  const accepted = new Set([...pins, ...observedAliases]);
  const observed = runs.map(run => run.provider).filter(Boolean).map(value => String(value).toLowerCase());
  return observed.length > 0 && observed.every(provider => accepted.has(provider));
}

function safeFailureValue(value) {
  return value == null ? null : (FAILURE_CATEGORIES.has(value) ? value : "validation_or_configuration");
}

export function buildSafeEvaluationReport({ routes, runs, configuration, generatedAt = new Date().toISOString() }) {
  const routeReports = routes.map(route => {
    const routeRuns = runs.filter(run => run.route_id === route.id);
    const providers = [...new Set(routeRuns.map(run => run.provider).filter(Boolean))].sort();
    return {
      route: {
        id: safeLabel(route.id, "route id"),
        model: safeLabel(route.model, "model"),
        provider_only: (route.provider_only ?? []).map(value => safeLabel(value, "provider")),
        allow_fallbacks: route.allow_fallbacks === true,
        observed_providers: providers.map(value => safeLabel(value, "observed provider")),
        provider_pin_ok: providerPinOk(route, routeRuns)
      },
      runs: routeRuns.length,
      semantic_success: passRate(routeRuns.map(run => run.semantic_success)),
      exact_plan_validity: passRate(routeRuns.map(run => run.exact_plan_valid)),
      availability: passRate(routeRuns.map(run => run.available)),
      well_formed: passRate(routeRuns.map(run => run.well_formed)),
      provider_latency_ms: safeLatencySummary(routeRuns.map(run => run.provider_latency_ms)),
      total_latency_ms: safeLatencySummary(routeRuns.map(run => run.total_latency_ms)),
      results: routeRuns.map(run => ({
        case_id: safeLabel(run.case_id, "case id"),
        repeat: run.repeat,
        semantic_success: run.semantic_success,
        exact_plan_valid: run.exact_plan_valid,
        available: run.available,
        well_formed: run.well_formed,
        model: run.model ? safeLabel(run.model, "observed model") : null,
        provider: run.provider ? safeLabel(run.provider, "observed provider") : null,
        provider_latency_ms: Number.isFinite(run.provider_latency_ms) ? run.provider_latency_ms : null,
        total_latency_ms: Number.isFinite(run.total_latency_ms) ? run.total_latency_ms : null,
        retry_count: finiteInteger(run.retry_count, 0),
        failure_category: safeFailureValue(run.failure_category)
      }))
    };
  });
  return {
    schema_version: 1,
    privacy: {
      contains_transcripts: false,
      contains_prompts: false,
      contains_raw_responses: false,
      contains_credentials_or_headers: false
    },
    generated_at: generatedAt,
    configuration: {
      repeat: configuration.repeat,
      concurrency: configuration.concurrency,
      request_timeout_ms: configuration.request_timeout_ms,
      request_retries: configuration.request_retries
    },
    reports: routeReports
  };
}

function parseArgs(argv) {
  const output = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error("Unexpected positional argument");
    const key = token.slice(2).replaceAll("-", "_");
    output[key] = argv[++index];
  }
  return output;
}

async function mapConcurrent(items, concurrency, callback) {
  const output = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await callback(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, worker));
  return output;
}

function liveRunner(route, configuration, env = process.env) {
  validateRoute(route);
  const apiKeyName = route.api_key_env ?? "VOICE_LLM_API_KEY";
  const apiKey = env[apiKeyName];
  if (!apiKey) throw new Error("Missing configured evaluation credential");
  const options = {
    baseUrl: route.base_url,
    apiKey,
    model: route.model,
    providerOnly: route.provider_only.join(","),
    allowFallbacks: false,
    requireParameters: route.require_parameters ?? true,
    responseMode: route.response_format ?? "json_schema",
    reasoningEffort: route.reasoning_effort,
    maxTokens: route.max_tokens,
    temperature: route.temperature,
    timeoutMs: configuration.request_timeout_ms,
    retries: configuration.request_retries,
    retryBaseMs: configuration.retry_base_ms
  };
  return testCase => testCase.mode === "workflow"
    ? compileVoiceWorkflow(testCase.utterance, { ...options, resolvedEntities: testCase.resolved_entities ?? [], context: testCase.context ?? null })
    : compileVoiceRequest(testCase.utterance, { ...options, resolvedEntities: testCase.resolved_entities ?? [], context: testCase.context ?? null });
}

async function evaluateRoute(route, cases, configuration) {
  const run = liveRunner(route, configuration);
  const jobs = cases.flatMap(testCase => Array.from({ length: configuration.repeat }, (_, repeat) => ({ testCase, repeat: repeat + 1 })));
  return mapConcurrent(jobs, configuration.concurrency, async ({ testCase, repeat }) => {
    const startedAt = performance.now();
    try {
      const result = await run(testCase);
      const totalLatencyMs = Math.round(performance.now() - startedAt);
      const grade = gradeResult(testCase, result);
      const expectsPlan = testCase.mode === "workflow" && testCase.expected.kind === "execute";
      return {
        route_id: route.id,
        case_id: testCase.id,
        repeat,
        semantic_success: grade.overall,
        exact_plan_valid: expectsPlan ? grade.overall && grade.executable?.pass === true : null,
        available: grade.availability?.pass === true,
        well_formed: grade.malformed?.pass === true,
        model: result.inference?.model ?? route.model,
        provider: result.inference?.provider ?? null,
        provider_latency_ms: result.inference?.provider_latency_ms ?? result.inference?.latency_ms ?? null,
        total_latency_ms: totalLatencyMs,
        retry_count: result.inference?.retry_count ?? 0,
        failure_category: expectsPlan && !result.plan ? "local_plan_validation" : null
      };
    } catch (error) {
      const totalLatencyMs = Math.round(performance.now() - startedAt);
      return {
        route_id: route.id,
        case_id: testCase.id,
        repeat,
        semantic_success: false,
        exact_plan_valid: testCase.mode === "workflow" && testCase.expected.kind === "execute" ? false : null,
        available: safeFailureCategory(error) !== "provider_availability" && safeFailureCategory(error) !== "timeout",
        well_formed: false,
        model: route.model,
        provider: null,
        provider_latency_ms: error.inference?.provider_latency_ms ?? null,
        total_latency_ms: totalLatencyMs,
        retry_count: error.inference?.retry_count ?? 0,
        failure_category: safeFailureCategory(error)
      };
    }
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const casesFile = path.resolve(process.cwd(), args.cases ?? "evals/data/jarvis-eval-cases-v1.json");
  const routesFile = path.resolve(process.cwd(), args.routes ?? "evals/data/jarvis-eval-routes.example.json");
  const cases = validateCases(readJson(casesFile));
  let routes = readJson(routesFile);
  const routeIds = new Set(String(args.route ?? "").split(",").filter(Boolean));
  if (routeIds.size) routes = routes.filter(route => routeIds.has(route.id));
  if (!routes.length) throw new Error("No evaluation routes selected");
  for (const route of routes) validateRoute(route);
  const configuration = {
    repeat: finiteInteger(args.repeat, 1, 1),
    concurrency: finiteInteger(args.concurrency, 1, 1),
    request_timeout_ms: finiteInteger(args.request_timeout_ms, 8_000, 1),
    request_retries: finiteInteger(args.request_retries, 0),
    retry_base_ms: finiteInteger(args.retry_base_ms, 80)
  };
  const selectedIds = new Set(String(args.ids ?? "").split(",").filter(Boolean));
  const selectedCases = selectedIds.size ? cases.filter(testCase => selectedIds.has(testCase.id)) : cases;
  if (!selectedCases.length) throw new Error("No evaluation cases selected");
  const runs = [];
  for (const route of routes) {
    process.stderr.write(`Evaluating ${safeLabel(route.id, "route id")}: ${selectedCases.length} cases x ${configuration.repeat}\n`);
    runs.push(...await evaluateRoute(route, selectedCases, configuration));
  }
  const report = buildSafeEvaluationReport({ routes, runs, configuration });
  const output = path.resolve(process.cwd(), args.output ?? `reports/safe-model-eval-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(output, 0o600);
  process.stdout.write(`${JSON.stringify({
    report_written: true,
    reports: report.reports.map(item => ({
      route: item.route,
      semantic_success: item.semantic_success,
      exact_plan_validity: item.exact_plan_validity,
      provider_latency_ms: item.provider_latency_ms,
      total_latency_ms: item.total_latency_ms
    }))
  }, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`${JSON.stringify({ error: safeFailureCategory(error) })}\n`);
    process.exitCode = 1;
  });
}
