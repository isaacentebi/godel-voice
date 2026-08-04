import fs from "node:fs";
import { compileVoiceRequest, compileVoiceWorkflow } from "./compiler.mjs";

const SECRET_KEY = /(api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|bearer|secret|password|credential)/i;
const SECRET_VALUE = /\b(?:sk|or)-[a-z0-9_-]{12,}\b/gi;

export function redact(value, key = "") {
  if (SECRET_KEY.test(key)) return "[REDACTED]";
  if (typeof value === "string") return value.replace(SECRET_VALUE, "[REDACTED]");
  if (Array.isArray(value)) return value.map(item => redact(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redact(child, childKey)]));
  }
  return value;
}

function quantile(sorted, percentile) {
  if (!sorted.length) return null;
  const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1);
  return sorted[index];
}

export function latencySummary(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
    p95: quantile(sorted, 0.95),
    max: sorted.length ? sorted.at(-1) : null
  };
}

function canonicalAction(action) {
  return `${String(action?.feature ?? "").trim().toLowerCase()}\u0000${String(action?.operation ?? "").trim().toLowerCase()}\u0000${String(action?.value ?? "").trim().toLowerCase()}`;
}

function stepKind(step) {
  return step?.step_kind ?? (step?.control_operation ? "control" : step?.configure_target ? "configure" : "command");
}

function canonicalTarget(target) {
  return `${String(target?.mode ?? "").trim().toLowerCase()}\u0000${String(target?.command ?? "").trim().toUpperCase()}\u0000${String(target?.security ?? "").trim().toUpperCase()}`;
}

function canonicalValue(value) {
  if (typeof value === "string") return value.trim().toLowerCase();
  return value ?? null;
}

function expectedActions(step) {
  return step?.actions ?? step?.post_open_actions ?? [];
}

function actualActions(step) {
  return step?.post_open_actions ?? step?.actions ?? [];
}

function actualEnvelope(result, mode) {
  if (mode === "workflow") {
    const workflow = result?.workflow;
    return { kind: workflow?.kind, steps: workflow?.steps ?? [], layout: workflow?.layout ?? null, clarification: workflow?.clarification ?? null, execution: result?.execution ?? null };
  }
  const intent = result?.intent;
  return { kind: intent?.kind, steps: intent ? [intent] : [], layout: null, clarification: intent?.clarification ?? null, execution: result?.execution ?? null };
}

function metric(applicable, pass) {
  return { applicable, pass: applicable ? Boolean(pass) : null };
}

export function gradeResult(testCase, result, error = null) {
  const expected = testCase.expected;
  const strict = Number(testCase.schema_version ?? 1) >= 2 || testCase.scoring?.strict_steps === true;
  if (error) {
    const providerFailure = /(?:Provider error|fetch failed|ECONN|ETIMEDOUT|rate.?limit)/i.test(String(error.message ?? error));
    return {
      availability: metric(true, !providerFailure), malformed: metric(!providerFailure, false), command: metric(expected.steps?.some(step => stepKind(step) === "command"), false),
      workflow: metric(testCase.mode === "workflow", false), executable: metric(testCase.mode === "workflow" && expected.kind === "execute", false), action: metric(Boolean(expected.steps?.some(step => step.actions?.length)), false),
      entity: metric(Boolean(expected.steps?.some(step => step.ticker)), false), clarification: metric(expected.kind === "clarify", false),
      step: metric(strict && Boolean(expected.steps?.length), false), control: metric(strict && Boolean(expected.steps?.some(step => stepKind(step) === "control")), false),
      configure: metric(strict && Boolean(expected.steps?.some(step => stepKind(step) === "configure")), false),
      query: metric(strict && Boolean(expected.steps?.some(step => step.query != null)), false), argument: metric(strict && Boolean(expected.steps?.some(step => step.arguments?.length)), false),
      runtime: { expected: Boolean(expected.runtime), observed: false, pass: null }, overall: false, error: redact(String(error.message ?? error))
    };
  }
  const actual = actualEnvelope(result, testCase.mode);
  const wellFormed = ["execute", "clarify", "unsupported"].includes(actual.kind) && Array.isArray(actual.steps);
  const expectedSteps = expected.steps ?? [];
  const actualSteps = actual.steps ?? [];
  const kindOk = actual.kind === expected.kind;
  const expectedCommandSteps = expectedSteps.filter(step => stepKind(step) === "command");
  const actualCommandSteps = actualSteps.filter(step => stepKind(step) === "command");
  const commandsApplicable = expectedCommandSteps.length > 0;
  const commandsOk = commandsApplicable && (strict
    ? actualCommandSteps.length === expectedCommandSteps.length && expectedCommandSteps.every((step, index) => actualCommandSteps[index]?.command === step.command)
    : actualSteps.length === expectedSteps.length && expectedSteps.every((step, index) => actualSteps[index]?.command === step.command));
  const actionApplicable = expectedSteps.some(step => expectedActions(step).length);
  const actionOk = actionApplicable && expectedSteps.every((step, index) => {
    const wanted = new Set(expectedActions(step).map(canonicalAction));
    const received = new Set(actualActions(actualSteps[index]).map(canonicalAction));
    return [...wanted].every(action => received.has(action)) && (testCase.scoring?.actions === "exact" ? wanted.size === received.size : true);
  });
  const entityApplicable = expectedSteps.some(step => step.ticker);
  const entityOk = entityApplicable && expectedSteps.every((step, index) => !step.ticker || actualSteps[index]?.security?.ticker === step.ticker);
  const workflowApplicable = testCase.mode === "workflow";
  const layoutOk = !expected.layout || Object.entries(expected.layout).every(([key, value]) => {
    // A fresh screen has no pre-existing panels; preserve_existing cannot change
    // the observable result and either boolean is semantically equivalent.
    if (key === "preserve_existing" && (expected.layout.new_screen === true || actual.layout?.new_screen === true)) return true;
    return actual.layout?.[key] === value;
  });
  const workflowOk = workflowApplicable && kindOk && actualSteps.length === expectedSteps.length && expectedSteps.every((step, index) => {
    const actualStep = actualSteps[index];
    return stepKind(actualStep) === stepKind(step) &&
      (stepKind(step) !== "command" || actualStep?.command === step.command) &&
      (step.required === undefined || actualStep.required === step.required) &&
      (step.placement === undefined || actualStep.placement === step.placement);
  }) && layoutOk;
  const clarificationApplicable = expected.kind === "clarify";
  const clarificationOk = clarificationApplicable && kindOk && (!expected.clarification_contains?.length || expected.clarification_contains.some(word => String(actual.clarification ?? "").toLowerCase().includes(word.toLowerCase())));

  const strictStepApplicable = strict && expectedSteps.length > 0;
  const strictStepOk = strictStepApplicable && actualSteps.length === expectedSteps.length && expectedSteps.every((step, index) => {
    const actualStep = actualSteps[index];
    if (stepKind(actualStep) !== stepKind(step)) return false;
    if (stepKind(step) === "control") {
      return actualStep?.control_operation === step.control_operation &&
        canonicalTarget(actualStep?.control_target) === canonicalTarget(step.control_target) &&
        canonicalValue(actualStep?.control_value) === canonicalValue(step.control_value) &&
        (step.required === undefined || actualStep.required === step.required);
    }
    if (stepKind(step) === "configure") {
      return canonicalTarget(actualStep?.configure_target) === canonicalTarget(step.configure_target) &&
        (step.required === undefined || actualStep.required === step.required) &&
        JSON.stringify(actualActions(actualStep).map(canonicalAction).sort()) === JSON.stringify(expectedActions(step).map(canonicalAction).sort());
    }
    return actualStep?.command === step.command &&
      (step.ticker === undefined || actualStep?.security?.ticker === step.ticker) &&
      (step.query === undefined || actualStep?.query === step.query) &&
      (step.arguments === undefined || JSON.stringify(actualStep?.arguments ?? []) === JSON.stringify(step.arguments)) &&
      (step.required === undefined || actualStep?.required === step.required) &&
      (step.placement === undefined || actualStep?.placement === step.placement) &&
      (testCase.scoring?.actions !== "exact" || JSON.stringify(actualActions(actualStep).map(canonicalAction).sort()) === JSON.stringify(expectedActions(step).map(canonicalAction).sort()));
  });
  const controlApplicable = strict && expectedSteps.some(step => stepKind(step) === "control");
  const controlOk = controlApplicable && expectedSteps.filter(step => stepKind(step) === "control").every(expectedStep => actualSteps.some(actualStep =>
    stepKind(actualStep) === "control" && actualStep.control_operation === expectedStep.control_operation &&
    canonicalTarget(actualStep.control_target) === canonicalTarget(expectedStep.control_target) && canonicalValue(actualStep.control_value) === canonicalValue(expectedStep.control_value)
  ));
  const configureApplicable = strict && expectedSteps.some(step => stepKind(step) === "configure");
  const configureOk = configureApplicable && expectedSteps.filter(step => stepKind(step) === "configure").every(expectedStep => actualSteps.some(actualStep =>
    stepKind(actualStep) === "configure" && canonicalTarget(actualStep.configure_target) === canonicalTarget(expectedStep.configure_target) &&
    JSON.stringify(actualActions(actualStep).map(canonicalAction).sort()) === JSON.stringify(expectedActions(expectedStep).map(canonicalAction).sort())
  ));
  const queryApplicable = strict && expectedSteps.some(step => step.query !== undefined);
  const queryOk = queryApplicable && expectedSteps.every((step, index) => step.query === undefined || actualSteps[index]?.query === step.query);
  const argumentApplicable = strict && expectedSteps.some(step => step.arguments !== undefined);
  const argumentOk = argumentApplicable && expectedSteps.every((step, index) => step.arguments === undefined || JSON.stringify(actualSteps[index]?.arguments ?? []) === JSON.stringify(step.arguments));

  const expectedRuntime = expected.runtime ?? null;
  const actualRuntime = actual.execution;
  let runtimePass = null;
  if (expectedRuntime && actualRuntime) {
    const reasons = new Set(actualRuntime.reason_codes ?? []);
    const forbidden = new Set(actualRuntime.substitutions ?? []);
    runtimePass = (expectedRuntime.outcome === undefined || actualRuntime.outcome === expectedRuntime.outcome) &&
      (expectedRuntime.screen_action === undefined || actualRuntime.screen_action === expectedRuntime.screen_action) &&
      (expectedRuntime.reason_codes ?? []).every(reason => reasons.has(reason)) &&
      (expectedRuntime.must_not_substitute ?? []).every(value => !forbidden.has(value));
  }

  const scores = {
    availability: metric(true, true),
    malformed: metric(true, wellFormed),
    command: metric(commandsApplicable, commandsOk),
    workflow: metric(workflowApplicable, workflowOk),
    executable: metric(testCase.mode === "workflow" && expected.kind === "execute" && Object.hasOwn(result, "plan"), Boolean(result.plan)),
    action: metric(actionApplicable, actionOk),
    entity: metric(entityApplicable, entityOk),
    clarification: metric(clarificationApplicable, clarificationOk),
    step: metric(strictStepApplicable, strictStepOk),
    control: metric(controlApplicable, controlOk),
    configure: metric(configureApplicable, configureOk),
    query: metric(queryApplicable, queryOk),
    argument: metric(argumentApplicable, argumentOk)
  };
  const requiredMetrics = Object.entries(scores).filter(([name, score]) => name !== "executable" && score.applicable).map(([, score]) => score);
  return {
    ...scores,
    runtime: { expected: Boolean(expectedRuntime), observed: Boolean(actualRuntime), pass: runtimePass },
    overall: kindOk && requiredMetrics.every(score => score.pass),
    end_to_end_overall: expectedRuntime ? (actualRuntime ? kindOk && requiredMetrics.every(score => score.pass) && runtimePass : null) : null,
    actual: redact(actual), plan_error: result.plan_error ? redact(result.plan_error) : null
  };
}

function aggregateMetric(results, name) {
  const applicable = results.filter(item => item.grade[name]?.applicable);
  const passed = applicable.filter(item => item.grade[name].pass).length;
  return { passed, total: applicable.length, accuracy: applicable.length ? passed / applicable.length : null };
}

export function summarizeRuns(route, cases, results, config) {
  const latency = results.map(item => item.inference?.end_to_end_latency_ms ?? item.inference?.latency_ms);
  const providerLatency = results.map(item => item.inference?.latency_ms);
  const promptTokens = results.map(item => item.inference?.prompt_tokens).filter(Number.isFinite);
  const completionTokens = results.map(item => item.inference?.completion_tokens).filter(Number.isFinite);
  const costs = results.map(item => {
    if (Number.isFinite(item.inference?.cost)) return item.inference.cost;
    if (!route.pricing) return null;
    const prompt = Number(item.inference?.prompt_tokens ?? 0) * Number(route.pricing.prompt_per_million ?? 0) / 1_000_000;
    const completion = Number(item.inference?.completion_tokens ?? 0) * Number(route.pricing.completion_per_million ?? 0) / 1_000_000;
    return prompt + completion;
  }).filter(Number.isFinite);
  const providers = [...new Set(results.map(item => item.inference?.provider).filter(Boolean))].sort();
  const overallPassed = results.filter(item => item.grade.overall).length;
  const metricNames = ["availability", "command", "workflow", "executable", "action", "entity", "clarification", "malformed", "step", "control", "configure", "query", "argument"];
  return redact({
    route: {
      id: route.id, model: route.model, base_url: route.base_url,
      provider_only: route.provider_only ?? null, allow_fallbacks: route.allow_fallbacks ?? false,
      observed_providers: providers,
      provider_pin_ok: !route.provider_only?.length || providers.every(provider => route.provider_only.some(pinned => pinned.toLowerCase() === String(provider).toLowerCase()))
    },
    configuration: config,
    cases: cases.length,
    runs: results.length,
    overall: { passed: overallPassed, total: results.length, accuracy: results.length ? overallPassed / results.length : null },
    metrics: Object.fromEntries(metricNames.map(name => [name, aggregateMetric(results, name)])),
    tags: Object.fromEntries([...new Set(cases.flatMap(item => item.tags ?? []))].sort().map(tag => {
      const tagged = results.filter(item => item.tags.includes(tag));
      const passed = tagged.filter(item => item.grade.overall).length;
      return [tag, { passed, total: tagged.length, accuracy: tagged.length ? passed / tagged.length : null }];
    })),
    stability: (() => {
      const byCase = Map.groupBy(results, item => item.case_id);
      const unstable = [...byCase.entries()].filter(([, attempts]) => {
        const signatures = new Set(attempts.map(item => JSON.stringify({ overall: item.grade.overall, actual: item.grade.actual })));
        return signatures.size > 1;
      }).map(([caseId]) => caseId);
      return { stable_cases: byCase.size - unstable.length, total_cases: byCase.size, consistency: byCase.size ? (byCase.size - unstable.length) / byCase.size : null, unstable_cases: unstable };
    })(),
    runtime: (() => {
      const expected = results.filter(item => item.grade.runtime?.expected);
      const observed = expected.filter(item => item.grade.runtime.observed);
      const passed = observed.filter(item => item.grade.runtime.pass).length;
      return {
        expected: expected.length,
        observed: observed.length,
        coverage: expected.length ? observed.length / expected.length : null,
        passed,
        accuracy: observed.length ? passed / observed.length : null
      };
    })(),
    latency_ms: latencySummary(latency),
    provider_latency_ms: latencySummary(providerLatency),
    usage: {
      prompt_tokens: { total: promptTokens.reduce((sum, value) => sum + value, 0), average: promptTokens.length ? promptTokens.reduce((sum, value) => sum + value, 0) / promptTokens.length : null },
      completion_tokens: { total: completionTokens.reduce((sum, value) => sum + value, 0), average: completionTokens.length ? completionTokens.reduce((sum, value) => sum + value, 0) / completionTokens.length : null },
      cost: { total: costs.reduce((sum, value) => sum + value, 0), average: costs.length ? costs.reduce((sum, value) => sum + value, 0) / costs.length : null }
    },
    results
  });
}

export function validateRoute(route, { offline = false } = {}) {
  if (!route?.id || !route?.model || !route?.base_url) throw new Error("Each route requires id, model and base_url");
  if (route.base_url.includes("openrouter.ai") && !offline) {
    if (!Array.isArray(route.provider_only) || !route.provider_only.length) throw new Error(`OpenRouter route ${route.id} must pin provider_only`);
    if (route.allow_fallbacks !== false) throw new Error(`OpenRouter route ${route.id} must set allow_fallbacks=false for trustworthy benchmarks`);
  }
  return route;
}

export function validateCases(cases) {
  if (!Array.isArray(cases) || !cases.length) throw new Error("Evaluation cases must be a non-empty array");
  const ids = new Set();
  for (const testCase of cases) {
    if (!testCase?.id || ids.has(testCase.id)) throw new Error(`Missing or duplicate case id: ${testCase?.id ?? "<missing>"}`);
    ids.add(testCase.id);
    if (!["intent", "workflow"].includes(testCase.mode)) throw new Error(`Invalid mode for ${testCase.id}`);
    if (!String(testCase.utterance ?? "").trim()) throw new Error(`Missing utterance for ${testCase.id}`);
    if (!["execute", "clarify", "unsupported"].includes(testCase.expected?.kind)) throw new Error(`Invalid expected kind for ${testCase.id}`);
    if (testCase.expected.kind === "execute" && !testCase.expected.steps?.length) throw new Error(`Executable case ${testCase.id} requires steps`);
    if (Number(testCase.schema_version ?? 1) >= 2) {
      for (const [index, step] of (testCase.expected.steps ?? []).entries()) {
        const kind = stepKind(step);
        if (!["command", "control", "configure"].includes(kind)) throw new Error(`Invalid expected step kind for ${testCase.id} step ${index + 1}`);
        if (kind === "command" && !String(step.command ?? "").trim()) throw new Error(`Missing expected command for ${testCase.id} step ${index + 1}`);
        if (kind === "control" && (!step.control_operation || !step.control_target?.mode)) throw new Error(`Invalid expected control for ${testCase.id} step ${index + 1}`);
        if (kind === "configure" && (!step.configure_target?.mode || !step.configure_target?.command || !expectedActions(step).length)) throw new Error(`Invalid expected configure step for ${testCase.id} step ${index + 1}`);
      }
      if (testCase.context != null && (typeof testCase.context !== "object" || Array.isArray(testCase.context))) throw new Error(`Invalid context for ${testCase.id}`);
    }
  }
  return cases;
}

export function createLiveRunner(route, env = process.env) {
  validateRoute(route);
  const apiKey = env[route.api_key_env ?? "VOICE_LLM_API_KEY"];
  if (!apiKey) throw new Error(`Missing API key environment variable ${route.api_key_env ?? "VOICE_LLM_API_KEY"}`);
  const options = {
    baseUrl: route.base_url,
    apiKey,
    model: route.model,
    providerOnly: route.provider_only?.join(","),
    allowFallbacks: route.allow_fallbacks,
    requireParameters: route.require_parameters ?? true,
    responseMode: route.response_format ?? "json_schema",
    reasoningEffort: route.reasoning_effort,
    maxTokens: route.max_tokens,
    temperature: route.temperature
  };
  return (testCase) => testCase.mode === "workflow"
    ? compileVoiceWorkflow(testCase.utterance, { ...options, resolvedEntities: testCase.resolved_entities ?? [], context: testCase.context ?? null })
    : compileVoiceRequest(testCase.utterance, { ...options, resolvedEntities: testCase.resolved_entities ?? [], context: testCase.context ?? null });
}

export function createFixtureRunner(fixtures) {
  return async testCase => {
    const fixture = fixtures[testCase.id];
    if (!fixture) throw new Error(`Missing fixture for ${testCase.id}`);
    if (fixture.error) throw new Error(fixture.error);
    return structuredClone(fixture);
  };
}

async function mapConcurrent(items, concurrency, callback) {
  const output = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await callback(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, worker));
  return output;
}

export async function runRouteEvaluation({ route, cases, runner, repeat = 1, warmup = 0, concurrency = 1, retries = 0, retryBaseMs = 1000 }) {
  validateRoute(route, { offline: route.offline === true });
  const safeRepeat = Math.max(1, Number(repeat));
  const safeWarmup = Math.max(0, Number(warmup));
  const safeConcurrency = Math.max(1, Number(concurrency));
  const safeRetries = Math.max(0, Number(retries));
  const safeRetryBaseMs = Math.max(0, Number(retryBaseMs));
  for (let index = 0; index < safeWarmup; index++) await runner(cases[index % cases.length], { warmup: true, index });
  const jobs = cases.flatMap(testCase => Array.from({ length: safeRepeat }, (_, repeatIndex) => ({ testCase, repeatIndex })));
  const results = await mapConcurrent(jobs, safeConcurrency, async ({ testCase, repeatIndex }) => {
    const started = performance.now();
    let lastError;
    for (let attempt = 0; attempt <= safeRetries; attempt++) {
      try {
        const result = await runner(testCase, { warmup: false, repeatIndex, attempt });
        const measuredEndToEnd = Math.round(performance.now() - started);
        const inference = { ...result?.inference, retry_count: attempt, end_to_end_latency_ms: route.offline && Number.isFinite(result?.inference?.latency_ms) ? result.inference.latency_ms : measuredEndToEnd };
        if (!Number.isFinite(inference.latency_ms)) inference.latency_ms = inference.end_to_end_latency_ms;
        return { case_id: testCase.id, repeat: repeatIndex + 1, tags: testCase.tags ?? [], grade: gradeResult(testCase, result), inference };
      } catch (error) {
        lastError = error;
        const transient = /(?:Provider error (?:429|502|503|504)|fetch failed|ECONN|ETIMEDOUT|rate.?limit)/i.test(String(error.message ?? error));
        if (!transient || attempt >= safeRetries) break;
        await new Promise(resolve => setTimeout(resolve, Math.min(8000, safeRetryBaseMs * (2 ** attempt))));
      }
    }
    return { case_id: testCase.id, repeat: repeatIndex + 1, tags: testCase.tags ?? [], grade: gradeResult(testCase, null, lastError), inference: { latency_ms: Math.round(performance.now() - started), end_to_end_latency_ms: Math.round(performance.now() - started), retry_count: safeRetries, provider: null, model: route.model } };
  });
  return summarizeRuns(route, cases, results, { repeat: safeRepeat, warmup: safeWarmup, concurrency: safeConcurrency, retries: safeRetries, retry_base_ms: safeRetryBaseMs });
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
