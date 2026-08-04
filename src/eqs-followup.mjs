import { isEQSLiveDynamicAction, normalizeEQSUnboundAction } from "./eqs-actions.mjs";

const NUMBER_WORDS = new Map([
  ["zero", 0], ["one", 1], ["two", 2], ["three", 3], ["four", 4], ["five", 5],
  ["six", 6], ["seven", 7], ["eight", 8], ["nine", 9], ["ten", 10],
  ["twelve", 12], ["fifteen", 15], ["twenty", 20], ["twenty five", 25],
  ["thirty", 30], ["fifty", 50], ["hundred", 100], ["one hundred", 100],
  ["fourteen", 14], ["five hundred", 500], ["two point five", 2.5]
]);

export const EQS_RANGE_FIELD_PATTERNS = Object.freeze([
  ["Market Cap (USD)", /\b(?:market cap(?:italization)?|mkt cap)\b/],
  ["P/E (Fwd)", /\b(?:forward|fwd) (?:p ?e|price to earnings|pee)\b|\b(?:p ?e|price to earnings|pee) (?:forward|fwd)\b/],
  ["P/E (TTM)", /\b(?:trailing|ttm) (?:p ?e|price to earnings|pee)\b|\b(?:p ?e|price to earnings|pee) (?:trailing|ttm)\b/],
  ["P/S (Fwd)", /\b(?:forward|fwd) (?:p ?s|price to (?:sales|sails))\b|\b(?:p ?s|price to (?:sales|sails)) (?:forward|fwd)\b/],
  ["P/S (TTM)", /\b(?:trailing|ttm) (?:p ?s|price to (?:sales|sails))\b|\b(?:p ?s|price to (?:sales|sails)) (?:trailing|ttm)\b/],
  ["P/B (Fwd)", /\b(?:forward|fwd) (?:p ?b|price to book)\b|\b(?:p ?b|price to book) (?:forward|fwd)\b/],
  ["P/B (TTM)", /\b(?:trailing|ttm) (?:p ?b|price to book|book multiple)\b|\b(?:p ?b|price to book|book multiple) (?:trailing|ttm)\b/],
  ["P/CF (Fwd)", /\b(?:forward|fwd) (?:p ?c ?f|price to cash flow)\b|\b(?:p ?c ?f|price to cash flow) (?:forward|fwd)\b/],
  ["P/CF (TTM)", /\b(?:trailing|ttm) (?:p ?c ?f|price to cash flow|cash flow multiple)\b|\b(?:p ?c ?f|price to cash flow|cash flow multiple) (?:trailing|ttm)\b/],
  ["EPS (Fwd 12mo)", /\b(?:forward|fwd)(?: twelve month| 12 month)? (?:e ?p ?s|earnings per share)\b/],
  ["Rev. (TTM, USD)", /\b(?:trailing|ttm|last twelve month) revenue\b|\brevenue (?:trailing|ttm|last twelve month)\b/],
  ["Rev. (Fwd 12mo, USD)", /\b(?:forward|fwd)(?: twelve month| 12 month)? revenue\b/],
  ["Net Inc. (TTM, USD)", /\b(?:trailing|ttm) net income\b|\bnet income (?:trailing|ttm)\b/],
  ["Net Inc. (Fwd 12mo, USD)", /\b(?:forward|fwd)(?: twelve month| 12 month)? net income\b/]
]);

const NUMBER = "(?:\\d+(?:\\.\\d+)?|two point five|one hundred|five hundred|zero|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fourteen|fifteen|twenty(?: five)?|thirty|fifty|hundred)";
const UNIT = "(?:\\s*(?:k|thousand|m|mm|million|b|bn|bill|billion|t|tn|trillion))?";

function clean(value) {
  return String(value ?? "").toLowerCase().replace(/&/g, " and ")
    .replace(/\brev a new\b/g, "revenue").replace(/\bsubsector\b/g, "sub sector")
    .replace(/\bp on\b/g, "p e")
    .replace(/\bhead quarter(?:ed|s)?\b/g, "headquartered").replace(/\s+/g, " ")
    .replace(/[^a-z0-9.$%/ -]+/g, " ").replace(/\s+/g, " ").trim();
}

function parseNumber(raw) {
  const text = clean(raw).replace(/^\$/, "").trim();
  const match = new RegExp(`^(${NUMBER})(?:\\s*(k|thousand|m|mm|million|b|bn|bill|billion|t|tn|trillion))?$`).exec(text);
  if (!match) return null;
  const base = /^\d/.test(match[1]) ? Number(match[1]) : NUMBER_WORDS.get(match[1]);
  if (!Number.isFinite(base)) return null;
  const unit = clean(match[2]);
  const multiplier = /^(?:k|thousand)$/.test(unit) ? 1e3
    : /^(?:m|mm|million)$/.test(unit) ? 1e6
      : /^(?:b|bn|bill|billion)$/.test(unit) ? 1e9
        : /^(?:t|tn|trillion)$/.test(unit) ? 1e12 : 1;
  return base * multiplier;
}

function rangeFromClause(clause) {
  const between = new RegExp(`\\bbetween\\s+(\\$?${NUMBER}${UNIT})\\s+(?:and|to)\\s+(\\$?${NUMBER}${UNIT})\\b`).exec(clause);
  if (between) {
    const minimum = parseNumber(between[1]);
    const maximum = parseNumber(between[2]);
    if (minimum == null || maximum == null || minimum > maximum) return null;
    return { minimum, maximum };
  }
  const minimumMatch = new RegExp(`\\b(?:above|over|greater than|at least|minimum|min(?:imum)? of)\\s+(?:a\\s+)?(\\$?${NUMBER}${UNIT})\\b`).exec(clause);
  const maximumMatch = new RegExp(`\\b(?:below|under|less than|at most|no more than|maximum|max(?:imum)? of)\\s+(?:a\\s+)?(\\$?${NUMBER}${UNIT})\\b`).exec(clause);
  const minimum = minimumMatch ? parseNumber(minimumMatch[1]) : null;
  const maximum = maximumMatch ? parseNumber(maximumMatch[1]) : null;
  return minimum == null && maximum == null ? null : { minimum, maximum };
}

function action(feature, operation, value, evidence) {
  const verified = feature === "range_filter" || feature === "screen";
  return { feature, operation, value, capability_state: verified ? "source-verified" : "live-observed-unbound", evidence };
}

function unboundAction(feature, operation, value, evidence) {
  const normalized = normalizeEQSUnboundAction({ feature, operation, value });
  const verified = isEQSLiveDynamicAction(normalized);
  return { ...normalized, capability_state: verified ? "source-verified" : "live-observed-unbound", evidence };
}

function uniqueActions(actions) {
  const seen = new Set();
  return actions.filter(item => {
    const key = `${item.feature}|${item.operation}|${JSON.stringify(item.value)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function explicitListFilters(text, actions) {
  if (/\b(?:u\s*s|us) technology\b/.test(text)) {
    actions.push(unboundAction("list_filter", "add", { field: "HQ Country", items: ["United States"] }, "EQS documented HQ Country list and exact United States option"));
    actions.push(unboundAction("list_filter", "add", { field: "Sector", items: ["Technology"] }, "EQS authenticated Technology sector option"));
  }
  const currencyRaw = /\b(?:currency(?: to| is)?|denominated in|reported in|in)\s+(u\s*s\s*d|euros?|u\s*s dollars?|[a-z]{3})\b/.exec(text)?.[1];
  const currency = currencyRaw == null ? null
    : /^(?:u\s*s\s*d|u\s*s dollars?)$/.test(currencyRaw) ? "USD"
      : /^euros?$/.test(currencyRaw) ? "EUR" : currencyRaw.toUpperCase();
  if (currency) actions.push(unboundAction("list_filter", "add", { field: "Currency", items: [currency] }, "EQS authenticated Add filter menu; values dynamic"));
  const venue = /\b(?:venue|exchange)(?: is)?\s+([a-z0-9.-]{2,12})\b/.exec(text)?.[1]
    ?? /\b(?:listed|trading|traded) on\s+([a-z0-9.-]{2,12})\b/.exec(text)?.[1];
  if (venue) actions.push(unboundAction("list_filter", "add", { field: "Venue", items: [venue.toUpperCase()] }, "EQS authenticated Add filter menu; values dynamic"));
  const country = /\b(?:hq|headquarters?|headquartered) (?:country )?(?:is |in )?([a-z][a-z -]{1,30}?)(?=\s+(?:and|with|where|then|sector|sub sector|market|p e|price|run|primary|hide|show|only public|include|exclude)|$)/.exec(text)?.[1];
  if (country) actions.push(unboundAction("list_filter", "add", { field: "HQ Country", items: [country.trim()] }, "EQS authenticated Add filter menu; values dynamic"));
  const sector = /\bsector\s+(?:(?:is|to)\s+)?([a-z][a-z -]{1,30}?)(?=\s+(?:and|with|where|then|sub sector|market|p e|price|run|primary|hide|show|only public|include|exclude)|$)/.exec(text)?.[1];
  if (sector) actions.push(unboundAction("list_filter", "add", { field: "Sector", items: [sector.trim()] }, "EQS authenticated Add filter menu; values dynamic"));
  const subSector = /\bsub sector\s+(?:(?:is|to)\s+)?([a-z][a-z -]{1,30}?)(?=\s+(?:and|with|where|then|market|p e|price|run|primary|hide|show|only public|include|exclude)|$)/.exec(text)?.[1];
  if (subSector) actions.push(unboundAction("list_filter", "add", { field: "Sub-Sector", items: [subSector.trim()] }, "EQS authenticated Add filter menu; values dynamic"));
}

export function compileEQSFollowup(context, utterance) {
  const command = String(typeof context === "string" ? context : context?.command ?? "").toUpperCase();
  if (command !== "EQS") return null;
  const text = clean(utterance);
  if (!text || text.split(" ").length > 80) return null;
  const actions = [];
  const blockers = [];

  const matches = [];
  for (const [field, pattern] of EQS_RANGE_FIELD_PATTERNS) {
    const match = pattern.exec(text);
    if (match) matches.push({ field, index: match.index });
  }
  if (!matches.some(item => item.field.startsWith("P/E"))) {
    const barePE = /\b(?:p\s*\/?\s*e|price to earnings|pee)\b/.exec(text);
    if (barePE) matches.push({ field: "P/E (TTM)", index: barePE.index });
  }
  matches.sort((left, right) => left.index - right.index);
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const clause = text.slice(current.index, matches[index + 1]?.index ?? text.length);
    const range = rangeFromClause(clause) ?? (matches.length === 1 ? rangeFromClause(text) : null);
    if (range) actions.push(action("range_filter", "add", { field: current.field, ...range }, "EQS exact 20-field menu and range-editor binding; displayed bounds verified"));
    else blockers.push(`${current.field} was named without an exact minimum, maximum, or between range.`);
  }

  explicitListFilters(text, actions);
  const unknownAdd = text.match(/\badd\s+([a-z][a-z -]{1,30}?)(?=\s+(?:and|then|run|apply)\b|$)/);
  if (unknownAdd && !/\b(?:filter|forward|fwd|trailing|ttm|market cap|mkt cap|p ?e|p ?s|p ?b|p ?c ?f|revenue|net income|currency|venue|exchange|country|sector|sub sector)\b/.test(unknownAdd[1])) {
    blockers.push(`Unrecognized EQS add clause: ${unknownAdd[1].trim()}. Name the exact filter and value.`);
  }
  if (/\bprivate compan(?:y|ies)\b|\b(?:public compan(?:y|ies)|public equities) only\b|\bonly (?:public compan(?:y|ies)|public equities)\b/.test(text)) {
    const include = /\b(?:include|show|only|with)\b(?:\s+and\s+\w+)?\s+private compan(?:y|ies)\b/.test(text);
    const exclude = /\b(?:exclude|hide|no|without|public only|only public)\b(?:\s+and\s+\w+)?\s+private compan(?:y|ies)\b/.test(text)
      || /\b(?:public compan(?:y|ies)|public equities) only\b|\bonly (?:public compan(?:y|ies)|public equities)\b/.test(text);
    if (include && exclude) blockers.push("Private Company was requested with conflicting include and exclude states.");
    else actions.push(unboundAction("boolean_filter", "add", { field: "Private Company", value: !exclude }, "EQS authenticated Add filter menu; editor unbound"));
  }
  const primaryOn = /\b(?:primary listings?(?: only)?|only primary listings?)\b/.test(text);
  const primaryOff = /\b(?:include|show|allow) (?:secondary|all) listings?\b|\bturn off primary listings?\b/.test(text);
  if (primaryOn && primaryOff) blockers.push("Primary listings was requested both on and off.");
  else if (primaryOn || primaryOff) actions.push(unboundAction("primary_listings", "select", primaryOn, "EQS documented control; binding unverified"));
  const noTradeOn = /\b(?:hide|exclude|no|without) (?:no[- ]trade|untraded|stale|dead) (?:results?|tickers?|securities)?\b/.test(text);
  const noTradeOff = /\b(?:show|include|allow) (?:no[- ]trade|untraded|stale|dead) (?:results?|tickers?|securities)?\b/.test(text);
  if (noTradeOn && noTradeOff) blockers.push("Hide no trades was requested both on and off.");
  else if (noTradeOn || noTradeOff) {
    actions.push(unboundAction("hide_no_trades", "select", noTradeOn, "EQS documented control; binding unverified"));
  }
  if (/\b(?:clear|reset|remove) (?:all )?(?:the )?(?:screen(?:er)? )?filters?\b|\bclear (?:the )?screen(?:er)?\b/.test(text)) {
    actions.push(action("screen", "clear", null, "EQS documented Run/Clear control; authenticated proof required"));
  }
  if (/\b(?:run|execute|apply) (?:it|this|the )?(?:screen|screener|search)?\b|\bshow (?:me )?(?:the )?results?\b/.test(text)) {
    actions.push(action("screen", "run", null, "EQS documented Run/Clear control; authenticated proof required"));
  }
  if (/\b(?:create|build|make)\b.*\b(?:equity )?screener\b/.test(text)) {
    actions.push(action("screen", "run", null, "EQS create-screen language implies running the completed filter set"));
  }

  const resultActions = uniqueActions(actions);
  if (!resultActions.length && !blockers.length) return null;
  const ready = blockers.length === 0 && resultActions.length > 0
    && resultActions.every(item => item.feature === "range_filter" || item.feature === "screen"
      || isEQSLiveDynamicAction({ feature: item.feature, operation: item.operation, value: item.value }));
  const target = typeof context === "object" ? context.target ?? { mode: "last", command: "EQS", security: null } : { mode: "last", command: "EQS", security: null };
  return {
    kind: "eqs-contextual-workflow-draft",
    command: "EQS",
    target,
    actions: resultActions,
    blockers,
    ready_for_live_executor: ready,
    blocked_reason: ready ? null : "EQS list values other than authenticated USD and Technology, plus boolean and toggle actions, remain outside the executable allowlist until their exact live state bindings are authenticated.",
    configure_step_draft: { id: "configure-eqs-1", kind: "configure", target, actions: resultActions.map(({ feature, operation, value }) => ({ feature, operation, value })), required: true }
  };
}
