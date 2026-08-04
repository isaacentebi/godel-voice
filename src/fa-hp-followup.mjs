import { FA_PERIODICITIES, FA_STATEMENTS, normalizeFAAction, normalizeHPAction } from "./fa-hp-actions.mjs";

function clean(value) {
  return String(value ?? "").toLowerCase()
    .replace(/\bstate ment\b/g, "statement")
    .replace(/\bfinancial(?:s| analysis)?\b/g, "financials")
    .replace(/\bin come stat(?:e)?ment\b|\bincome state mint\b/g, "income statement")
    .replace(/\bbalance she(?:e|a)t\b/g, "balance sheet")
    .replace(/\bcash flo(?:w|e)?(?: statement)?\b/g, "cash flow")
    .replace(/\bex cell\b/g, "excel").replace(/\bj son\b/g, "json")
    .replace(/\bone minute\b/g, "1m").replace(/\bone hour\b/g, "1h").replace(/\bone day\b/g, "1d")
    .replace(/[^a-z0-9/.' -]+/g, " ").replace(/\s+/g, " ").trim();
}
function add(blockers, message) { if (!blockers.includes(message)) blockers.push(message); }
function normalizeCorrections(text, choices) {
  const token = choices.map(value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return text.replace(new RegExp(`\\b(${token})\\s+(?:no |actually )?(?:sorry|correction)\\s+(${token})\\b`, "g"), "$2");
}
function matches(text, entries) { return entries.filter(([, pattern]) => pattern.test(text)).map(([value]) => value); }
function iso(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const slash = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(value);
  return slash ? `${slash[1]}-${slash[2]}-${slash[3]}` : null;
}
function shift(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return result.toISOString().slice(0, 10);
}
function clock(context, blockers) {
  const value = context?.clock;
  if (!value?.current_date || !value?.timezone || !iso(value.current_date)) {
    add(blockers, "Relative HP dates require an explicit current_date and timezone anchor.");
    return null;
  }
  try { new Intl.DateTimeFormat("en", { timeZone: value.timezone }).format(); }
  catch { add(blockers, "Relative HP date timezone is invalid."); return null; }
  return { current_date: iso(value.current_date), timezone: value.timezone };
}
function parseDateRange(text, context, blockers) {
  const explicit = /\b(?:from|between)\s+(\d{4}[-/]\d{2}[-/]\d{2})\s+(?:to|through|and)\s+(\d{4}[-/]\d{2}[-/]\d{2})\b/.exec(text);
  if (explicit) return { start: iso(explicit[1]), end: iso(explicit[2]), anchor: null };
  const single = /\b(?:on|for)\s+(\d{4}[-/]\d{2}[-/]\d{2})\b/.exec(text);
  if (single) return { start: iso(single[1]), end: iso(single[1]), anchor: null };
  if (/\b(?:yesterday|today|past \d+ days?|last \d+ days?)\b/.test(text)) {
    const anchor = clock(context, blockers);
    if (!anchor) return null;
    if (/\byesterday\b/.test(text)) return { start: shift(anchor.current_date, -1), end: shift(anchor.current_date, -1), anchor };
    if (/\btoday\b/.test(text)) return { start: anchor.current_date, end: anchor.current_date, anchor };
    const count = Number(/\b(?:past|last) (\d+) days?\b/.exec(text)?.[1]);
    if (!Number.isInteger(count) || count < 1 || count > 3660) { add(blockers, "Relative HP day count must be between 1 and 3660."); return null; }
    return { start: shift(anchor.current_date, -(count - 1)), end: anchor.current_date, anchor };
  }
  if (/\b(?:last|this|previous) (?:week|month|quarter|year)|\bsince (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(text)) {
    add(blockers, "The requested relative HP period has multiple calendar interpretations; give ISO dates or a bounded number of days.");
  }
  return null;
}
function exportFormat(text, blockers) {
  const formats = [/\bexcel\b|\bxlsx\b/.test(text) ? "Excel" : null, /\bjson\b/.test(text) ? "JSON" : null].filter(Boolean);
  if (formats.length > 1) add(blockers, "Conflicting export formats were requested: Excel and JSON.");
  if (/\b(?:export|download|save)\b/.test(text) && formats.length === 0) add(blockers, "FA and HP export require an explicit Excel or JSON format.");
  return formats[0] ?? null;
}

export function compileFAFollowup(context, utterance) {
  const command = String(typeof context === "string" ? context : context?.command ?? "").toUpperCase();
  if (command !== "FA") return null;
  let text = clean(utterance);
  text = normalizeCorrections(text, ["income statement", "balance sheet", "cash flow", "quarterly", "yearly", "annual"]);
  if (!text || text.split(" ").length > 120) return null;
  const blockers = [];
  const actions = [];
  const current = typeof context === "object" ? context.current_config ?? {} : {};
  const statements = matches(text, [["Income Statement", /\bincome statement\b/], ["Balance Sheet", /\bbalance sheet\b/], ["Cash Flow", /\bcash flow\b/]]);
  const periods = matches(text, [["Quarterly", /\bquarterly\b/], ["Yearly", /\b(?:yearly|annual|annually)\b/]]);
  if (new Set(statements).size > 1) add(blockers, `Conflicting FA statements were requested: ${[...new Set(statements)].join(", ")}.`);
  if (new Set(periods).size > 1) add(blockers, `Conflicting FA periodicities were requested: ${[...new Set(periods)].join(", ")}.`);
  const statement = statements[0] ?? current.statement ?? null;
  const periodicity = periods[0] ?? current.periodicity ?? null;
  if (statements.length) actions.push({ feature: "statement", operation: "select", value: statement });
  if (periods.length) actions.push({ feature: "periodicity", operation: "select", value: periodicity });
  const format = exportFormat(text, blockers);
  if (format) {
    if (!statement || !periodicity) add(blockers, "FA export requires authoritative statement and periodicity context.");
    else actions.push({ feature: "export", operation: "download", value: { format, statement, periodicity, receipt_required: true } });
  }
  for (let index = 0; index < actions.length; index++) try { actions[index] = normalizeFAAction(actions[index]); } catch (error) { add(blockers, error.message); }
  if (!actions.length && !blockers.length) return null;
  const target = typeof context === "object" ? context.target ?? { mode: "last", command: "FA", security: null } : { mode: "last", command: "FA", security: null };
  return { kind: "fa-contextual-workflow-draft", command: "FA", target, actions, blockers, ready_for_live_executor: false,
    blocked_reason: "FA remains disabled until exact statement/periodicity controls and receipt-gated Excel/JSON downloads are live-proven.",
    configure_step_draft: blockers.length ? null : { id: "configure-fa-1", kind: "configure", target, actions, required: true } };
}

export function compileHPFollowup(context, utterance) {
  const command = String(typeof context === "string" ? context : context?.command ?? "").toUpperCase();
  if (command !== "HP") return null;
  let text = clean(utterance);
  text = normalizeCorrections(text, ["1d", "1h", "1m", "daily", "hourly", "minutely", "next page", "previous page"]);
  if (!text || text.split(" ").length > 140) return null;
  const blockers = [];
  const actions = [];
  const current = typeof context === "object" ? context.current_config ?? {} : {};
  const range = parseDateRange(text, typeof context === "object" ? context : {}, blockers);
  if (range) actions.push({ feature: "date_range", operation: "set", value: range });
  const resolutions = matches(text, [["1D", /\b(?:1d|daily)\b/], ["1H", /\b(?:1h|hourly)\b/], ["1M", /\b(?:1m|minutely|minute bars?)\b/]]);
  if (new Set(resolutions).size > 1) add(blockers, `Conflicting HP resolutions were requested: ${[...new Set(resolutions)].join(", ")}.`);
  if (resolutions.length) {
    const resolution = resolutions[0];
    let entitlement = "Not Required";
    if (resolution !== "1D") {
      entitlement = context?.intraday_entitlement === true ? "Confirmed" : context?.intraday_entitlement === false ? "Unavailable" : "Unknown";
      if (entitlement !== "Confirmed") add(blockers, entitlement === "Unavailable" ? "HP intraday entitlement is unavailable for this account." : "HP 1H and 1M require authoritative intraday entitlement state.");
    }
    if (entitlement === "Confirmed" || resolution === "1D") actions.push({ feature: "resolution", operation: "select", value: { resolution, entitlement } });
  }
  const pages = matches(text, [["Previous", /\b(?:previous page|go back a page)\b/], ["Next", /\bnext page\b/]]);
  if (new Set(pages).size > 1) add(blockers, "Conflicting HP page directions were requested.");
  if (pages.length) actions.push({ feature: "page", operation: "select", value: pages[0] });
  const format = exportFormat(text, blockers);
  if (format) {
    const loadedRows = context?.loaded_rows ?? current.loaded_rows;
    if (!Number.isInteger(loadedRows) || loadedRows < 1) add(blockers, "HP export requires an authoritative positive loaded-row count.");
    else actions.push({ feature: "export", operation: "download", value: { format, scope: "All Loaded Rows", expected_loaded_rows: loadedRows, receipt_required: true } });
  }
  for (let index = 0; index < actions.length; index++) try { actions[index] = normalizeHPAction(actions[index]); } catch (error) { add(blockers, error.message); }
  if (!actions.length && !blockers.length) return null;
  const target = typeof context === "object" ? context.target ?? { mode: "last", command: "HP", security: null } : { mode: "last", command: "HP", security: null };
  return { kind: "hp-contextual-workflow-draft", command: "HP", target, actions, blockers, ready_for_live_executor: false,
    blocked_reason: "HP remains disabled until exact date/resolution/paging controls, entitlement state, loaded-row scope, and receipt-gated downloads are live-proven.",
    configure_step_draft: blockers.length ? null : { id: "configure-hp-1", kind: "configure", target, actions, required: true } };
}
