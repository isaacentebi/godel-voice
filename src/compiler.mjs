import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { commandMaps, loadRegistry } from "./catalog.mjs";
import { intentSchema, systemPrompt, userPrompt, voiceWorkflowSchema, workflowSystemPrompt } from "./prompt.mjs";
import { buildWorkflowPlan } from "./automation-plan.mjs";
import { applyResolvedEntities, rejectUnverifiedModelTicker, resolveCommonSecurities, resolveTranscriptSecurities } from "./security-resolver.mjs";
import { EQS_UNBOUND_FEATURES, normalizeEQSLiveDynamicAction } from "./commands/eqs-actions.mjs";

const registry = loadRegistry();
const maps = commandMaps(registry);
const assetClassAliases = new Map([
  ["EQ", "EQ"],
  ["EQUITY", "EQ"],
  ["EQUITIES", "EQ"],
  ["STOCK", "EQ"],
  ["STOCKS", "EQ"]
]);
const multiSecurityPrimaryCommands = new Set(["HMS", "GR", "GF"]);

function normalizeToken(value) {
  return value == null ? null : String(value).trim().toUpperCase();
}

function normalizeAssetClass(value) {
  const normalized = normalizeToken(value);
  return normalized == null ? null : (assetClassAliases.get(normalized) ?? normalized);
}

function normalizedTranscript(transcript) {
  return String(transcript ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function genericEarningsRequest(normalized) {
  if (!/\bearnings?\b/.test(normalized)) return false;
  return !/\b(?:earnings? )?(?:matrix|estimates?|transcripts?|calls?|hub|history|historicals?|calendar|date|report|release|preview|results?)\b/.test(normalized);
}

function genericEarningsActionRequest(normalized) {
  return genericEarningsRequest(normalized)
    && /\b(?:open|show|pull up|bring up|display|launch|load|give me|put)\b/.test(normalized);
}

function alertMutationRequest(normalized) {
  const mutation = /\b(?:create|set|add|edit|change|delete|remove|cancel)\b(?: [a-z0-9]+){0,6} \balerts?\b/.test(` ${normalized}`);
  const explicitlyNegated = /\b(?:do not|don t|dont|without)\b(?: [a-z0-9]+){0,4} \b(?:create|set|add|edit|change|delete|remove|cancel)\b/.test(` ${normalized}`);
  return mutation && !explicitlyNegated;
}

function bindResolvedEntities(intent, resolvedEntities) {
  const commandCode = normalizeToken(intent.command);
  const multiSecurityPrimary = multiSecurityPrimaryCommands.has(commandCode);
  applyResolvedEntities(intent, resolvedEntities, {
    requireSecurity: maps.canonical.get(commandCode)?.scope === "security" || multiSecurityPrimary,
    primaryFromMultiple: multiSecurityPrimary
  });
}

export function applyDeterministicVoiceRepairs(intent, transcript) {
  const normalized = normalizedTranscript(transcript);
  if (alertMutationRequest(normalized)) {
    Object.assign(intent, {
      kind: "unsupported", command: null, security: null, query: null, arguments: [], post_open_actions: [],
      clarification: null,
      reason: "Creating or changing an alert requires an explicit confirmed interaction."
    });
    return intent;
  }
  const indexMapPhrase = /\b(?:index|s (?:and )?p(?: 500)?|sp ?500|dow|djia|nasdaq(?: 100)?|sector) (?:heat )?map\b/;
  const indexWheelPhrase = /\b(?:s (?:and )?p(?: 500)?|sp ?500|dow|djia|index) sector wheel\b/;
  const worldVenueMapPhrase = /\b(?:world (?:venue |exchange )?|global (?:venue |exchange )?|venue |exchange |market hours? |open markets? )map\b/;
  const asksForIndexMap = indexMapPhrase.test(normalized) || indexWheelPhrase.test(normalized);
  const asksForWorldVenueMap = worldVenueMapPhrase.test(normalized);
  const negatesWorldVenueMap = new RegExp(`\\bnot (?:the )?${worldVenueMapPhrase.source.replace(/^\\b/, "")}`).test(normalized);
  const negatesIndexMap = new RegExp(`\\bnot (?:the )?(?:${indexMapPhrase.source.replace(/^\\b/, "")}|${indexWheelPhrase.source.replace(/^\\b/, "")})`).test(normalized);
  if (asksForIndexMap && (!asksForWorldVenueMap || negatesWorldVenueMap) && !negatesIndexMap && normalizeToken(intent.command) === "MAP") {
    intent.command = "IMAP";
  }
  if (asksForWorldVenueMap && (!asksForIndexMap || negatesIndexMap) && !negatesWorldVenueMap && normalizeToken(intent.command) === "IMAP") {
    intent.command = "MAP";
  }
  if (normalizeToken(intent.command) === "IMAP") {
    const actions = Array.isArray(intent.post_open_actions) ? intent.post_open_actions : (intent.post_open_actions = []);
    const add = (feature, value) => {
      if (!actions.some(action => String(action.feature).toLowerCase() === feature)) {
        actions.push({ feature, operation: "select", value });
      }
    };
    if (/\b(?:dow|djia)\b/.test(normalized)) add("index", "DJIA");
    else if (/\bs ?p(?: 500)?\b/.test(normalized)) add("index", "S&P 500");
    if (/\btable(?: view)?\b/.test(normalized)) add("view", "Table");
    else if (/\bmap view\b|\bas (?:a )?map\b|\bmap not (?:the )?table\b/.test(normalized)) add("view", "Map");
  }
  if (/\bearnings? estimates?\b/.test(normalized) && !/\bearnings? matrix\b/.test(normalized) && normalizeToken(intent.command) === "EM") {
    intent.command = "ERN";
  }
  if (/\bearnings? matrix\b/.test(normalized) && normalizeToken(intent.command) === "ERN") {
    intent.command = "EM";
  }
  if (intent.kind === "execute" && genericEarningsRequest(normalized) && ["EM", "ERN", "TRAN"].includes(normalizeToken(intent.command))) {
    if (genericEarningsActionRequest(normalized)) {
      intent.command = "EM";
    } else {
      Object.assign(intent, {
        kind: "clarify", command: null, security: null, query: null, arguments: [], post_open_actions: [],
        clarification: "Do you mean the earnings matrix, analyst estimates, or earnings-call transcript?",
        reason: "The word earnings alone does not identify one Godel surface."
      });
      return intent;
    }
  }
  if (normalizeToken(intent.command) === "HALT" && /\bactive (?:market )?halts?\b/.test(normalized)) {
    const actions = Array.isArray(intent.post_open_actions) ? intent.post_open_actions : (intent.post_open_actions = []);
    if (!actions.some(action => String(action.feature).toLowerCase() === "tab")) {
      actions.push({ feature: "tab", operation: "select", value: "Active" });
    }
  }
  if (normalizeToken(intent.command) === "OMON" && /\bcalls?\b/.test(normalized)) {
    const actions = Array.isArray(intent.post_open_actions) ? intent.post_open_actions : (intent.post_open_actions = []);
    if (!actions.some(action => String(action.feature).toLowerCase() === "mode")) {
      actions.push({ feature: "mode", operation: "select", value: "Calls" });
    }
  }
  if (normalizeToken(intent.command) === "OMON" && /\bputs?\b/.test(normalized)) {
    const actions = Array.isArray(intent.post_open_actions) ? intent.post_open_actions : (intent.post_open_actions = []);
    if (!actions.some(action => String(action.feature).toLowerCase() === "mode")) {
      actions.push({ feature: "mode", operation: "select", value: "Puts" });
    }
  }
  if (normalizeToken(intent.command) === "HMAP" && /\btable(?: view)?\b/.test(normalized)) {
    const actions = Array.isArray(intent.post_open_actions) ? intent.post_open_actions : (intent.post_open_actions = []);
    if (!actions.some(action => String(action.feature).toLowerCase() === "view")) {
      actions.push({ feature: "view", operation: "select", value: "Table" });
    }
  }
  if (normalizeToken(intent.command) === "HDS") {
    const requestedView = /\bbubbles?\b/.test(normalized) ? "Bubble"
      : /\btreemap\b|\btree map\b/.test(normalized) ? "Treemap"
        : /\btable(?: view)?\b/.test(normalized) ? "Table" : null;
    if (requestedView) {
      const actions = Array.isArray(intent.post_open_actions) ? intent.post_open_actions : (intent.post_open_actions = []);
      intent.post_open_actions = actions.filter(action => !["view", "table", "treemap", "tree map", "bubble", "bubbles"]
        .includes(String(action.feature).trim().toLowerCase()));
      intent.post_open_actions.push({ feature: "view", operation: "select", value: requestedView });
    }
  }
  if (normalizeToken(intent.command) === "MOST") {
    const wantsDollarValue = /\b(?:by |rank(?:ed)? by )?(?:dollar value|dollar volume|value traded)\b/.test(normalized);
    const wantsVolume = /\b(?:by |rank(?:ed)? by )?(?:share )?volume\b/.test(normalized) && !wantsDollarValue;
    if (wantsDollarValue || wantsVolume) {
      const actions = Array.isArray(intent.post_open_actions) ? intent.post_open_actions : (intent.post_open_actions = []);
      const withoutRanking = actions.filter(action => String(action.feature).trim().toLowerCase() !== "ranking");
      withoutRanking.push({ feature: "ranking", operation: "select", value: wantsDollarValue ? "Value" : "Active" });
      intent.post_open_actions = withoutRanking;
    }
  }
  return intent;
}

export function applyDeterministicWorkflowRepairs(workflow, transcript, context = null) {
  if (!workflow) return workflow;
  const normalized = normalizedTranscript(transcript);
  if (/\b(?:clear|reset) (?:those|the) filters\b/.test(normalized)
      && !context?.focused_panel?.command && !context?.last_panel?.command) {
    Object.assign(workflow, {
      kind: "clarify", steps: [],
      clarification: "Which filters window do you want me to clear?",
      reason: "The request has no recent addressed Godel panel."
    });
  } else if (alertMutationRequest(normalized)) {
    Object.assign(workflow, {
      kind: "unsupported", steps: [], clarification: null,
      reason: "Creating or changing an alert requires an explicit confirmed interaction."
    });
  } else if (workflow.kind === "execute" && genericEarningsRequest(normalized) && workflow.steps?.some(step => ["EM", "ERN", "TRAN"].includes(normalizeToken(step.command)))) {
    if (genericEarningsActionRequest(normalized)) {
      workflow.steps = workflow.steps.map(step => ["EM", "ERN", "TRAN"].includes(normalizeToken(step.command))
        ? { ...step, command: "EM" } : step);
    } else {
      Object.assign(workflow, {
        kind: "clarify", steps: [],
        clarification: "Do you mean the earnings matrix, analyst estimates, or earnings-call transcript?",
        reason: "The word earnings alone does not identify one Godel surface."
      });
    }
  }
  return workflow;
}

export function validateIntent(intent) {
  resolveCommonSecurities(intent);
  const errors = [];
  if (!["execute", "clarify", "unsupported"].includes(intent?.kind)) errors.push("invalid kind");
  if (typeof intent?.confidence !== "number" || intent.confidence < 0 || intent.confidence > 1) errors.push("invalid confidence");

  if (intent?.kind === "execute") {
    const requested = normalizeToken(intent.command);
    const canonicalCode = maps.accepted.get(requested);
    if (!canonicalCode) errors.push(`unknown command: ${requested}`);
    const command = canonicalCode ? maps.canonical.get(canonicalCode) : null;
    if (command && requested !== canonicalCode) intent.command = canonicalCode;

    const args = Array.isArray(intent.arguments) ? intent.arguments : [];
    const allowedArgs = new Set(command?.arguments ?? []);
    for (const argument of args) {
      if (!allowedArgs.has(argument)) errors.push(`unsupported argument for ${canonicalCode}: ${argument}`);
    }

    const security = intent.security;
    if (security?.asset_class) security.asset_class = normalizeAssetClass(security.asset_class);
    if (command?.scope === "security" && !security) errors.push(`${canonicalCode} requires a security`);
    if (security?.ticker && !security.venue) errors.push("ticker requires venue");
    if (security?.ticker && !security.asset_class) errors.push("ticker requires asset_class");
    if (command?.scope === "query" && !String(intent.query ?? "").trim()) errors.push(`${canonicalCode} requires a free-text query`);
    if (command?.scope !== "query" && intent.query != null) errors.push(`${canonicalCode} does not accept a free-text query`);

    const featureText = (command?.features ?? []).join(" ").toLowerCase();
    for (const action of intent.post_open_actions ?? []) {
      const requestedFeature = String(action.feature).toLowerCase().replace(/[_-]+/g, " ");
      const eqsFeature = String(action.feature ?? "").trim().toLowerCase().replace(/[ .-]+/g, "_");
      if (canonicalCode === "EQS" && EQS_UNBOUND_FEATURES.includes(eqsFeature)) {
        try {
          intent.post_open_actions[intent.post_open_actions.indexOf(action)] = normalizeEQSLiveDynamicAction(action);
        } catch (error) {
          errors.push(error.message);
        }
        continue;
      }
      if (canonicalCode === "N" && requestedFeature === "query" && featureText.includes("exact search")) {
        continue;
      }
      if (!featureText.includes(requestedFeature)) {
        errors.push(`unknown UI feature for ${canonicalCode}: ${action.feature}`);
      }
    }
  }

  if (intent?.kind === "clarify" && !intent.clarification) errors.push("clarify requires clarification text");
  return { ok: errors.length === 0, errors, intent };
}

export function renderTerminalCommand(intent) {
  const checked = validateIntent(structuredClone(intent));
  if (!checked.ok) throw new Error(checked.errors.join("; "));
  if (checked.intent.kind !== "execute") return null;

  const command = maps.canonical.get(checked.intent.command);
  const parts = [];
  const security = checked.intent.security;
  if (security?.ticker && security?.venue && security?.asset_class) {
    parts.push(normalizeToken(security.ticker), normalizeToken(security.venue), normalizeAssetClass(security.asset_class));
  } else if (command.scope === "security") {
    throw new Error("Security must be resolved before rendering");
  }
  if (command.scope === "query" && command.query_position !== "after") parts.push(String(checked.intent.query).trim());
  parts.push(command.code);
  if (command.scope === "query" && command.query_position === "after") parts.push(String(checked.intent.query).trim());
  parts.push(...(checked.intent.arguments ?? []));
  return parts.join(" ");
}

function renderWhenResolved(intent) {
  if (intent.kind !== "execute") return null;
  const command = maps.canonical.get(intent.command);
  const security = intent.security;
  if (command?.scope === "security" && (!security?.ticker || !security?.venue || !security?.asset_class || security.needs_resolution)) {
    return null;
  }
  return renderTerminalCommand(intent);
}

function parseResponsePayload(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Provider returned no message content");
  const unfenced = content.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  return JSON.parse(unfenced);
}

function transientProviderStatus(status) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

export async function fetchCompletionWithRetry({ url, headers, body, retries = 1, retryBaseMs = 80, timeoutMs = 8_000 }) {
  const startedAt = performance.now();
  let lastError = null;
  const attemptLatenciesMs = [];
  for (let attempt = 0; attempt <= Math.max(0, Number(retries)); attempt += 1) {
    const attemptStartedAt = performance.now();
    try {
      const response = await fetch(url, {
        method: "POST", headers, body: JSON.stringify(body),
        signal: AbortSignal.timeout(Math.max(1, Number(timeoutMs)))
      });
      if (!response.ok) {
        const error = new Error(`Provider error ${response.status}: ${await response.text()}`);
        error.transient = transientProviderStatus(response.status);
        throw error;
      }
      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        const error = new Error("Provider returned no message content");
        error.transient = true;
        throw error;
      }
      attemptLatenciesMs.push(Math.round(performance.now() - attemptStartedAt));
      return {
        payload,
        retryCount: attempt,
        latencyMs: Math.round(performance.now() - startedAt),
        providerLatencyMs: attemptLatenciesMs.at(-1),
        attemptLatenciesMs
      };
    } catch (error) {
      attemptLatenciesMs.push(Math.round(performance.now() - attemptStartedAt));
      lastError = error;
      const transient = error?.transient === true || error?.name === "AbortError" || error?.name === "TimeoutError" || error instanceof TypeError;
      if (!transient || attempt >= Math.max(0, Number(retries))) {
        error.inference = {
          latency_ms: Math.round(performance.now() - startedAt),
          provider_latency_ms: attemptLatenciesMs.at(-1),
          attempt_latencies_ms: attemptLatenciesMs,
          retry_count: attempt,
          timeout_ms: Math.max(1, Number(timeoutMs)),
          max_attempts: Math.max(0, Number(retries)) + 1
        };
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, Math.min(500, Math.max(0, Number(retryBaseMs)) * (2 ** attempt))));
    }
  }
  throw lastError ?? new Error("Provider request failed");
}

function parseBoolean(value, fallback) {
  if (value == null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (String(value).toLowerCase() === "true") return true;
  if (String(value).toLowerCase() === "false") return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

function openRouterOptions(options) {
  const only = options.providerOnly ?? process.env.OPENROUTER_PROVIDER_ONLY;
  const sort = options.providerSort ?? process.env.OPENROUTER_PROVIDER_SORT;
  const reasoningEffort = options.reasoningEffort ?? process.env.OPENROUTER_REASONING_EFFORT;
  const provider = only || sort
    ? {
        allow_fallbacks: parseBoolean(options.allowFallbacks ?? process.env.OPENROUTER_ALLOW_FALLBACKS, !only),
        require_parameters: parseBoolean(options.requireParameters ?? process.env.OPENROUTER_REQUIRE_PARAMETERS, true)
      }
    : null;
  if (provider && only) {
    provider.only = String(only).split(",").map(value => value.trim()).filter(Boolean);
  }
  if (provider && sort) provider.sort = sort;
  const reasoning = reasoningEffort ? { effort: reasoningEffort, exclude: true } : null;
  return { provider, reasoning };
}

export async function compileVoiceRequest(transcript, options = {}) {
  const baseUrl = (options.baseUrl ?? process.env.VOICE_LLM_BASE_URL ?? "").replace(/\/$/, "");
  const apiKey = options.apiKey ?? process.env.VOICE_LLM_API_KEY;
  const model = options.model ?? process.env.VOICE_LLM_MODEL;
  const responseMode = options.responseMode ?? process.env.VOICE_LLM_RESPONSE_FORMAT ?? "json_schema";
  const maxTokens = Number(options.maxTokens ?? process.env.VOICE_LLM_MAX_TOKENS ?? 500);
  const configuredTemperature = options.temperature ?? process.env.VOICE_LLM_TEMPERATURE ?? 0;
  const temperature = options.temperature === null || configuredTemperature === "omit" ? null : Number(configuredTemperature);
  const retries = Number(options.retries ?? process.env.VOICE_LLM_RETRIES ?? 1);
  const retryBaseMs = Number(options.retryBaseMs ?? process.env.VOICE_LLM_RETRY_BASE_MS ?? 80);
  const timeoutMs = Number(options.timeoutMs ?? process.env.VOICE_LLM_TIMEOUT_MS ?? 8_000);
  if (!baseUrl || !apiKey || !model) {
    throw new Error("Set VOICE_LLM_BASE_URL, VOICE_LLM_API_KEY and VOICE_LLM_MODEL");
  }

  const resolvedEntities = options.resolvedEntities?.length
    ? options.resolvedEntities
    : resolveTranscriptSecurities(transcript);
  const body = {
    model,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt() },
      { role: "user", content: userPrompt(transcript, resolvedEntities, options.context ?? null) }
    ],
    response_format: responseMode === "json_object"
      ? { type: "json_object" }
      : {
          type: "json_schema",
          json_schema: { name: "godel_voice_intent", strict: true, schema: intentSchema }
        }
  };
  if (temperature != null) body.temperature = temperature;

  if (baseUrl.includes("openrouter.ai")) {
    const routing = openRouterOptions(options);
    if (routing.provider) body.provider = routing.provider;
    if (routing.reasoning) body.reasoning = routing.reasoning;
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
  if (options.siteUrl ?? process.env.OPENROUTER_SITE_URL) headers["HTTP-Referer"] = options.siteUrl ?? process.env.OPENROUTER_SITE_URL;
  if (options.appName ?? process.env.OPENROUTER_APP_NAME) headers["X-OpenRouter-Title"] = options.appName ?? process.env.OPENROUTER_APP_NAME;

  const request = await fetchCompletionWithRetry({ url: `${baseUrl}/chat/completions`, headers, body, retries, retryBaseMs, timeoutMs });
  const payload = request.payload;
  const latencyMs = request.latencyMs;
  const intent = parseResponsePayload(payload);
  bindResolvedEntities(intent, resolvedEntities);
  applyDeterministicVoiceRepairs(intent, transcript);
  rejectUnverifiedModelTicker(intent, transcript);
  const checked = validateIntent(intent);
  if (!checked.ok) throw new Error(`Invalid model intent: ${checked.errors.join("; ")}`);
  return {
    intent: checked.intent,
    terminalCommand: renderWhenResolved(checked.intent),
    inference: {
      model: payload.model ?? model,
      provider: payload.provider ?? null,
      latency_ms: latencyMs,
      prompt_tokens: payload.usage?.prompt_tokens ?? null,
      completion_tokens: payload.usage?.completion_tokens ?? null,
      cost: payload.usage?.cost ?? null,
      retry_count: request.retryCount,
      provider_latency_ms: request.providerLatencyMs,
      attempt_latencies_ms: request.attemptLatenciesMs,
      timeout_ms: timeoutMs,
      max_attempts: Math.max(0, retries) + 1
    }
  };
}

export function compileStructuredWorkflow(workflowInput, transcript, options = {}) {
  const workflow = structuredClone(workflowInput);
  const resolvedEntities = options.resolvedEntities?.length
    ? options.resolvedEntities
    : resolveTranscriptSecurities(transcript);
  applyDeterministicWorkflowRepairs(workflow, transcript, options.context ?? null);
  if (!workflow || !["execute", "clarify", "unsupported"].includes(workflow.kind)) throw new Error("Invalid workflow kind");
  if (typeof workflow.confidence !== "number" || workflow.confidence < 0 || workflow.confidence > 1) throw new Error("Invalid workflow confidence");
  if (!Array.isArray(workflow.steps) || workflow.steps.length > 12) throw new Error("Invalid workflow steps");
  if (workflow.kind === "execute" && workflow.steps.length < 1) throw new Error("Executable workflow has no steps");
  if (workflow.kind !== "execute" && workflow.steps.length) throw new Error("Non-executable workflow cannot contain steps");

  let plan = null;
  let planError = null;
  if (workflow.kind === "execute") {
    const requests = workflow.steps.map((step, index) => {
      if (step.step_kind === "configure") {
        if (!step.configure_target?.command || !step.post_open_actions?.length) throw new Error(`Invalid configure step ${index + 1}`);
        const target = { ...step.configure_target };
        const contextualPanel = target.mode === "focused" ? options.context?.focused_panel
          : target.mode === "last" ? options.context?.last_panel : null;
        if (!target.security && contextualPanel?.command === target.command && contextualPanel.security) {
          target.security = String(contextualPanel.security).toUpperCase();
        }
        Object.assign(step, { configure_target: target });
        return {
          id: `configure-${index + 1}`,
          kind: "configure",
          target,
          actions: step.post_open_actions,
          required: step.required !== false
        };
      }
      if (step.step_kind === "control") {
        if (!step.control_operation || !step.control_target) throw new Error(`Invalid control step ${index + 1}`);
        const target = { ...step.control_target };
        if (target.command && target.mode !== "command") target.mode = "command";
        if (target.mode === "command" && !target.security && resolvedEntities.length === 1 && resolvedEntities[0]?.ticker) {
          target.security = String(resolvedEntities[0].ticker).toUpperCase();
        }
        Object.assign(step, { control_target: target });
        return {
          id: `control-${index + 1}`,
          kind: "control",
          operation: step.control_operation,
          target,
          value: step.control_value ?? null,
          required: step.required !== false
        };
      }
      const intent = {
        kind: "execute",
        confidence: workflow.confidence,
        command: step.command,
        security: step.security,
        query: step.query,
        arguments: step.arguments,
        post_open_actions: step.post_open_actions,
        clarification: null,
        reason: workflow.reason || `Workflow step ${index + 1}`
      };
      bindResolvedEntities(intent, resolvedEntities);
      applyDeterministicVoiceRepairs(intent, transcript);
      rejectUnverifiedModelTicker(intent, transcript);
      const checked = validateIntent(intent);
      if (!checked.ok) throw new Error(`Invalid workflow step ${index + 1}: ${checked.errors.join("; ")}`);
      Object.assign(step, {
        command: checked.intent.command,
        security: checked.intent.security,
        query: checked.intent.query,
        arguments: checked.intent.arguments,
        post_open_actions: checked.intent.post_open_actions
      });
      return {
        intent: checked.intent,
        required: step.required !== false,
        layout: step.placement ? { placement: step.placement } : null
      };
    });
    const requestedLayout = workflow.layout ?? {};
    try {
      plan = buildWorkflowPlan(requests, {
        failure_policy: "stop_on_required",
        layout: {
          mode: requestedLayout.preserve_existing === true ? "preserve" : "tile",
          direction: "row",
          gap_px: 12,
          preset: requestedLayout.preset ?? "grid",
          preserve_existing: requestedLayout.preserve_existing === true,
          new_screen: requestedLayout.new_screen === true
        }
      });
    } catch (error) {
      planError = error.message;
    }
  }
  return { workflow, plan, plan_error: planError };
}

export async function compileVoiceWorkflow(transcript, options = {}) {
  const baseUrl = (options.baseUrl ?? process.env.VOICE_LLM_BASE_URL ?? "").replace(/\/$/, "");
  const apiKey = options.apiKey ?? process.env.VOICE_LLM_API_KEY;
  const model = options.model ?? process.env.VOICE_LLM_MODEL;
  const responseMode = options.responseMode ?? process.env.VOICE_LLM_RESPONSE_FORMAT ?? "json_schema";
  const maxTokens = Number(options.maxTokens ?? process.env.VOICE_LLM_MAX_TOKENS ?? 1800);
  const configuredTemperature = options.temperature ?? process.env.VOICE_LLM_TEMPERATURE ?? 0;
  const temperature = options.temperature === null || configuredTemperature === "omit" ? null : Number(configuredTemperature);
  const retries = Number(options.retries ?? process.env.VOICE_LLM_RETRIES ?? 1);
  const retryBaseMs = Number(options.retryBaseMs ?? process.env.VOICE_LLM_RETRY_BASE_MS ?? 80);
  const timeoutMs = Number(options.timeoutMs ?? process.env.VOICE_LLM_TIMEOUT_MS ?? 8_000);
  if (!baseUrl || !apiKey || !model) {
    throw new Error("Set VOICE_LLM_BASE_URL, VOICE_LLM_API_KEY and VOICE_LLM_MODEL");
  }

  const resolvedEntities = options.resolvedEntities?.length
    ? options.resolvedEntities
    : resolveTranscriptSecurities(transcript);
  const body = {
    model,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: workflowSystemPrompt() },
      { role: "user", content: userPrompt(transcript, resolvedEntities, options.context ?? null) }
    ],
    response_format: responseMode === "json_object"
      ? { type: "json_object" }
      : {
          type: "json_schema",
          json_schema: { name: "godel_voice_workflow", strict: true, schema: voiceWorkflowSchema }
        }
  };
  if (temperature != null) body.temperature = temperature;
  if (baseUrl.includes("openrouter.ai")) {
    const routing = openRouterOptions(options);
    if (routing.provider) body.provider = routing.provider;
    if (routing.reasoning) body.reasoning = routing.reasoning;
  }

  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  if (options.siteUrl ?? process.env.OPENROUTER_SITE_URL) headers["HTTP-Referer"] = options.siteUrl ?? process.env.OPENROUTER_SITE_URL;
  if (options.appName ?? process.env.OPENROUTER_APP_NAME) headers["X-OpenRouter-Title"] = options.appName ?? process.env.OPENROUTER_APP_NAME;

  const request = await fetchCompletionWithRetry({ url: `${baseUrl}/chat/completions`, headers, body, retries, retryBaseMs, timeoutMs });
  const payload = request.payload;
  const latencyMs = request.latencyMs;
  const compiled = compileStructuredWorkflow(parseResponsePayload(payload), transcript, {
    context: options.context ?? null,
    resolvedEntities
  });

  return {
    ...compiled,
    inference: {
      model: payload.model ?? model,
      provider: payload.provider ?? null,
      latency_ms: latencyMs,
      prompt_tokens: payload.usage?.prompt_tokens ?? null,
      completion_tokens: payload.usage?.completion_tokens ?? null,
      cost: payload.usage?.cost ?? null,
      retry_count: request.retryCount,
      provider_latency_ms: request.providerLatencyMs,
      attempt_latencies_ms: request.attemptLatenciesMs,
      timeout_ms: timeoutMs,
      max_attempts: Math.max(0, retries) + 1
    }
  };
}

async function main() {
  const transcript = process.argv.slice(2).join(" ") || fs.readFileSync(0, "utf8").trim();
  if (!transcript) throw new Error("Pass the voice transcript as arguments or stdin");
  const result = await compileVoiceRequest(transcript);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
