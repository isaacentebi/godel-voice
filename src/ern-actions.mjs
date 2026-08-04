export const ERN_PERIODS = Object.freeze(["Quarterly", "Annual"]);
export const ERN_DISPLAY_FIELDS = Object.freeze([
  "Analyst Count", "Low EPS", "High EPS", "Average EPS", "Forward P/E", "EPS YoY",
  "Earnings History", "Estimate vs Actual", "Beat/Miss Percentage"
]);
export const ERN_FEATURES = Object.freeze(["date_range", "period", "display"]);

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

export function normalizeERNAction(raw, label = "ERN action") {
  const action = record(raw, label);
  keys(action, new Set(["feature", "operation", "value"]), new Set(["feature", "operation", "value"]), label);
  const feature = String(action.feature ?? "").trim().toLowerCase();
  const operation = String(action.operation ?? "").trim().toLowerCase();
  if (!ERN_FEATURES.includes(feature)) throw new Error(`Unsupported ERN feature: ${feature || "empty"}`);
  if (feature === "date_range") {
    if (operation !== "set") throw new Error("ERN date_range requires set");
    const value = record(action.value, "ERN date range");
    keys(value, new Set(["start", "end"]), new Set(["start", "end"]), "ERN date range");
    const start = iso(value.start, "ERN start");
    const end = iso(value.end, "ERN end");
    if (start > end) throw new Error("ERN start date cannot be after end date");
    return { feature, operation: "set", value: { start, end } };
  }
  if (feature === "period") {
    if (operation !== "select") throw new Error("ERN period requires select");
    return { feature, operation: "select", value: exact(action.value, ERN_PERIODS, "ERN period") };
  }
  if (operation !== "select") throw new Error("ERN display requires select");
  if (!Array.isArray(action.value) || action.value.length < 1 || action.value.length > ERN_DISPLAY_FIELDS.length) throw new Error("ERN display requires 1-9 fields");
  const fields = action.value.map(value => exact(value, ERN_DISPLAY_FIELDS, "ERN display field"));
  if (new Set(fields).size !== fields.length) throw new Error("ERN display fields contain duplicates");
  return { feature, operation: "select", value: ERN_DISPLAY_FIELDS.filter(field => fields.includes(field)) };
}

export function assertERNActionDisabled(raw, label = "ERN action") {
  const action = normalizeERNAction(raw, label);
  throw new Error(`ERN ${action.feature} is schema-valid but not live-enabled; exact controls and table postconditions remain unproven`);
}

export function normalizeGroundedForwardPE(raw, label = "ERN grounded forward P/E") {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 40) throw new Error(`${label} requires 1-40 facts`);
  return raw.map((fact, index) => {
    const value = record(fact, `${label}[${index}]`);
    keys(value, new Set(["period", "value"]), new Set(["period", "value"]), `${label}[${index}]`);
    if (typeof value.period !== "string" || !/^(?:FY|Q[1-4])\s?\d{2,4}$/i.test(value.period.trim())) throw new Error("ERN forward P/E period is not grounded");
    if (typeof value.value !== "string" || !/^\d{1,4}(?:\.\d{1,4})?x$/i.test(value.value.trim())) throw new Error("ERN forward P/E value must be a displayed multiple");
    const numeric = Number.parseFloat(value.value);
    if (!(numeric > 0 && numeric < 10000)) throw new Error("ERN forward P/E value is implausible");
    return { period: value.period.trim().toUpperCase().replace(/^(FY|Q[1-4])(?=\d)/, "$1 "), value: `${numeric}x` };
  });
}
