export const EM_DOCUMENTED_METRICS = Object.freeze([
  "Sales", "EBITDA", "Net Income", "EPS (GAAP)", "Total Assets", "Current Assets",
  "Current Liabilities", "Shareholder Equity", "Cash Flow From Operations",
  "Cash Flow From Investing", "Cash Flow From Financing"
]);
export const EM_GROWTH_MODES = Object.freeze(["YoY % Growth", "PoP % Growth"]);
export const EM_CHART_MODES = Object.freeze(["Values Chart", "Growth Chart"]);
export const EM_SERIES = Object.freeze(["Historical", "Estimates"]);
export const EM_VALUATIONS = Object.freeze(["P/E", "P/B", "P/S", "P/CF", "EV/EBITDA", "EV/Sales", "EV/CF", "EV/FCF", "Dividend Yield"]);
export const EM_UNBOUND_FEATURES = Object.freeze(["growth", "chart", "series", "valuation"]);

function exact(value, allowed, label) {
  const found = allowed.find(item => item.toLowerCase() === String(value ?? "").trim().toLowerCase());
  if (!found) throw new Error(`Unsupported ${label}: ${String(value ?? "empty")}`);
  return found;
}
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

export function normalizeEMUnboundAction(raw, label = "EM action") {
  const action = record(raw, label);
  keys(action, new Set(["feature", "operation", "value"]), new Set(["feature", "operation", "value"]), label);
  const feature = String(action.feature ?? "").trim().toLowerCase();
  const operation = String(action.operation ?? "").trim().toLowerCase();
  if (!EM_UNBOUND_FEATURES.includes(feature)) throw new Error(`Unsupported EM unbound feature: ${feature || "empty"}`);
  if (feature === "growth") {
    if (operation !== "select") throw new Error("EM growth requires select");
    return { feature, operation, value: exact(action.value, EM_GROWTH_MODES, "EM growth mode") };
  }
  if (feature === "chart") {
    if (operation !== "select") throw new Error("EM chart requires select");
    return { feature, operation, value: exact(action.value, EM_CHART_MODES, "EM chart mode") };
  }
  if (feature === "series") {
    if (!["show", "hide"].includes(operation)) throw new Error("EM series requires show or hide");
    return { feature, operation, value: exact(action.value, EM_SERIES, "EM series") };
  }
  if (operation !== "read") throw new Error("EM valuation requires read");
  const value = record(action.value, "EM valuation value");
  keys(value, new Set(["row", "section", "semantic_unit"]), new Set(["row", "section", "semantic_unit"]), "EM valuation value");
  const row = exact(value.row, EM_VALUATIONS, "EM valuation row");
  if (value.section !== "Multiples") throw new Error("EM valuation rows belong to the Multiples section");
  const expectedUnit = row === "Dividend Yield" ? "Percent" : "Multiple";
  if (value.semantic_unit !== expectedUnit) throw new Error(`EM ${row} must use ${expectedUnit} semantics`);
  return { feature, operation, value: { row, section: "Multiples", semantic_unit: expectedUnit } };
}

export function assertEMUnboundActionDisabled(raw, label = "EM action") {
  const action = normalizeEMUnboundAction(raw, label);
  if (action.feature === "valuation") return action;
  throw new Error(`EM ${action.feature} is schema-valid but not live-enabled; metric selection and exact Multiples-table reads are currently proven`);
}
