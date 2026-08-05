const DEFAULT_PRIMARY_TIMEOUT_MS = 1_300;
const DEFAULT_RECOVERY_TIMEOUT_MS = 900;
const DEFAULT_ROUTE_CEILING_MS = 2_300;
const MAX_PRIMARY_TIMEOUT_MS = 1_300;
const MAX_RECOVERY_TIMEOUT_MS = 900;
const MAX_ROUTE_CEILING_MS = 2_300;

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

function recoverablePrimaryFailure(error) {
  if (!error) return false;
  if (error.code === "MODEL_ROUTE_TIMEOUT" || error.name === "AbortError" || error.name === "TimeoutError" || error instanceof SyntaxError) {
    return true;
  }
  const message = String(error.message ?? error);
  const providerStatus = /Provider error\s+(\d{3})/i.exec(message);
  if (providerStatus) {
    const status = Number(providerStatus[1]);
    return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
  }
  return /fetch failed|ECONN|ETIMEDOUT|rate.?limit|returned no message content|invalid model (?:intent|workflow)|unexpected (?:end|token)|JSON/i.test(message);
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
  primaryModel = process.env.VOICE_LLM_MODEL || null,
  primaryProviderOnly = process.env.OPENROUTER_PROVIDER_ONLY || null,
  primaryTimeoutMs = process.env.VOICE_LLM_PRIMARY_TIMEOUT_MS,
  fallbackTimeoutMs = process.env.VOICE_LLM_FALLBACK_TIMEOUT_MS,
  routeCeilingMs = process.env.VOICE_LLM_ROUTE_CEILING_MS
} = {}) {
  if (typeof compile !== "function") throw new Error("A workflow compiler is required");
  const primaryBudget = Math.min(MAX_PRIMARY_TIMEOUT_MS, boundedInteger(primaryTimeoutMs, DEFAULT_PRIMARY_TIMEOUT_MS, 1));
  const recoveryBudget = Math.min(MAX_RECOVERY_TIMEOUT_MS, boundedInteger(fallbackTimeoutMs, DEFAULT_RECOVERY_TIMEOUT_MS, 1));
  const totalBudget = Math.min(MAX_ROUTE_CEILING_MS, boundedInteger(routeCeilingMs, DEFAULT_ROUTE_CEILING_MS, 1));
  const routeStartedAt = performance.now();
  const attempts = [];
  let primary = null;
  let primaryError = null;
  const primaryStartedAt = performance.now();
  const primaryRouteBudget = Math.min(primaryBudget, totalBudget);
  try {
    const timeoutMs = perAttemptTimeout(primaryRouteBudget, 0, 0);
    primary = await runWithinBudget(() => compile(transcript, {
      context, timeoutMs, retries: 0, retryBaseMs: 0
    }), "primary", primaryRouteBudget);
  } catch (error) {
    primaryError = error;
  }

  attempts.push(attemptDiagnostic("primary", primaryStartedAt, primaryRouteBudget, 0, primary, primaryError, {
    model: primaryModel,
    provider: primaryProviderOnly
  }));
  // A well-formed clarification, unsupported decision, or locally invalid
  // executable plan is terminal. A second model cannot change the local
  // allowlist and asking it to overrule an honest boundary adds latency and
  // hallucination risk.
  if (primary) return {
    result: primary, escalated: false, primary_error: primary.plan_error ?? null,
    routing: { total_latency_ms: Math.round(performance.now() - routeStartedAt), ceiling_ms: totalBudget, attempts }
  };
  primaryError ??= new Error("Primary model route returned no result");
  if (!recoverablePrimaryFailure(primaryError)) {
    primaryError.routing = { total_latency_ms: Math.round(performance.now() - routeStartedAt), ceiling_ms: totalBudget, attempts };
    throw primaryError;
  }

  // Retry only transport or malformed-response failures. Recovery deliberately
  // uses the same pinned primary route; the slower experimental fallback
  // models did not improve executable-plan validity in live evaluation.
  const recoveryModel = primaryModel || fallbackModel;
  const recoveryProviderOnly = primaryProviderOnly || fallbackProviderOnly;
  if (!recoveryModel) {
    primaryError.routing = { total_latency_ms: Math.round(performance.now() - routeStartedAt), ceiling_ms: totalBudget, attempts };
    throw primaryError;
  }

  const remainingMs = Math.max(0, totalBudget - Math.round(performance.now() - routeStartedAt));
  if (remainingMs < 1) {
    const error = timeoutError("overall", totalBudget);
    error.routing = { total_latency_ms: Math.round(performance.now() - routeStartedAt), ceiling_ms: totalBudget, attempts };
    throw error;
  }
  const effectiveFallbackBudget = Math.min(recoveryBudget, remainingMs);
  const fallbackRequestTimeout = perAttemptTimeout(effectiveFallbackBudget, 0, 0);
  const fallbackStartedAt = performance.now();
  let result = null;
  let fallbackError = null;
  try {
    result = await runWithinBudget(() => compile(transcript, {
      context,
      model: recoveryModel,
      timeoutMs: fallbackRequestTimeout,
      retries: 0,
      retryBaseMs: 0,
      ...(recoveryProviderOnly ? { providerOnly: recoveryProviderOnly } : {})
    }), "fallback", effectiveFallbackBudget);
  } catch (error) {
    fallbackError = error;
  }
  attempts.push(attemptDiagnostic("fallback", fallbackStartedAt, effectiveFallbackBudget, 0, result, fallbackError, {
    model: recoveryModel,
    provider: recoveryProviderOnly
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
