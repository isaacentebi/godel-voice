import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { commandMaps, loadRegistry } from "./catalog.mjs";
import { intentSchema, systemPrompt, userPrompt } from "./prompt.mjs";
import { resolveCommonSecurities } from "./security-resolver.mjs";

const registry = loadRegistry();
const maps = commandMaps(registry);
const assetClassAliases = new Map([
  ["EQ", "EQ"],
  ["EQUITY", "EQ"],
  ["EQUITIES", "EQ"],
  ["STOCK", "EQ"],
  ["STOCKS", "EQ"]
]);

function normalizeToken(value) {
  return value == null ? null : String(value).trim().toUpperCase();
}

function normalizeAssetClass(value) {
  const normalized = normalizeToken(value);
  return normalized == null ? null : (assetClassAliases.get(normalized) ?? normalized);
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
      if (!featureText.includes(String(action.feature).toLowerCase())) {
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
  if (command.scope === "query") parts.push(String(checked.intent.query).trim());
  parts.push(command.code, ...(checked.intent.arguments ?? []));
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
  if (!baseUrl || !apiKey || !model) {
    throw new Error("Set VOICE_LLM_BASE_URL, VOICE_LLM_API_KEY and VOICE_LLM_MODEL");
  }

  const body = {
    model,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt() },
      { role: "user", content: userPrompt(transcript, options.resolvedEntities ?? []) }
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

  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Provider error ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  const latencyMs = Math.round(performance.now() - startedAt);
  const intent = parseResponsePayload(payload);
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
      cost: payload.usage?.cost ?? null
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
