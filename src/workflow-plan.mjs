import { commandMaps, loadRegistry } from "./catalog.mjs";
import { EQS_UNBOUND_FEATURES, normalizeEQSLiveDynamicAction } from "./commands/eqs-actions.mjs";
import { normalizeSECFLiveAction } from "./commands/secf-actions.mjs";
import { assertMOSTUnboundActionDisabled, MOST_UNBOUND_FEATURES } from "./commands/most-actions.mjs";
import { assertQMActionDisabled, QM_FEATURES } from "./commands/qm-actions.mjs";
import { assertCFActionDisabled, CF_FEATURES } from "./commands/cf-actions.mjs";
import { assertFAActionDisabled, assertHPActionDisabled, FA_FEATURES, HP_FEATURES } from "./commands/fa-hp-actions.mjs";
import { assertEMUnboundActionDisabled, EM_UNBOUND_FEATURES } from "./commands/em-actions.mjs";
import { assertERNActionDisabled, ERN_FEATURES } from "./commands/ern-actions.mjs";
import { assertSIActionDisabled, SI_FEATURES } from "./commands/si-actions.mjs";
import { assertHCPActionDisabled, assertTASActionDisabled, HCP_FEATURES, TAS_FEATURES } from "./commands/hcp-tas-actions.mjs";
import { normalizeGLiveAction } from "./commands/g-chart-actions.mjs";
import { assertGLCOActionDisabled, assertWorldActionDisabled, GLCO_FEATURES, WORLD_FEATURES } from "./commands/wei-glco-actions.mjs";
import { ANR_FEATURES, assertANRActionDisabled, assertDVDActionDisabled, DVD_FEATURES } from "./commands/anr-dvd-actions.mjs";
import { assertCHANGEActionDisabled, assertHELPActionDisabled, assertTRANActionDisabled, CHANGE_FEATURES, HELP_FEATURES, TRAN_FEATURES } from "./commands/tran-help-change-actions.mjs";
import { ACM_FEATURES, CHAT_FEATURES, ENT_FEATURES, NOTE_FEATURES, assertSensitiveActionDisabled } from "./commands/sensitive-workspaces-actions.mjs";
import { HDS_REMAINING_FEATURES, IPO_FEATURES, assertHDSRemainingActionDisabled, assertIPOActionDisabled } from "./commands/ipo-wji-hds-actions.mjs";
import { normalizeHMSAction } from "./commands/q-hldr-hms-actions.mjs";

export const WORKFLOW_PLAN_PREFIX = "GV2:";
export const WORKFLOW_PLAN_VERSION = 2;
export const WORKFLOW_FAILURE_POLICIES = new Set(["stop_on_any", "stop_on_required", "continue"]);
export const STEP_FAILURE_POLICIES = new Set(["stop", "continue"]);
export const LAYOUT_MODES = new Set(["preserve", "tile", "stack"]);
export const LAYOUT_DIRECTIONS = new Set(["row", "column"]);
export const LAYOUT_PRESETS = new Set(["research", "market", "comparison", "options", "grid", "focus"]);
export const LAYOUT_PLACEMENTS = new Set([
  "full", "left", "right", "top", "bottom",
  "top-left", "top-right", "bottom-left", "bottom-right"
]);
export const CONTROL_OPERATIONS = new Set(["move", "resize", "maximize", "restore", "focus", "close", "export", "reset_workspace"]);
export const CONTROL_TARGET_MODES = new Set(["last", "focused", "command"]);
export const EQS_RANGE_FIELDS = Object.freeze([
  "Market Cap (USD)", "P/E (Fwd)", "P/E (TTM)", "P/S (Fwd)", "P/S (TTM)",
  "P/B (Fwd)", "P/B (TTM)", "P/CF (Fwd)", "P/CF (TTM)", "EPS (Fwd 12mo)",
  "Rev. (TTM, USD)", "Rev. (Fwd 12mo, USD)",
  "Net Inc. (TTM, USD)", "Net Inc. (Fwd 12mo, USD)"
]);

const maps = commandMaps(loadRegistry());
const COMMANDS = new Set(maps.canonical.keys());
const AUTOMATED_COMMANDS = new Set(["G", "HMS", "GR", "GF", "HALT", "HMAP", "IMAP", "EM", "ERN", "SI", "HCP", "TAS", "WEI", "WEIF", "GLCO", "ANR", "DVD", "TRAN", "HELP", "CHANGE", "NOTE", "ENT", "ACM", "CHAT", "IPO", "MOST", "HDS", "EQS", "SECF", "QM", "CF", "FA", "HP", "OMON", "N"]);
const FEATURES = {
  G: new Set(["resolution"]),
  HMS: new Set(["add/remove securities", "timeframe", "metric", "normalize/overlay/side-by-side"]),
  GR: new Set(["buy leg", "sell leg", "period", "correlation toggle", "correlation window", "regression toggle", "full/filtered data"]),
  GF: new Set(["periodicity", "range", "display currency", "include consensus estimates", "layout", "add company", "add metric", "ratio metric", "margin metric", "style", "axis", "scale", "transform"]),
  HALT: new Set(["tab"]),
  HMAP: new Set(["universe", "view"]),
  IMAP: new Set(["index", "view"]),
  EM: new Set(["metric", ...EM_UNBOUND_FEATURES]),
  ERN: new Set(ERN_FEATURES),
  SI: new Set(SI_FEATURES),
  HCP: new Set(HCP_FEATURES),
  TAS: new Set(TAS_FEATURES),
  WEI: new Set(WORLD_FEATURES),
  WEIF: new Set(WORLD_FEATURES),
  GLCO: new Set(GLCO_FEATURES),
  ANR: new Set(ANR_FEATURES),
  DVD: new Set(DVD_FEATURES),
  TRAN: new Set(TRAN_FEATURES),
  HELP: new Set(HELP_FEATURES),
  CHANGE: new Set(CHANGE_FEATURES),
  NOTE: new Set(NOTE_FEATURES),
  ENT: new Set(ENT_FEATURES),
  ACM: new Set(ACM_FEATURES),
  CHAT: new Set(CHAT_FEATURES),
  MOST: new Set(["results", ...MOST_UNBOUND_FEATURES]),
  HDS: new Set(["view", ...HDS_REMAINING_FEATURES]),
  IPO: new Set(IPO_FEATURES),
  EQS: new Set(["screen", "range_filter", ...EQS_UNBOUND_FEATURES]),
  SECF: new Set(["search"]),
  QM: new Set(QM_FEATURES),
  CF: new Set(CF_FEATURES),
  FA: new Set(FA_FEATURES),
  HP: new Set(HP_FEATURES),
  OMON: new Set(["strike depth"])
  , N: new Set(["query"])
};

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function keysOnly(value, allowed, label) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) throw new Error(`${label} has unknown field: ${unknown[0]}`);
}

function shortString(value, label, maxLength, { nullable = false } = {}) {
  if (nullable && value == null) return null;
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  const result = value.trim();
  if (!result || result.length > maxLength || /[\r\n]/.test(result)) throw new Error(`Invalid ${label}`);
  return result;
}

function normalizeLayout(layout, label, { step = false } = {}) {
  if (layout == null) return null;
  const value = record(layout, label);
  const allowed = step
    ? new Set(["slot", "group", "focus", "placement"])
    : new Set(["mode", "direction", "gap_px", "preset", "preserve_existing", "new_screen"]);
  keysOnly(value, allowed, label);
  if (step) {
    const slot = value.slot == null ? null : value.slot;
    if (slot != null && (!Number.isInteger(slot) || slot < 0 || slot > 31)) throw new Error(`Invalid ${label}.slot`);
    const group = value.group == null ? null : shortString(value.group, `${label}.group`, 48, { nullable: true });
    const focus = value.focus ?? false;
    if (typeof focus !== "boolean") throw new Error(`Invalid ${label}.focus`);
    const placement = value.placement == null ? null : String(value.placement).toLowerCase();
    if (placement != null && !LAYOUT_PLACEMENTS.has(placement)) throw new Error(`Invalid ${label}.placement`);
    return { slot, group, focus, placement };
  }

  const mode = value.mode ?? "preserve";
  const direction = value.direction ?? "row";
  const gap = value.gap_px ?? 12;
  const preset = value.preset ?? "grid";
  const preserveExisting = value.preserve_existing ?? false;
  const newScreen = value.new_screen ?? false;
  if (!LAYOUT_MODES.has(mode)) throw new Error(`Invalid ${label}.mode`);
  if (!LAYOUT_DIRECTIONS.has(direction)) throw new Error(`Invalid ${label}.direction`);
  if (!Number.isInteger(gap) || gap < 0 || gap > 128) throw new Error(`Invalid ${label}.gap_px`);
  if (!LAYOUT_PRESETS.has(preset)) throw new Error(`Invalid ${label}.preset`);
  if (typeof preserveExisting !== "boolean") throw new Error(`Invalid ${label}.preserve_existing`);
  if (typeof newScreen !== "boolean") throw new Error(`Invalid ${label}.new_screen`);
  return {
    mode, direction, gap_px: gap, preset,
    preserve_existing: preserveExisting, new_screen: newScreen
  };
}

function defaultStepFailure(planPolicy, required) {
  if (planPolicy === "stop_on_any") return "stop";
  if (planPolicy === "continue") return "continue";
  return required ? "stop" : "continue";
}

export function normalizeEQSRangeValue(raw, label = "EQS range value") {
  const value = record(raw, label);
  keysOnly(value, new Set(["field", "minimum", "maximum"]), label);
  for (const key of ["field", "minimum", "maximum"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) throw new Error(`${label} is missing ${key}`);
  }
  const field = EQS_RANGE_FIELDS.find(candidate => candidate.toLowerCase() === String(value.field ?? "").trim().toLowerCase());
  if (!field) throw new Error(`Unsupported EQS range field: ${String(value.field ?? "empty")}`);
  const minimum = value.minimum ?? null;
  const maximum = value.maximum ?? null;
  for (const [name, bound] of [["minimum", minimum], ["maximum", maximum]]) {
    if (bound !== null && (typeof bound !== "number" || !Number.isFinite(bound))) throw new Error(`EQS range ${name} must be a finite number or null`);
  }
  if (minimum === null && maximum === null) throw new Error("EQS range requires a minimum or maximum");
  if (minimum !== null && maximum !== null && minimum > maximum) throw new Error("EQS range minimum cannot exceed maximum");
  return { field, minimum, maximum };
}

function normalizeActions(command, actions, label) {
  if (!Array.isArray(actions) || actions.length > 12) throw new Error(`Invalid ${label}`);
  if (actions.length && !AUTOMATED_COMMANDS.has(command)) throw new Error(`Automation is not enabled for ${command}`);
  const allowed = FEATURES[command] ?? new Set();
  return actions.map((action, index) => {
    const value = record(action, `${label}[${index}]`);
    keysOnly(value, new Set(["feature", "operation", "value"]), `${label}[${index}]`);
    const feature = shortString(value.feature, `${label}[${index}].feature`, 80).toLowerCase();
    const operation = shortString(value.operation, `${label}[${index}].operation`, 40).toLowerCase();
    if (!allowed.has(feature)) throw new Error(`Unsupported ${command} feature: ${feature}`);
    const eqsRangeFeature = command === "EQS" && feature === "range_filter";
    const eqsUnboundFeature = command === "EQS" && EQS_UNBOUND_FEATURES.includes(feature);
    const secfFeature = command === "SECF" && feature === "search";
    const mostUnboundFeature = command === "MOST" && MOST_UNBOUND_FEATURES.includes(feature);
    const qmFeature = command === "QM" && QM_FEATURES.includes(feature);
    const cfFeature = command === "CF" && CF_FEATURES.includes(feature);
    const faFeature = command === "FA" && FA_FEATURES.includes(feature);
    const hpFeature = command === "HP" && HP_FEATURES.includes(feature);
    const emUnboundFeature = command === "EM" && EM_UNBOUND_FEATURES.includes(feature);
    const ernFeature = command === "ERN" && ERN_FEATURES.includes(feature);
    const siFeature = command === "SI" && SI_FEATURES.includes(feature);
    const hcpFeature = command === "HCP" && HCP_FEATURES.includes(feature);
    const tasFeature = command === "TAS" && TAS_FEATURES.includes(feature);
    const gFeature = command === "G" && feature === "resolution";
    const worldFeature = ["WEI", "WEIF"].includes(command) && WORLD_FEATURES.includes(feature);
    const glcoFeature = command === "GLCO" && GLCO_FEATURES.includes(feature);
    const anrFeature = command === "ANR" && ANR_FEATURES.includes(feature);
    const dvdFeature = command === "DVD" && DVD_FEATURES.includes(feature);
    const tranFeature = command === "TRAN" && TRAN_FEATURES.includes(feature);
    const helpFeature = command === "HELP" && HELP_FEATURES.includes(feature);
    const changeFeature = command === "CHANGE" && CHANGE_FEATURES.includes(feature);
    const sensitiveFeature = ({ NOTE: NOTE_FEATURES, ENT: ENT_FEATURES, ACM: ACM_FEATURES, CHAT: CHAT_FEATURES }[command] ?? []).includes(feature);
    const ipoFeature = command === "IPO" && IPO_FEATURES.includes(feature);
    const hdsRemainingFeature = command === "HDS" && HDS_REMAINING_FEATURES.includes(feature);
    if (command === "HMS") return normalizeHMSAction({ feature, operation, value: value.value }, `${label}[${index}]`);
    if (gFeature) return normalizeGLiveAction({ feature, operation, value: value.value }, `${label}[${index}]`);
    if (eqsUnboundFeature) return normalizeEQSLiveDynamicAction({ feature, operation, value: value.value }, `${label}[${index}]`);
    if (secfFeature) return normalizeSECFLiveAction({ feature, operation, value: value.value }, `${label}[${index}]`);
    if (mostUnboundFeature) return assertMOSTUnboundActionDisabled({ feature, operation, value: value.value }, `${label}[${index}]`);
    if (qmFeature) return assertQMActionDisabled({ feature, operation, value: value.value }, `${label}[${index}]`);
    if (cfFeature) return assertCFActionDisabled({ feature, operation, value: value.value }, `${label}[${index}]`);
    if (faFeature) return assertFAActionDisabled({ feature, operation, value: value.value }, `${label}[${index}]`);
    if (hpFeature) return assertHPActionDisabled({ feature, operation, value: value.value }, `${label}[${index}]`);
    if (emUnboundFeature) return assertEMUnboundActionDisabled({ feature, operation, value: value.value }, `${label}[${index}]`);
    if (ernFeature) return assertERNActionDisabled({ feature, operation, value: value.value }, `${label}[${index}]`);
    if (siFeature) return assertSIActionDisabled({ feature, operation, value: value.value }, `${label}[${index}]`);
    if (hcpFeature) return assertHCPActionDisabled({ feature, operation, value: value.value }, `${label}[${index}]`);
    if (tasFeature) return assertTASActionDisabled({ feature, operation, value: value.value }, `${label}[${index}]`);
    if (worldFeature) return assertWorldActionDisabled(command, { feature, operation, value: value.value }, `${label}[${index}]`);
    if (glcoFeature) return assertGLCOActionDisabled({ feature, operation, value: value.value }, `${label}[${index}]`);
    if (anrFeature) return assertANRActionDisabled({ feature, operation, value: value.value }, `${label}[${index}]`);
    if (dvdFeature) return assertDVDActionDisabled({ feature, operation, value: value.value }, `${label}[${index}]`);
    if (tranFeature) return assertTRANActionDisabled({ feature, operation, value: value.value }, `${label}[${index}]`);
    if (helpFeature) return assertHELPActionDisabled({ feature, operation, value: value.value }, `${label}[${index}]`);
    if (changeFeature) return assertCHANGEActionDisabled({ feature, operation, value: value.value }, `${label}[${index}]`);
    if (sensitiveFeature) return assertSensitiveActionDisabled(command, { feature, operation, value: value.value }, `${label}[${index}]`);
    if (ipoFeature) return assertIPOActionDisabled({ feature, operation, value: value.value }, `${label}[${index}]`);
    if (hdsRemainingFeature) return assertHDSRemainingActionDisabled({ feature, operation, value: value.value }, `${label}[${index}]`);
    if (eqsRangeFeature && operation !== "add") throw new Error("EQS range filters require add");
    const eqsRange = eqsRangeFeature && operation === "add";
    const normalizedEQSRange = eqsRange ? normalizeEQSRangeValue(value.value, `${label}[${index}].value`) : null;
    if (!eqsRange && !["string", "number", "boolean"].includes(typeof value.value) && value.value !== null) {
      throw new Error(`Invalid value for ${feature}`);
    }
    if (typeof value.value === "number" && !Number.isFinite(value.value)) throw new Error(`Invalid value for ${feature}`);
    if (typeof value.value === "string" && (value.value.length > 160 || /[\r\n]/.test(value.value))) {
      throw new Error(`Invalid value for ${feature}`);
    }
    if (command === "HALT") {
      if (feature !== "tab" || operation !== "select") throw new Error("HALT only supports selecting a tab");
      const canonical = { all: "All", active: "Active", resumed: "Resumed" }[String(value.value).trim().toLowerCase()];
      if (!canonical) throw new Error("Unsupported HALT tab");
      return { feature, operation, value: canonical };
    }
    if (command === "HMAP") {
      if (!["universe", "view"].includes(feature) || operation !== "select") {
        throw new Error("HMAP currently supports only selecting an index universe or Map/Table view");
      }
      const canonical = feature === "universe"
        ? { "s&p 500": "S&P 500", "sp 500": "S&P 500", "s p 500": "S&P 500", djia: "DJIA", dow: "DJIA" }[String(value.value).trim().toLowerCase()]
        : { map: "Map", table: "Table" }[String(value.value).trim().toLowerCase()];
      if (!canonical) throw new Error(`Unsupported HMAP ${feature}`);
      return { feature, operation, value: canonical };
    }
    if (command === "IMAP") {
      if (operation !== "select" || !["index", "view"].includes(feature)) {
        throw new Error("IMAP currently supports only selecting the index or Map/Table view");
      }
      const values = feature === "index"
        ? { "s&p 500": "S&P 500", "sp 500": "S&P 500", "s p 500": "S&P 500", djia: "DJIA", dow: "DJIA" }
        : { map: "Map", table: "Table" };
      const canonical = values[String(value.value).trim().toLowerCase()];
      if (!canonical) throw new Error(`Unsupported IMAP ${feature}`);
      return { feature, operation, value: canonical };
    }
    if (command === "EM") {
      if (feature !== "metric" || operation !== "select") throw new Error("EM currently supports only selecting a metric");
      const aliases = {
        sales: "Sales", revenue: "Sales", ebitda: "EBITDA", "net income": "Net Income",
        "net income (bfng)": "Net Income", eps: "EPS (GAAP)", "eps (gaap)": "EPS (GAAP)",
        "total assets": "Total Assets", "current assets": "Current Assets",
        "current liabilities": "Current Liabilities", "shareholder equity": "Shareholder Equity",
        cfo: "Cash Flow From Operations", "cash flow from operations": "Cash Flow From Operations",
        cfi: "Cash Flow From Investing", "cash flow from investing": "Cash Flow From Investing",
        cff: "Cash Flow From Financing", "cash flow from financing": "Cash Flow From Financing",
        "net revenue": "Net Revenue", "gross revenue": "Gross Revenue"
      };
      const canonical = aliases[String(value.value).trim().toLowerCase()];
      if (!canonical) throw new Error("Unsupported EM metric");
      return { feature, operation, value: canonical };
    }
    if (command === "MOST") {
      if (feature !== "results" || operation !== "select") throw new Error("MOST currently supports only selecting result count");
      const count = Number(value.value);
      if (![10, 25, 50, 100].includes(count)) throw new Error("Unsupported MOST result count");
      return { feature, operation, value: count };
    }
    if (command === "HDS") {
      if (feature !== "view" || operation !== "select") throw new Error("HDS only supports selecting a view");
      const canonical = { table: "Table", treemap: "Treemap", bubble: "Bubble" }[String(value.value).trim().toLowerCase()];
      if (!canonical) throw new Error("Unsupported HDS view");
      return { feature, operation, value: canonical };
    }
    if (command === "EQS") {
      if (feature === "range_filter") {
        if (operation !== "add") throw new Error("EQS range filters require add");
        return { feature, operation, value: normalizedEQSRange };
      }
      if (feature !== "screen" || !["run", "clear"].includes(operation) || value.value != null) {
        throw new Error("EQS supports only structured range_filter.add or Run/Clear screen actions");
      }
      return { feature, operation, value: null };
    }
    if (command === "OMON") {
      if (feature !== "strike depth" || operation !== "set") {
        throw new Error("OMON currently supports only setting native strike depth");
      }
      const depth = Number(value.value);
      if (!Number.isInteger(depth) || depth < 1 || depth > 100) throw new Error("Invalid OMON strike depth");
      return { feature, operation, value: depth };
    }
    if (command === "N") {
      if (feature !== "query" || operation !== "set") {
        throw new Error("News currently supports only setting the exact per-window query");
      }
      const query = String(value.value ?? "").replace(/\s+/g, " ").trim();
      if (!query || query.length > 200 || /[\r\n]/.test(query)) throw new Error("Invalid News exact query");
      return { feature, operation, value: query };
    }
    return { feature, operation, value: value.value };
  });
}

function normalizeControlStep(value, label, id, planPolicy) {
  keysOnly(value, new Set(["id", "kind", "operation", "target", "value", "required", "failure_policy"]), label);
  const operation = shortString(value.operation, `${label}.operation`, 24).toLowerCase();
  if (!CONTROL_OPERATIONS.has(operation)) throw new Error(`Unsupported ${label}.operation`);
  const targetValue = record(value.target, `${label}.target`);
  keysOnly(targetValue, new Set(["mode", "command", "security"]), `${label}.target`);
  const mode = String(targetValue.mode ?? "last").toLowerCase();
  if (!CONTROL_TARGET_MODES.has(mode)) throw new Error(`Invalid ${label}.target.mode`);
  const command = targetValue.command == null ? null : shortString(targetValue.command, `${label}.target.command`, 16).toUpperCase();
  const security = targetValue.security == null ? null : shortString(targetValue.security, `${label}.target.security`, 24).toUpperCase();
  if (mode === "command" && (!command || !COMMANDS.has(command))) throw new Error(`${label}.target requires a known command`);
  if (mode !== "command" && command != null) throw new Error(`${label}.target.command is only valid for command mode`);
  if (mode !== "command" && security != null) throw new Error(`${label}.target.security is only valid for command mode`);
  if (security != null && !/^[A-Z0-9][A-Z0-9.-]{0,23}$/.test(security)) throw new Error(`Invalid ${label}.target.security`);
  const rawValue = value.value ?? null;
  if (!["string", "number", "boolean"].includes(typeof rawValue) && rawValue !== null) throw new Error(`Invalid ${label}.value`);
  if (typeof rawValue === "string" && (rawValue.length > 80 || /[\r\n]/.test(rawValue))) throw new Error(`Invalid ${label}.value`);
  if (operation === "move" && !LAYOUT_PLACEMENTS.has(String(rawValue).toLowerCase())) throw new Error(`Invalid ${label}.value for move`);
  if (operation === "resize" && !["larger", "smaller"].includes(String(rawValue).toLowerCase())) throw new Error(`Invalid ${label}.value for resize`);
  if (!["move", "resize"].includes(operation) && rawValue !== null) throw new Error(`${label}.value is not used by ${operation}`);
  const required = value.required ?? true;
  if (typeof required !== "boolean") throw new Error(`Invalid ${label}.required`);
  const failurePolicy = value.failure_policy ?? defaultStepFailure(planPolicy, required);
  if (!STEP_FAILURE_POLICIES.has(failurePolicy)) throw new Error(`Invalid ${label}.failure_policy`);
  return {
    id,
    kind: "control",
    operation,
    target: { mode, command, security },
    value: typeof rawValue === "string" ? rawValue.toLowerCase() : rawValue,
    required,
    failure_policy: failurePolicy
  };
}

function normalizeConfigureStep(value, label, id, planPolicy) {
  keysOnly(value, new Set(["id", "kind", "target", "actions", "required", "failure_policy"]), label);
  const targetValue = record(value.target, `${label}.target`);
  keysOnly(targetValue, new Set(["mode", "command", "security"]), `${label}.target`);
  const mode = String(targetValue.mode ?? "last").toLowerCase();
  if (!CONTROL_TARGET_MODES.has(mode)) throw new Error(`Invalid ${label}.target.mode`);
  const command = shortString(targetValue.command, `${label}.target.command`, 16).toUpperCase();
  if (!COMMANDS.has(command)) throw new Error(`${label}.target requires a known command`);
  if (!AUTOMATED_COMMANDS.has(command)) throw new Error(`Automation is not enabled for ${command}`);
  const security = targetValue.security == null ? null : shortString(targetValue.security, `${label}.target.security`, 24).toUpperCase();
  if (security != null && !/^[A-Z0-9][A-Z0-9.-]{0,23}$/.test(security)) throw new Error(`Invalid ${label}.target.security`);
  const actions = normalizeActions(command, value.actions ?? [], `${label}.actions`);
  if (!actions.length) throw new Error(`${label} requires at least one action`);
  const required = value.required ?? true;
  if (typeof required !== "boolean") throw new Error(`Invalid ${label}.required`);
  const failurePolicy = value.failure_policy ?? defaultStepFailure(planPolicy, required);
  if (!STEP_FAILURE_POLICIES.has(failurePolicy)) throw new Error(`Invalid ${label}.failure_policy`);
  return { id, kind: "configure", target: { mode, command, security }, actions, required, failure_policy: failurePolicy };
}

function normalizeStep(step, index, planPolicy) {
  const label = `steps[${index}]`;
  const value = record(step, label);
  const id = shortString(value.id, `${label}.id`, 64);
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) throw new Error(`Invalid ${label}.id`);
  const kind = value.kind ?? "command";
  if (kind === "control") return normalizeControlStep(value, label, id, planPolicy);
  if (kind === "configure") return normalizeConfigureStep(value, label, id, planPolicy);
  if (kind !== "command") throw new Error(`Unsupported ${label}.kind`);
  keysOnly(value, new Set([
    "id", "kind", "command", "terminal_command", "security_query", "arguments", "actions",
    "required", "failure_policy", "layout"
  ]), label);
  const command = shortString(value.command, `${label}.command`, 16).toUpperCase();
  if (!COMMANDS.has(command)) throw new Error(`Unknown Godel command: ${command}`);
  const terminalCommand = value.terminal_command == null
    ? null
    : shortString(value.terminal_command, `${label}.terminal_command`, 300, { nullable: true });
  const securityQuery = value.security_query == null
    ? null
    : shortString(value.security_query, `${label}.security_query`, 120, { nullable: true });
  if ((!terminalCommand && !securityQuery) || (terminalCommand && securityQuery)) {
    throw new Error(`${label} requires exactly one terminal_command or security_query`);
  }
  const args = value.arguments ?? [];
  if (!Array.isArray(args) || args.length > 8 || args.some(arg => typeof arg !== "string" || !arg.trim() || arg.length > 80 || /[\r\n]/.test(arg))) {
    throw new Error(`Invalid ${label}.arguments`);
  }
  const required = value.required ?? true;
  if (typeof required !== "boolean") throw new Error(`Invalid ${label}.required`);
  const failurePolicy = value.failure_policy ?? defaultStepFailure(planPolicy, required);
  if (!STEP_FAILURE_POLICIES.has(failurePolicy)) throw new Error(`Invalid ${label}.failure_policy`);
  if (planPolicy === "stop_on_any" && failurePolicy !== "stop") throw new Error(`${label} cannot continue under stop_on_any`);
  if (planPolicy === "continue" && failurePolicy !== "continue") throw new Error(`${label} cannot stop under continue`);
  return {
    id,
    kind,
    command,
    terminal_command: terminalCommand,
    security_query: securityQuery,
    arguments: args.map(arg => arg.trim()),
    actions: normalizeActions(command, value.actions ?? [], `${label}.actions`),
    required,
    failure_policy: failurePolicy,
    layout: normalizeLayout(value.layout, `${label}.layout`, { step: true })
  };
}

export function validateWorkflowPlan(plan) {
  const value = record(plan, "workflow plan");
  keysOnly(value, new Set(["version", "failure_policy", "layout", "steps"]), "workflow plan");
  if (value.version !== WORKFLOW_PLAN_VERSION) throw new Error("Unsupported Godel workflow plan version");
  const failurePolicy = value.failure_policy ?? "stop_on_required";
  if (!WORKFLOW_FAILURE_POLICIES.has(failurePolicy)) throw new Error("Invalid workflow failure_policy");
  if (!Array.isArray(value.steps) || value.steps.length < 1 || value.steps.length > 16) throw new Error("Invalid workflow steps");
  const steps = value.steps.map((step, index) => normalizeStep(step, index, failurePolicy));
  const ids = new Set();
  for (const step of steps) {
    if (ids.has(step.id)) throw new Error(`Duplicate workflow step id: ${step.id}`);
    ids.add(step.id);
  }
  return {
    version: WORKFLOW_PLAN_VERSION,
    failure_policy: failurePolicy,
    layout: normalizeLayout(value.layout, "workflow plan.layout") ?? {
      mode: "preserve", direction: "row", gap_px: 12,
      preset: "grid", preserve_existing: false, new_screen: false
    },
    steps
  };
}

export function canonicalStringify(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("Workflow plan contains a non-JSON value");
  return encoded;
}

export function parseWorkflowMarker(marker) {
  const text = String(marker ?? "").trim();
  if (!text.startsWith(WORKFLOW_PLAN_PREFIX)) return null;
  return validateWorkflowPlan(JSON.parse(text.slice(WORKFLOW_PLAN_PREFIX.length)));
}

export function encodeWorkflowPlan(plan) {
  return WORKFLOW_PLAN_PREFIX + canonicalStringify(validateWorkflowPlan(plan));
}
