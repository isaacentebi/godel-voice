export const SECF_TABS = Object.freeze([
  "All", "Equities", "Corporate Bonds", "Options", "Sovereign Bonds",
  "Crypto", "Index", "Futures", "Forex", "People"
]);
export const SECF_RESULT_CAPS = Object.freeze([50, 100, 250, 500]);

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function keysOnly(value, allowed, label) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) throw new Error(`${label} has unknown field: ${unknown[0]}`);
  const missing = [...allowed].filter(key => !Object.prototype.hasOwnProperty.call(value, key));
  if (missing.length) throw new Error(`${label} is missing ${missing[0]}`);
}

function exactTab(value) {
  if (typeof value !== "string") throw new Error("SECF tab must be a string");
  const matches = SECF_TABS.filter(tab => tab.toLowerCase() === value.trim().toLowerCase());
  if (matches.length !== 1) throw new Error(`Unsupported SECF tab: ${value.trim() || "empty"}`);
  return matches[0];
}

function dynamicList(value, label) {
  if (!Array.isArray(value) || value.length > 20) throw new Error(`${label} must be a list of at most 20 values`);
  const items = value.map((item, index) => {
    if (typeof item !== "string" || /[\r\n\u0000-\u001f\u007f]/.test(item)) throw new Error(`Invalid ${label}[${index}]`);
    const cleaned = item.replace(/\s+/g, " ").trim();
    if (!cleaned || cleaned.length > 64) throw new Error(`Invalid ${label}[${index}]`);
    return cleaned;
  });
  if (new Set(items.map(item => item.toLowerCase())).size !== items.length) throw new Error(`${label} contains duplicate values`);
  return items;
}

/**
 * Strict schema for the documented SECF configuration transaction. Venue and
 * country strings remain unresolved dynamic values: a future live adapter must
 * match each value uniquely against the authenticated control before acting.
 */
export function normalizeSECFUnboundAction(raw, label = "SECF action") {
  const action = record(raw, label);
  keysOnly(action, new Set(["feature", "operation", "value"]), label);
  if (String(action.feature).trim().toLowerCase().replace(/[ .-]+/g, "_") !== "search" ||
      String(action.operation).trim().toLowerCase() !== "configure") {
    throw new Error("SECF only supports search.configure");
  }
  const value = record(action.value, `${label}.value`);
  keysOnly(value, new Set(["query", "tab", "max", "venues", "countries", "hide_no_trade"]), `${label}.value`);
  if (typeof value.query !== "string" || /[\r\n\u0000-\u001f\u007f]/.test(value.query)) throw new Error("Invalid SECF query");
  const query = value.query.replace(/\s+/g, " ").trim();
  if (query.length > 200) throw new Error("SECF query is too long");
  const tab = exactTab(value.tab);
  if (!Number.isInteger(value.max) || !SECF_RESULT_CAPS.includes(value.max)) throw new Error(`Unsupported SECF max: ${value.max}`);
  const venues = dynamicList(value.venues, "SECF venues");
  const countries = dynamicList(value.countries, "SECF countries");
  if (typeof value.hide_no_trade !== "boolean") throw new Error("SECF hide_no_trade must be boolean");
  if (tab === "People" && (venues.length || countries.length || value.hide_no_trade)) {
    throw new Error("SECF People does not support venue, country, or no-trade filters");
  }
  return { feature: "search", operation: "configure", value: { query, tab, max: value.max, venues, countries, hide_no_trade: value.hide_no_trade } };
}

export function assertSECFActionDisabled(raw, label = "SECF action") {
  const action = normalizeSECFUnboundAction(raw, label);
  throw new Error(`SECF ${action.feature}.${action.operation} is schema-valid but not live-enabled; authenticated control binding is required`);
}

/** Live executor subset. People is independently identifiable by its unique
 * Name/Company/Position/Email/Phone result schema; every other tab and all
 * dynamic filters stay fail-closed until they receive an equivalent proof. */
export function normalizeSECFLiveAction(raw, label = "SECF action") {
  const action = normalizeSECFUnboundAction(raw, label);
  const value = action.value;
  if (value.tab !== "People" || value.venues.length || value.countries.length || value.hide_no_trade) {
    throw new Error("SECF configuration is schema-valid but not live-enabled; only the independently proven People tab without venue, country, or no-trade filters is executable");
  }
  return action;
}

export function isSECFLiveAction(raw) {
  try { normalizeSECFLiveAction(raw); return true; } catch { return false; }
}
