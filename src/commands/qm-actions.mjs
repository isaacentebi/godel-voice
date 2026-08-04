export const QM_WATCHLIST_ACTIONS = Object.freeze(["create", "switch", "rename", "delete", "reorder"]);
export const QM_TICKER_ACTIONS = Object.freeze(["add", "remove", "batch-import"]);
export const QM_SORT_DIRECTIONS = Object.freeze(["Ascending", "Descending", "Off"]);
export const QM_REORDER_PLACEMENTS = Object.freeze(["Before", "After"]);
export const QM_MAX_SECURITIES = 400;
export const QM_FEATURES = Object.freeze(["watchlist", "tickers", "columns", "scale", "sort"]);

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}
function keysOnly(value, allowed, required, label) {
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
function name(value, label) {
  if (typeof value !== "string" || /[\r\n\u0000-\u001f\u007f]/.test(value)) throw new Error(`Invalid ${label}`);
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > 64) throw new Error(`Invalid ${label}`);
  return cleaned;
}
function nullableName(value, label) { return value == null ? null : name(value, label); }
function confirmed(value, label) {
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean`);
  return value;
}

function security(value, index) {
  const label = `QM securities[${index}]`;
  const item = record(value, label);
  const fields = new Set(["spoken_name", "ticker", "venue", "asset_class", "needs_resolution"]);
  keysOnly(item, fields, fields, label);
  const spokenName = nullableName(item.spoken_name, `${label}.spoken_name`);
  const ticker = item.ticker == null ? null : name(item.ticker, `${label}.ticker`).toUpperCase();
  const venue = item.venue == null ? null : name(item.venue, `${label}.venue`).toUpperCase();
  const assetClass = item.asset_class == null ? null : name(item.asset_class, `${label}.asset_class`).toUpperCase();
  if (typeof item.needs_resolution !== "boolean") throw new Error(`${label}.needs_resolution must be boolean`);
  if (!spokenName && !ticker) throw new Error(`${label} needs spoken_name or ticker`);
  if (!item.needs_resolution && (!ticker || !venue || !assetClass)) throw new Error(`${label} resolved security is incomplete`);
  return { spoken_name: spokenName, ticker, venue, asset_class: assetClass, needs_resolution: item.needs_resolution };
}
function securityKey(item) {
  return item.ticker ? `${item.ticker}|${item.venue ?? ""}|${item.asset_class ?? ""}` : `spoken|${item.spoken_name.toLowerCase()}`;
}
function securities(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > QM_MAX_SECURITIES) {
    throw new Error(`QM securities must contain 1-${QM_MAX_SECURITIES} items`);
  }
  const deduped = [];
  const seen = new Set();
  value.map(security).forEach(item => {
    const key = securityKey(item);
    if (!seen.has(key)) { seen.add(key); deduped.push(item); }
  });
  return deduped;
}
function dynamicColumns(value, label) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64) throw new Error(`${label} must contain 1-64 columns`);
  const result = value.map((item, index) => name(item, `${label}[${index}]`));
  if (new Set(result.map(item => item.toLowerCase())).size !== result.length) throw new Error(`${label} contains duplicate columns`);
  return result;
}

export function normalizeQMAction(raw, label = "QM action") {
  const action = record(raw, label);
  keysOnly(action, new Set(["feature", "operation", "value"]), new Set(["feature", "operation", "value"]), label);
  const feature = String(action.feature).trim().toLowerCase().replace(/[ .-]+/g, "_");
  if (!QM_FEATURES.includes(feature) || String(action.operation).trim().toLowerCase() !== "configure") {
    throw new Error(`Unsupported QM action: ${feature || "empty"}.${String(action.operation ?? "").trim().toLowerCase() || "empty"}`);
  }
  const value = record(action.value, `${label}.value`);
  if (feature === "watchlist") {
    const fields = new Set(["action", "name", "new_name", "relative_to", "placement", "confirmed"]);
    keysOnly(value, fields, fields, `${label}.value`);
    const kind = exact(value.action, QM_WATCHLIST_ACTIONS, "QM watchlist action");
    const result = {
      action: kind, name: name(value.name, "QM watchlist name"),
      new_name: nullableName(value.new_name, "QM new watchlist name"),
      relative_to: nullableName(value.relative_to, "QM relative watchlist name"),
      placement: value.placement == null ? null : exact(value.placement, QM_REORDER_PLACEMENTS, "QM reorder placement"),
      confirmed: confirmed(value.confirmed, "QM confirmation")
    };
    if (kind === "rename" && !result.new_name) throw new Error("QM rename requires new_name");
    if (kind === "reorder" && (!result.relative_to || !result.placement)) throw new Error("QM reorder requires relative_to and placement");
    if (!["rename"].includes(kind) && result.new_name) throw new Error(`QM ${kind} does not use new_name`);
    if (kind !== "reorder" && (result.relative_to || result.placement)) throw new Error(`QM ${kind} does not use reorder fields`);
    if (kind === "switch" && result.confirmed) throw new Error("QM switch is read-only and does not use confirmation");
    if (kind !== "switch" && !result.confirmed) throw new Error(`QM ${kind} requires explicit confirmation`);
    return { feature, operation: "configure", value: result };
  }
  if (feature === "tickers") {
    const fields = new Set(["action", "watchlist", "securities", "confirmed"]);
    keysOnly(value, fields, fields, `${label}.value`);
    const result = {
      action: exact(value.action, QM_TICKER_ACTIONS, "QM ticker action"),
      watchlist: name(value.watchlist, "QM target watchlist"),
      securities: securities(value.securities),
      confirmed: confirmed(value.confirmed, "QM confirmation")
    };
    if (!result.confirmed) throw new Error(`QM ${result.action} requires explicit confirmation`);
    return { feature, operation: "configure", value: result };
  }
  if (feature === "columns") {
    const fields = new Set(["visible", "order", "widths", "confirmed"]);
    keysOnly(value, fields, fields, `${label}.value`);
    const visible = dynamicColumns(value.visible, "QM visible columns");
    const order = dynamicColumns(value.order, "QM column order");
    if (visible.length !== order.length || visible.some(item => !order.some(other => other.toLowerCase() === item.toLowerCase()))) {
      throw new Error("QM visible columns and column order must contain the same exact values");
    }
    if (!Array.isArray(value.widths) || value.widths.length > order.length) throw new Error("QM widths must be a bounded list");
    const widths = value.widths.map((item, index) => {
      const width = record(item, `QM widths[${index}]`);
      keysOnly(width, new Set(["column", "pixels"]), new Set(["column", "pixels"]), `QM widths[${index}]`);
      const column = name(width.column, `QM widths[${index}].column`);
      if (!order.some(item => item.toLowerCase() === column.toLowerCase())) throw new Error(`QM width column '${column}' is not visible`);
      if (!Number.isInteger(width.pixels) || width.pixels < 24 || width.pixels > 2000) throw new Error("QM column width must be 24-2000 pixels");
      return { column, pixels: width.pixels };
    });
    if (!confirmed(value.confirmed, "QM confirmation")) throw new Error("QM columns configuration requires explicit confirmation");
    return { feature, operation: "configure", value: { visible, order, widths, confirmed: true } };
  }
  if (feature === "scale") {
    const fields = new Set(["percent", "confirmed"]);
    keysOnly(value, fields, fields, `${label}.value`);
    if (typeof value.percent !== "number" || !Number.isFinite(value.percent) || value.percent <= 0 || value.percent > 500) {
      throw new Error("QM scale percent must be finite and between 0 and 500");
    }
    if (!confirmed(value.confirmed, "QM confirmation")) throw new Error("QM scale requires explicit confirmation");
    return { feature, operation: "configure", value: { percent: value.percent, confirmed: true } };
  }
  const fields = new Set(["column", "direction", "confirmed"]);
  keysOnly(value, fields, fields, `${label}.value`);
  const result = {
    column: name(value.column, "QM sort column"),
    direction: exact(value.direction, QM_SORT_DIRECTIONS, "QM sort direction"),
    confirmed: confirmed(value.confirmed, "QM confirmation")
  };
  if (!result.confirmed) throw new Error("QM sort requires explicit confirmation");
  return { feature, operation: "configure", value: result };
}

export function assertQMActionDisabled(raw, label = "QM action") {
  const action = normalizeQMAction(raw, label);
  throw new Error(`QM ${action.feature} is schema-valid but not live-enabled; authenticated account-state binding is required`);
}
