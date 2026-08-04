const DEFAULT_PRIMARY_TIMEOUT_MS = 1_600;
const DEFAULT_FALLBACK_TIMEOUT_MS = 3_200;
const DEFAULT_ROUTE_CEILING_MS = 5_000;

function boundedInteger(value, fallback, minimum = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.trunc(parsed)) : fallback;
}

function timeoutError(route, timeoutMs) {
  const error = new Error(`${route} model route exceeded its ${timeoutMs} ms budget`);
  error.name = "ModelRouteTimeoutError";
  error.code = "MODEL_ROUTE_TIMEOUT";
  error.inference = { latency_ms: timeoutMs, timeout_ms: timeoutMs, retry_count: 0 };
  return error;
}

async function runWithinBudget(run, route, timeoutMs) {
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve().then(run),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(timeoutError(route, timeoutMs)), timeoutMs);
        timer.unref?.();
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function safeErrorMessage(error) {
  if (!error) return null;
  return String(error.message ?? error)
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[redacted]")
    .slice(0, 240);
}

function perAttemptTimeout(routeBudgetMs, retries, retryBaseMs) {
  const attempts = retries + 1;
  let backoffMs = 0;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    backoffMs += Math.min(500, retryBaseMs * (2 ** attempt));
  }
  return Math.max(1, Math.floor(Math.max(1, routeBudgetMs - backoffMs) / attempts));
}

function attemptDiagnostic(route, startedAt, timeoutMs, retries, result, error, requested = {}) {
  const inference = result?.inference ?? error?.inference ?? {};
  return {
    route,
    status: error ? (error.code === "MODEL_ROUTE_TIMEOUT" || error.name === "AbortError" || error.name === "TimeoutError" ? "timeout" : "rejected") : "accepted",
    model: inference.model ?? null,
    provider: inference.provider ?? null,
    requested_model: requested.model ?? null,
    requested_provider: requested.provider ?? null,
    elapsed_ms: Math.round(performance.now() - startedAt),
    provider_latency_ms: inference.provider_latency_ms ?? null,
    timeout_ms: timeoutMs,
    retry_count: inference.retry_count ?? 0,
    max_attempts: retries + 1,
    error: safeErrorMessage(error)
  };
}

export async function compileWorkflowWithValidatedFallback(transcript, {
  compile,
  context = null,
  fallbackModel = null,
  fallbackProviderOnly = null,
  primaryTimeoutMs = process.env.VOICE_LLM_PRIMARY_TIMEOUT_MS,
  primaryRetries = process.env.VOICE_LLM_PRIMARY_RETRIES,
  primaryRetryBaseMs = process.env.VOICE_LLM_PRIMARY_RETRY_BASE_MS,
  fallbackTimeoutMs = process.env.VOICE_LLM_FALLBACK_TIMEOUT_MS,
  fallbackRetries = process.env.VOICE_LLM_FALLBACK_RETRIES,
  fallbackRetryBaseMs = process.env.VOICE_LLM_FALLBACK_RETRY_BASE_MS,
  routeCeilingMs = process.env.VOICE_LLM_ROUTE_CEILING_MS
} = {}) {
  if (typeof compile !== "function") throw new Error("A workflow compiler is required");
  const primaryBudget = boundedInteger(primaryTimeoutMs, DEFAULT_PRIMARY_TIMEOUT_MS, 1);
  const primaryRetryCount = boundedInteger(primaryRetries, 0);
  const primaryBackoff = boundedInteger(primaryRetryBaseMs, 80);
  const fallbackBudget = boundedInteger(fallbackTimeoutMs, DEFAULT_FALLBACK_TIMEOUT_MS, 1);
  const fallbackRetryCount = boundedInteger(fallbackRetries, 0);
  const fallbackBackoff = boundedInteger(fallbackRetryBaseMs, 80);
  const totalBudget = boundedInteger(routeCeilingMs, DEFAULT_ROUTE_CEILING_MS, 1);
  const routeStartedAt = performance.now();
  const attempts = [];
  let primary = null;
  let primaryError = null;
  const primaryStartedAt = performance.now();
  const primaryRouteBudget = Math.min(primaryBudget, totalBudget);
  try {
    const timeoutMs = perAttemptTimeout(primaryRouteBudget, primaryRetryCount, primaryBackoff);
    primary = await runWithinBudget(() => compile(transcript, {
      context, timeoutMs, retries: primaryRetryCount, retryBaseMs: primaryBackoff
    }), "primary", primaryRouteBudget);
  } catch (error) {
    primaryError = error;
  }

  const primaryAccepted = primary?.workflow?.kind !== "execute" || Boolean(primary?.plan);
  const primaryValidationError = primary && !primaryAccepted
    ? new Error(primary.plan_error || "Primary model produced no locally valid executable plan")
    : primaryError;
  attempts.push(attemptDiagnostic("primary", primaryStartedAt, primaryRouteBudget, primaryRetryCount, primary, primaryValidationError, {
    model: process.env.VOICE_LLM_MODEL || null,
    provider: process.env.OPENROUTER_PROVIDER_ONLY || null
  }));
  if (primary && primaryAccepted) return {
    result: primary, escalated: false, primary_error: null,
    routing: { total_latency_ms: Math.round(performance.now() - routeStartedAt), ceiling_ms: totalBudget, attempts }
  };
  if (!fallbackModel) {
    if (primaryError) throw primaryError;
    return {
      result: primary, escalated: false, primary_error: null,
      routing: { total_latency_ms: Math.round(performance.now() - routeStartedAt), ceiling_ms: totalBudget, attempts }
    };
  }

  const remainingMs = Math.max(0, totalBudget - Math.round(performance.now() - routeStartedAt));
  if (remainingMs < 1) {
    const error = timeoutError("overall", totalBudget);
    error.routing = { total_latency_ms: Math.round(performance.now() - routeStartedAt), ceiling_ms: totalBudget, attempts };
    throw error;
  }
  const effectiveFallbackBudget = Math.min(fallbackBudget, remainingMs);
  const fallbackRequestTimeout = perAttemptTimeout(effectiveFallbackBudget, fallbackRetryCount, fallbackBackoff);
  const fallbackStartedAt = performance.now();
  let result = null;
  let fallbackError = null;
  try {
    result = await runWithinBudget(() => compile(transcript, {
      context,
      model: fallbackModel,
      timeoutMs: fallbackRequestTimeout,
      retries: fallbackRetryCount,
      retryBaseMs: fallbackBackoff,
      ...(fallbackProviderOnly ? { providerOnly: fallbackProviderOnly } : {})
    }), "fallback", effectiveFallbackBudget);
  } catch (error) {
    fallbackError = error;
  }
  attempts.push(attemptDiagnostic("fallback", fallbackStartedAt, effectiveFallbackBudget, fallbackRetryCount, result, fallbackError, {
    model: fallbackModel,
    provider: fallbackProviderOnly
  }));
  if (fallbackError) {
    fallbackError.routing = { total_latency_ms: Math.round(performance.now() - routeStartedAt), ceiling_ms: totalBudget, attempts };
    throw fallbackError;
  }
  return {
    result,
    escalated: true,
    primary_error: safeErrorMessage(primaryError) ?? primary?.plan_error ?? null,
    routing: { total_latency_ms: Math.round(performance.now() - routeStartedAt), ceiling_ms: totalBudget, attempts }
  };
}
