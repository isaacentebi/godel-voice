export const WORLD_COMMANDS = Object.freeze(["WEI", "WEIF"]);
export const WORLD_FEATURES = Object.freeze(["category", "venue", "filter", "sort"]);
export const GLCO_FEATURES = Object.freeze(["category", "contract"]);
export const VENUE_STATES = Object.freeze(["Active", "Closed"]);

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function exactKeys(value, allowed, required, label) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) throw new Error(`${label} has unknown field: ${unknown[0]}`);
  const missing = [...required].filter(key => !Object.hasOwn(value, key));
  if (missing.length) throw new Error(`${label} is missing ${missing[0]}`);
}

function short(value, label, max = 100) {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  const result = value.trim();
  if (!result || result.length > max || /[\r\n]/.test(result)) throw new Error(`Invalid ${label}`);
  return result;
}

function isoInstant(value, label) {
  const result = short(value, label, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(result) || Number.isNaN(Date.parse(result))) {
    throw new Error(`${label} must be an ISO timestamp with timezone`);
  }
  return result;
}

export function normalizeWorldAction(command, raw, label = `${command} action`) {
  if (!WORLD_COMMANDS.includes(command)) throw new Error(`Unsupported world-market command: ${command}`);
  const action = record(raw, label);
  exactKeys(action, new Set(["feature", "operation", "value"]), new Set(["feature", "operation", "value"]), label);
  const feature = String(action.feature).trim().toLowerCase();
  const operation = String(action.operation).trim().toLowerCase();
  if (!WORLD_FEATURES.includes(feature)) throw new Error(`Unsupported ${command} feature: ${feature}`);
  if (feature === "sort") {
    if (operation !== "set") throw new Error(`${command} sort requires set`);
    const value = record(action.value, `${command} sort`);
    exactKeys(value, new Set(["field", "direction"]), new Set(["field", "direction"]), `${command} sort`);
    const direction = String(value.direction).trim().toLowerCase();
    if (!["ascending", "descending"].includes(direction)) throw new Error(`${command} sort direction is unsupported`);
    return { feature, operation, value: { field: short(value.field, `${command} sort field`), direction } };
  }
  if (operation !== "select") throw new Error(`${command} ${feature} requires select`);
  return { feature, operation, value: short(action.value, `${command} ${feature}`) };
}

export function normalizeGLCOAction(raw, label = "GLCO action") {
  const action = record(raw, label);
  exactKeys(action, new Set(["feature", "operation", "value"]), new Set(["feature", "operation", "value"]), label);
  const feature = String(action.feature).trim().toLowerCase();
  const operation = String(action.operation).trim().toLowerCase();
  if (!GLCO_FEATURES.includes(feature) || operation !== "select") throw new Error("GLCO supports category.select and contract.select only");
  if (feature === "category") return { feature, operation, value: short(action.value, "GLCO category") };
  const value = record(action.value, "GLCO contract");
  exactKeys(value, new Set(["id", "label", "category"]), new Set(["id", "label", "category"]), "GLCO contract");
  return {
    feature,
    operation,
    value: { id: short(value.id, "GLCO contract id"), label: short(value.label, "GLCO contract label"), category: short(value.category, "GLCO contract category") }
  };
}

export function normalizeVenueFacts(command, raw) {
  if (!WORLD_COMMANDS.includes(command)) throw new Error(`Unsupported world-market command: ${command}`);
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 100) throw new Error(`${command} grounded venue facts require 1-100 rows`);
  return raw.map((item, index) => {
    const value = record(item, `${command} venue fact ${index}`);
    exactKeys(value, new Set(["venue_id", "venue_name", "category", "status", "next_open_at", "captured_at", "source"]), new Set(["venue_id", "venue_name", "category", "status", "next_open_at", "captured_at", "source"]), `${command} venue fact ${index}`);
    const status = VENUE_STATES.find(candidate => candidate.toLowerCase() === String(value.status).toLowerCase());
    if (!status) throw new Error(`${command} venue status must be Active or Closed`);
    const nextOpen = value.next_open_at == null ? null : isoInstant(value.next_open_at, `${command} next open`);
    if (status === "Closed" && nextOpen === null) throw new Error(`${command} closed venue requires an exact next-open timestamp`);
    if (status === "Active" && nextOpen !== null) throw new Error(`${command} active venue cannot claim a next-open timestamp`);
    const source = `${command === "WEI" ? "Godel WEI" : "Godel WEIF"} panel`;
    if (value.source !== source) throw new Error(`${command} facts require exact ${source} source`);
    return {
      venue_id: short(value.venue_id, `${command} venue id`),
      venue_name: short(value.venue_name, `${command} venue name`),
      category: short(value.category, `${command} category`),
      status,
      next_open_at: nextOpen,
      captured_at: isoInstant(value.captured_at, `${command} captured at`),
      source
    };
  });
}

export function normalizeCommodityFacts(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 100) throw new Error("GLCO grounded commodity facts require 1-100 rows");
  return raw.map((item, index) => {
    const value = record(item, `GLCO fact ${index}`);
    exactKeys(value, new Set(["id", "label", "category", "last", "change", "change_percent", "captured_at", "source"]), new Set(["id", "label", "category", "last", "change", "change_percent", "captured_at", "source"]), `GLCO fact ${index}`);
    for (const key of ["last", "change", "change_percent"]) if (typeof value[key] !== "number" || !Number.isFinite(value[key])) throw new Error(`GLCO ${key} must be finite`);
    if (value.last < 0) throw new Error("GLCO last cannot be negative");
    if (value.source !== "Godel GLCO panel") throw new Error("GLCO facts require exact Godel GLCO panel source");
    return {
      id: short(value.id, "GLCO fact id"), label: short(value.label, "GLCO fact label"), category: short(value.category, "GLCO fact category"),
      last: value.last, change: value.change, change_percent: value.change_percent,
      captured_at: isoInstant(value.captured_at, "GLCO captured at"), source: value.source
    };
  });
}

export function assertWorldActionDisabled(command, raw, label) {
  const action = normalizeWorldAction(command, raw, label);
  throw new Error(`${command} ${action.feature} is schema-valid but not live-enabled; exact dynamic state and rendered postconditions remain unproven`);
}

export function assertGLCOActionDisabled(raw, label) {
  const action = normalizeGLCOAction(raw, label);
  throw new Error(`GLCO ${action.feature} is schema-valid but not live-enabled; exact documented/live identity and rendered postconditions remain unproven`);
}
