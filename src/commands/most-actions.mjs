export const MOST_RANKINGS = Object.freeze(["Active", "Gainers", "Losers", "Value"]);
export const MOST_RESULT_COUNTS = Object.freeze([10, 25, 50, 100]);
export const MOST_CAP_UNITS = Object.freeze(["raw", "K", "M", "B", "T"]);
export const MOST_SECTORS = Object.freeze([
  "All", "Financial Services", "Healthcare", "Technology", "Industrials",
  "Consumer Cyclical", "Basic Materials", "Energy", "Real Estate",
  "Communication Services", "Consumer Defensive", "Utilities"
]);
export const MOST_UNBOUND_FEATURES = Object.freeze(["ranking", "market_cap", "sector"]);

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}
function keysOnly(value, allowed, label, required = allowed) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) throw new Error(`${label} has unknown field: ${unknown[0]}`);
  const missing = [...required].filter(key => !Object.prototype.hasOwnProperty.call(value, key));
  if (missing.length) throw new Error(`${label} is missing ${missing[0]}`);
}
function exact(value, allowed, label) {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  const matches = allowed.filter(item => item.toLowerCase() === value.trim().toLowerCase());
  if (matches.length !== 1) throw new Error(`Unsupported ${label}: ${value.trim() || "empty"}`);
  return matches[0];
}
function bound(value, label) {
  if (value == null) return null;
  const item = record(value, label);
  keysOnly(item, new Set(["value", "unit"]), label);
  if (typeof item.value !== "number" || !Number.isFinite(item.value) || item.value < 0) throw new Error(`${label}.value must be a finite non-negative number`);
  return { value: item.value, unit: exact(item.unit, MOST_CAP_UNITS, "MOST market-cap unit") };
}
export function rawMOSTCap(item) {
  if (!item) return null;
  return item.value * ({ raw: 1, K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[item.unit]);
}

export function normalizeMOSTUnboundAction(raw, label = "MOST action") {
  const action = record(raw, label);
  keysOnly(action, new Set(["feature", "operation", "value"]), label);
  const feature = String(action.feature).trim().toLowerCase().replace(/[ .-]+/g, "_");
  const operation = String(action.operation).trim().toLowerCase();
  if (feature === "ranking") {
    if (operation !== "select") throw new Error("MOST ranking requires select");
    return { feature, operation, value: exact(action.value, MOST_RANKINGS, "MOST ranking") };
  }
  if (feature === "sector") {
    if (operation !== "select") throw new Error("MOST sector requires select");
    return { feature, operation, value: exact(action.value, MOST_SECTORS, "MOST sector") };
  }
  if (feature === "market_cap") {
    if (operation !== "set") throw new Error("MOST market_cap requires set");
    const value = record(action.value, `${label}.value`);
    keysOnly(value, new Set(["minimum", "maximum"]), `${label}.value`);
    const minimum = bound(value.minimum, `${label}.value.minimum`);
    const maximum = bound(value.maximum, `${label}.value.maximum`);
    if (!minimum && !maximum) throw new Error("MOST market-cap range requires a minimum or maximum");
    if (minimum && maximum && rawMOSTCap(minimum) > rawMOSTCap(maximum)) throw new Error("MOST minimum market cap cannot exceed maximum market cap");
    return { feature, operation, value: { minimum, maximum } };
  }
  throw new Error(`Unsupported unbound MOST feature: ${feature || "empty"}`);
}

export function assertMOSTUnboundActionDisabled(raw, label = "MOST action") {
  const action = normalizeMOSTUnboundAction(raw, label);
  throw new Error(`MOST ${action.feature} is schema-valid but not live-enabled; authenticated control binding is required`);
}
