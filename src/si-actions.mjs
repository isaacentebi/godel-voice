export const SI_DISPLAY_FIELDS = Object.freeze(["Latest Report Date", "Short Interest", "Short Ratio / Days to Cover", "Average Daily Volume"]);
export const SI_FEATURES = Object.freeze(["date_range", "display", "refresh"]);

function record(value, label) { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`); return value; }
function keys(value, allowed, required, label) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) throw new Error(`${label} has unknown field: ${unknown[0]}`);
  const missing = [...required].filter(key => !Object.prototype.hasOwnProperty.call(value, key));
  if (missing.length) throw new Error(`${label} is missing ${missing[0]}`);
}
function exact(value, allowed, label) {
  const found = allowed.find(item => item.toLowerCase() === String(value ?? "").trim().toLowerCase());
  if (!found) throw new Error(`Unsupported ${label}: ${String(value ?? "empty")}`);
  return found;
}
function iso(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must be ISO YYYY-MM-DD`);
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error(`${label} is not a calendar date`);
  return value;
}

export function normalizeSIAction(raw, label = "SI action") {
  const action = record(raw, label);
  keys(action, new Set(["feature", "operation", "value"]), new Set(["feature", "operation", "value"]), label);
  const feature = String(action.feature ?? "").trim().toLowerCase();
  const operation = String(action.operation ?? "").trim().toLowerCase();
  if (!SI_FEATURES.includes(feature)) throw new Error(`Unsupported SI feature: ${feature || "empty"}`);
  if (feature === "date_range") {
    if (operation !== "set") throw new Error("SI date_range requires set");
    const value = record(action.value, "SI date range");
    keys(value, new Set(["from", "to"]), new Set(["from", "to"]), "SI date range");
    const from = iso(value.from, "SI from");
    const to = iso(value.to, "SI to");
    if (from > to) throw new Error("SI from date cannot be after to date");
    return { feature, operation: "set", value: { from, to } };
  }
  if (feature === "display") {
    if (operation !== "select") throw new Error("SI display requires select");
    if (!Array.isArray(action.value) || action.value.length < 1 || action.value.length > SI_DISPLAY_FIELDS.length) throw new Error("SI display requires 1-4 fields");
    const fields = action.value.map(value => exact(value, SI_DISPLAY_FIELDS, "SI display field"));
    if (new Set(fields).size !== fields.length) throw new Error("SI display fields contain duplicates");
    return { feature, operation: "select", value: SI_DISPLAY_FIELDS.filter(field => fields.includes(field)) };
  }
  if (operation !== "refresh" || action.value !== null) throw new Error("SI refresh requires refresh with null value");
  return { feature, operation: "refresh", value: null };
}

export function assertSIActionDisabled(raw, label = "SI action") {
  const action = normalizeSIAction(raw, label);
  throw new Error(`SI ${action.feature} is schema-valid but not live-enabled; exact controls and refreshed-report postconditions remain unproven`);
}

function finite(value, label, { integer = false } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) throw new Error(`${label} is not an exact non-negative ${integer ? "integer" : "number"}`);
  return value;
}
export function normalizeSIGroundedFacts(raw) {
  const value = record(raw, "SI grounded facts");
  const fields = new Set(["report_date", "short_interest_shares", "days_to_cover", "average_daily_volume_shares", "latest_report_confirmed", "source"]);
  keys(value, fields, fields, "SI grounded facts");
  if (value.latest_report_confirmed !== true) throw new Error("SI latest report identity is not confirmed");
  if (value.source !== "Godel SI panel") throw new Error("SI grounded facts must come from the Godel SI panel");
  return {
    report_date: iso(value.report_date, "SI report date"),
    short_interest_shares: finite(value.short_interest_shares, "SI short interest", { integer: true }),
    days_to_cover: finite(value.days_to_cover, "SI days to cover"),
    average_daily_volume_shares: finite(value.average_daily_volume_shares, "SI average daily volume", { integer: true }),
    latest_report_confirmed: true, source: "Godel SI panel"
  };
}
