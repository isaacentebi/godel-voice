export const CF_FILING_TYPES = Object.freeze(["10-K", "10-Q", "8-K", "Proxy", "13F", "S-1"]);
export const CF_SCOPES = Object.freeze(["Global", "Security", "Watchlist"]);
export const CF_RENDERERS = Object.freeze(["Godel", "EDGAR"]);
export const CF_FEATURES = Object.freeze(["feed", "filing"]);

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
function text(value, label, max = 100, nullable = false) {
  if (nullable && value == null) return null;
  if (typeof value !== "string" || /[\r\n\u0000-\u001f\u007f]/.test(value)) throw new Error(`Invalid ${label}`);
  const result = value.replace(/\s+/g, " ").trim();
  if (!result || result.length > max) throw new Error(`Invalid ${label}`);
  return result;
}
function exact(value, allowed, label) {
  const match = allowed.find(item => item.toLowerCase() === String(value ?? "").trim().toLowerCase());
  if (!match) throw new Error(`Unsupported ${label}: ${String(value ?? "empty")}`);
  return match;
}
function security(value, label) {
  if (value == null) return null;
  const item = record(value, label);
  const fields = new Set(["spoken_name", "ticker", "venue", "asset_class", "needs_resolution"]);
  keys(item, fields, fields, label);
  const result = {
    spoken_name: text(item.spoken_name, `${label}.spoken_name`, 64, true),
    ticker: item.ticker == null ? null : text(item.ticker, `${label}.ticker`, 24).toUpperCase(),
    venue: item.venue == null ? null : text(item.venue, `${label}.venue`, 24).toUpperCase(),
    asset_class: item.asset_class == null ? null : text(item.asset_class, `${label}.asset_class`, 24).toUpperCase(),
    needs_resolution: item.needs_resolution
  };
  if (typeof result.needs_resolution !== "boolean") throw new Error(`${label}.needs_resolution must be boolean`);
  if (!result.spoken_name && !result.ticker) throw new Error(`${label} needs spoken_name or ticker`);
  if (!result.needs_resolution && (!result.ticker || !result.venue || !result.asset_class)) throw new Error(`${label} resolved identity is incomplete`);
  return result;
}
function filingTypes(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > CF_FILING_TYPES.length) throw new Error("CF filing_types must contain 1-6 values");
  const result = value.map(item => exact(item, CF_FILING_TYPES, "CF filing type"));
  if (new Set(result).size !== result.length) throw new Error("CF filing_types contains duplicates");
  return CF_FILING_TYPES.filter(item => result.includes(item));
}
function identity(value, label) {
  const item = record(value, label);
  const fields = new Set(["row_id", "accession_number", "ticker", "form", "filed_date", "company"]);
  keys(item, fields, fields, label);
  const result = {
    row_id: text(item.row_id, `${label}.row_id`, 160, true),
    accession_number: text(item.accession_number, `${label}.accession_number`, 40, true),
    ticker: text(item.ticker, `${label}.ticker`, 24).toUpperCase(),
    form: exact(item.form, CF_FILING_TYPES, "CF filing identity form"),
    filed_date: text(item.filed_date, `${label}.filed_date`, 32),
    company: text(item.company, `${label}.company`, 120)
  };
  if (!result.row_id && !result.accession_number) throw new Error("CF filing identity requires authoritative row_id or accession_number");
  return result;
}

export function normalizeCFAction(raw, label = "CF action") {
  const action = record(raw, label);
  keys(action, new Set(["feature", "operation", "value"]), new Set(["feature", "operation", "value"]), label);
  const feature = String(action.feature ?? "").trim().toLowerCase();
  const operation = String(action.operation ?? "").trim().toLowerCase();
  if (!CF_FEATURES.includes(feature)) throw new Error(`Unsupported CF feature: ${feature || "empty"}`);
  const value = record(action.value, `${label}.value`);
  if (feature === "feed") {
    if (operation !== "configure") throw new Error("CF feed requires configure");
    const fields = new Set(["scope", "security", "watchlist", "filing_types", "render", "explicit_external"]);
    keys(value, fields, fields, `${label}.value`);
    const result = {
      scope: exact(value.scope, CF_SCOPES, "CF scope"),
      security: security(value.security, "CF security"),
      watchlist: text(value.watchlist, "CF watchlist", 64, true),
      filing_types: filingTypes(value.filing_types),
      render: exact(value.render, CF_RENDERERS, "CF renderer"),
      explicit_external: value.explicit_external
    };
    if (typeof result.explicit_external !== "boolean") throw new Error("CF explicit_external must be boolean");
    if (result.scope === "Security" && !result.security) throw new Error("CF Security scope requires security");
    if (result.scope === "Watchlist" && !result.watchlist) throw new Error("CF Watchlist scope requires watchlist");
    if (result.scope !== "Security" && result.security) throw new Error(`CF ${result.scope} scope does not use security`);
    if (result.scope !== "Watchlist" && result.watchlist) throw new Error(`CF ${result.scope} scope does not use watchlist`);
    if (result.render === "EDGAR" && !result.explicit_external) throw new Error("CF EDGAR rendering requires explicit external-navigation intent");
    if (result.render === "Godel" && result.explicit_external) throw new Error("CF Godel rendering cannot be marked external");
    return { feature, operation, value: result };
  }
  if (operation !== "open") throw new Error("CF filing requires open");
  const fields = new Set(["identity", "destination", "explicit_external"]);
  keys(value, fields, fields, `${label}.value`);
  const destination = exact(value.destination, CF_RENDERERS, "CF filing destination");
  if (typeof value.explicit_external !== "boolean") throw new Error("CF explicit_external must be boolean");
  if (destination === "EDGAR" && !value.explicit_external) throw new Error("Opening EDGAR requires explicit external-navigation intent");
  if (destination === "Godel" && value.explicit_external) throw new Error("Opening in Godel cannot be marked external");
  return { feature, operation, value: { identity: identity(value.identity, "CF filing identity"), destination, explicit_external: value.explicit_external } };
}

export function assertCFActionDisabled(raw, label = "CF action") {
  const action = normalizeCFAction(raw, label);
  throw new Error(`CF ${action.feature} is schema-valid but not live-enabled; exact panel state and filing-row callbacks must be proven`);
}
