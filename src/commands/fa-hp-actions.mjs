export const FA_STATEMENTS = Object.freeze(["Income Statement", "Balance Sheet", "Cash Flow"]);
export const FA_PERIODICITIES = Object.freeze(["Quarterly", "Yearly"]);
export const EXPORT_FORMATS = Object.freeze(["Excel", "JSON"]);
export const HP_RESOLUTIONS = Object.freeze(["1D", "1H", "1M"]);
export const HP_PAGES = Object.freeze(["Previous", "Next"]);
export const FA_FEATURES = Object.freeze(["statement", "periodicity", "export"]);
export const HP_FEATURES = Object.freeze(["date_range", "resolution", "page", "export"]);

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}
function keys(value, allowed, required, label) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) throw new Error(`${label} has unknown field: ${unknown[0]}`);
  const missing = [...required].filter(key => !Object.prototype.hasOwnProperty.call(value, key));
  if (missing.length) throw new Error(`${label} is missing ${missing[0]}`);
}
function exact(value, allowed, label) {
  const match = allowed.find(item => item.toLowerCase() === String(value ?? "").trim().toLowerCase());
  if (!match) throw new Error(`Unsupported ${label}: ${String(value ?? "empty")}`);
  return match;
}
function isoDate(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must be ISO YYYY-MM-DD`);
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error(`${label} is not a calendar date`);
  return value;
}
function exportValue(value, command) {
  const label = `${command} export`;
  const item = record(value, label);
  const fields = command === "FA" ? new Set(["format", "statement", "periodicity", "receipt_required"])
    : new Set(["format", "scope", "expected_loaded_rows", "receipt_required"]);
  keys(item, fields, fields, label);
  if (item.receipt_required !== true) throw new Error(`${command} export requires a verified download receipt`);
  const format = exact(item.format, EXPORT_FORMATS, `${command} export format`);
  if (command === "FA") return {
    format, statement: exact(item.statement, FA_STATEMENTS, "FA statement"),
    periodicity: exact(item.periodicity, FA_PERIODICITIES, "FA periodicity"), receipt_required: true
  };
  if (item.scope !== "All Loaded Rows") throw new Error("HP export scope must be All Loaded Rows");
  if (!Number.isInteger(item.expected_loaded_rows) || item.expected_loaded_rows < 1) throw new Error("HP export requires an authoritative positive loaded-row count");
  return { format, scope: "All Loaded Rows", expected_loaded_rows: item.expected_loaded_rows, receipt_required: true };
}

export function normalizeFAAction(raw, label = "FA action") {
  const action = record(raw, label);
  keys(action, new Set(["feature", "operation", "value"]), new Set(["feature", "operation", "value"]), label);
  const feature = String(action.feature ?? "").trim().toLowerCase();
  if (!FA_FEATURES.includes(feature)) throw new Error(`Unsupported FA feature: ${feature || "empty"}`);
  if (feature === "export") {
    if (String(action.operation).toLowerCase() !== "download") throw new Error("FA export requires download");
    return { feature, operation: "download", value: exportValue(action.value, "FA") };
  }
  if (String(action.operation).toLowerCase() !== "select") throw new Error(`FA ${feature} requires select`);
  return { feature, operation: "select", value: exact(action.value, feature === "statement" ? FA_STATEMENTS : FA_PERIODICITIES, `FA ${feature}`) };
}

export function normalizeHPAction(raw, label = "HP action") {
  const action = record(raw, label);
  keys(action, new Set(["feature", "operation", "value"]), new Set(["feature", "operation", "value"]), label);
  const feature = String(action.feature ?? "").trim().toLowerCase();
  if (!HP_FEATURES.includes(feature)) throw new Error(`Unsupported HP feature: ${feature || "empty"}`);
  const operation = String(action.operation ?? "").trim().toLowerCase();
  if (feature === "date_range") {
    if (operation !== "set") throw new Error("HP date_range requires set");
    const item = record(action.value, "HP date range");
    keys(item, new Set(["start", "end", "anchor"]), new Set(["start", "end", "anchor"]), "HP date range");
    const start = isoDate(item.start, "HP start");
    const end = isoDate(item.end, "HP end");
    if (start > end) throw new Error("HP start date cannot be after end date");
    let anchor = null;
    if (item.anchor != null) {
      const value = record(item.anchor, "HP date anchor");
      keys(value, new Set(["current_date", "timezone"]), new Set(["current_date", "timezone"]), "HP date anchor");
      if (typeof value.timezone !== "string" || !value.timezone.trim() || value.timezone.length > 80) throw new Error("HP anchor timezone is invalid");
      anchor = { current_date: isoDate(value.current_date, "HP anchor current_date"), timezone: value.timezone.trim() };
    }
    return { feature, operation: "set", value: { start, end, anchor } };
  }
  if (feature === "resolution") {
    if (operation !== "select") throw new Error("HP resolution requires select");
    const item = record(action.value, "HP resolution");
    keys(item, new Set(["resolution", "entitlement"]), new Set(["resolution", "entitlement"]), "HP resolution");
    const resolution = exact(item.resolution, HP_RESOLUTIONS, "HP resolution");
    const entitlement = exact(item.entitlement, ["Not Required", "Confirmed", "Unknown", "Unavailable"], "HP intraday entitlement");
    if (resolution === "1D" && entitlement !== "Not Required") throw new Error("HP 1D does not use intraday entitlement");
    if (resolution !== "1D" && entitlement !== "Confirmed") throw new Error(`HP ${resolution} requires confirmed intraday entitlement`);
    return { feature, operation: "select", value: { resolution, entitlement } };
  }
  if (feature === "page") {
    if (operation !== "select") throw new Error("HP page requires select");
    return { feature, operation: "select", value: exact(action.value, HP_PAGES, "HP page") };
  }
  if (operation !== "download") throw new Error("HP export requires download");
  return { feature, operation: "download", value: exportValue(action.value, "HP") };
}

export function assertFAActionDisabled(raw, label = "FA action") {
  const action = normalizeFAAction(raw, label);
  throw new Error(`FA ${action.feature} is schema-valid but not live-enabled; exact controls and postconditions remain unproven`);
}
export function assertHPActionDisabled(raw, label = "HP action") {
  const action = normalizeHPAction(raw, label);
  throw new Error(`HP ${action.feature} is schema-valid but not live-enabled; exact controls, entitlement, rows, and postconditions remain unproven`);
}
