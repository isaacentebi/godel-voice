export const EQS_LIST_FIELDS = Object.freeze([
  "Currency", "Venue", "HQ Country", "Sector", "Sub-Sector"
]);
export const EQS_BOOLEAN_FIELDS = Object.freeze(["Private Company"]);
export const EQS_UNBOUND_FEATURES = Object.freeze([
  "list_filter", "boolean_filter", "primary_listings", "hide_no_trades"
]);
export const EQS_LIVE_LIST_VALUES = Object.freeze({
  Currency: Object.freeze(["USD"]),
  "HQ Country": Object.freeze(["United States"]),
  Sector: Object.freeze(["Technology"])
});

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

function exactField(value, allowed, label) {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  const folded = value.trim().toLowerCase();
  const matches = allowed.filter(candidate => candidate.toLowerCase() === folded);
  if (matches.length !== 1) throw new Error(`Unsupported ${label}: ${value.trim() || "empty"}`);
  return matches[0];
}

function dynamicItems(value, label) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw new Error(`${label} must be a non-empty list of at most 20 values`);
  }
  const items = value.map((item, index) => {
    if (typeof item !== "string") throw new Error(`${label}[${index}] must be a string`);
    if (/[\r\n\u0000-\u001f\u007f]/.test(item)) throw new Error(`Invalid ${label}[${index}]`);
    const cleaned = item.replace(/\s+/g, " ").trim();
    if (!cleaned || cleaned.length > 64) {
      throw new Error(`Invalid ${label}[${index}]`);
    }
    return cleaned;
  });
  if (new Set(items.map(item => item.toLowerCase())).size !== items.length) {
    throw new Error(`${label} contains duplicate values`);
  }
  return items;
}

/**
 * Validate an EQS action whose native control is not live-bound yet.
 * Dynamic list strings are deliberately not mapped or guessed here: the future
 * runtime adapter must resolve each one against the unique values exposed by
 * the authenticated Godel control before it may click anything.
 */
export function normalizeEQSUnboundAction(raw, label = "EQS action") {
  const action = record(raw, label);
  keysOnly(action, new Set(["feature", "operation", "value"]), label);
  if (typeof action.feature !== "string" || typeof action.operation !== "string") {
    throw new Error(`${label} feature and operation must be strings`);
  }
  const feature = action.feature.trim().toLowerCase().replace(/[ .-]+/g, "_");
  const operation = action.operation.trim().toLowerCase();

  if (feature === "list_filter") {
    if (operation !== "add") throw new Error("EQS list filters require add");
    const value = record(action.value, `${label}.value`);
    keysOnly(value, new Set(["field", "items"]), `${label}.value`);
    return {
      feature, operation,
      value: {
        field: exactField(value.field, EQS_LIST_FIELDS, "EQS list field"),
        items: dynamicItems(value.items, "EQS list items")
      }
    };
  }

  if (feature === "boolean_filter") {
    if (operation !== "add") throw new Error("EQS boolean filters require add");
    const value = record(action.value, `${label}.value`);
    keysOnly(value, new Set(["field", "value"]), `${label}.value`);
    if (typeof value.value !== "boolean") throw new Error("EQS boolean filter value must be boolean");
    return {
      feature, operation,
      value: { field: exactField(value.field, EQS_BOOLEAN_FIELDS, "EQS boolean field"), value: value.value }
    };
  }

  if (["primary_listings", "hide_no_trades"].includes(feature)) {
    if (operation !== "select") throw new Error(`EQS ${feature} requires select`);
    if (typeof action.value !== "boolean") throw new Error(`EQS ${feature} value must be boolean`);
    return { feature, operation, value: action.value };
  }

  throw new Error(`Unsupported unbound EQS feature: ${feature || "empty"}`);
}

export function assertEQSUnboundActionDisabled(raw, label = "EQS action") {
  const action = normalizeEQSUnboundAction(raw, label);
  throw new Error(`EQS ${action.feature} is schema-valid but not live-enabled; authenticated control binding is required`);
}

/**
 * Return the canonical action only for dynamic values whose native option and
 * selected chip have both been authenticated in the live Godel screener.
 * Everything else remains deliberately fail-closed.
 */
export function normalizeEQSLiveDynamicAction(raw, label = "EQS action") {
  const action = normalizeEQSUnboundAction(raw, label);
  if (action.feature !== "list_filter" || action.value.items.length !== 1) {
    throw new Error(`EQS ${action.feature} is schema-valid but not live-enabled; authenticated control binding is required`);
  }
  const allowed = EQS_LIVE_LIST_VALUES[action.value.field] ?? [];
  const wanted = action.value.items[0].toLowerCase();
  const canonical = allowed.find(item => item.toLowerCase() === wanted);
  if (!canonical) {
    throw new Error(`EQS ${action.value.field} value is schema-valid but not live-enabled; authenticated option and selected-state binding are required`);
  }
  return { ...action, value: { ...action.value, items: [canonical] } };
}

export function isEQSLiveDynamicAction(raw) {
  try {
    normalizeEQSLiveDynamicAction(raw);
    return true;
  } catch {
    return false;
  }
}
