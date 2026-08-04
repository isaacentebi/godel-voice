import { isSECFLiveAction, normalizeSECFUnboundAction, SECF_RESULT_CAPS, SECF_TABS } from "./secf-actions.mjs";

const NUMBER_WORDS = Object.freeze({
  fifty: 50, "one hundred": 100, "a hundred": 100,
  "two fifty": 250, "two hundred fifty": 250, "two hundred and fifty": 250,
  "five hundred": 500
});

const TAB_PATTERNS = Object.freeze([
  ["Corporate Bonds", /\b(?:corporate|company|corp(?:orate)?) bonds?\b/],
  ["Sovereign Bonds", /\b(?:sovereign|government|gov(?:ernment)?) bonds?\b/],
  ["Equities", /\b(?:equities|equity|stocks?|shares?)\b/],
  ["Options", /\b(?:options?|option contracts?)\b/],
  ["Crypto", /\b(?:crypto(?:currenc(?:y|ies))?|digital assets?)\b/],
  ["Index", /\b(?:indices|indexes|index)\b/],
  ["Futures", /\b(?:futures?|future contracts?)\b/],
  ["Forex", /\b(?:forex|f x|foreign exchange|currenc(?:y|ies))\b/],
  ["People", /\b(?:people|persons?|contacts?|executives?|employees?)\b/],
  ["All", /\b(?:all (?:asset classes|instruments|securities)|everything)\b/]
]);

function clean(value) {
  return String(value ?? "").toLowerCase()
    .replace(/\bsecurit(?:y|ies) (?:finder|find her|find are)\b/g, "securities finder")
    .replace(/\bno tra(?:y|i)(?:d|de|t|te|s|se)s?\b/g, "no trades")
    .replace(/\bcorporal bonds?\b/g, "corporate bonds")
    .replace(/\bsovereign(?:s)? bonds?\b/g, "sovereign bonds")
    .replace(/[^a-z0-9' -]+/g, " ").replace(/\s+/g, " ").trim();
}

function listAfter(text, pattern) {
  const match = pattern.exec(text);
  if (!match) return [];
  return match[1].split(/\s*(?:,|\band\b|\bor\b)\s*/).map(item => item.trim()).filter(Boolean);
}

function parseCap(text, blockers) {
  const raw = /\b(?:max(?:imum)?|limit|cap|top|up to|show)\s+(\d+|five hundred|two hundred(?: and)? fifty|two fifty|one hundred|a hundred|fifty)\b/.exec(text)?.[1];
  if (!raw) return null;
  const max = /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw];
  if (!SECF_RESULT_CAPS.includes(max)) blockers.push(`SECF result cap ${max} is unsupported; use exactly 50, 100, 250, or 500.`);
  return max;
}

function parseQuery(text) {
  const quoted = /\b(?:query|search(?: for)?|find|look for)\s+['"]([^'"]{1,200})['"]/.exec(text)?.[1];
  if (quoted) return quoted.trim();
  const match = /\b(?:query|search(?: for)?|find|look for)\s+(.+)$/.exec(text);
  if (!match) return null;
  const tail = match[1];
  const boundaries = [
    ...TAB_PATTERNS.map(([, pattern]) => pattern.exec(tail)?.index),
    /\b(?:max(?:imum)?|limit|cap|top|up to)\s+/.exec(tail)?.index,
    /\b(?:venues?|exchanges?|countries?|country)\s+/.exec(tail)?.index,
    /\bon\s+[a-z0-9.-]+\s+(?:venue|exchange)\b/.exec(tail)?.index,
    /\b(?:hide|exclude|without|show|include|allow)\s+(?:anything with )?no trades?\b/.exec(tail)?.index
  ].filter(Number.isInteger);
  return tail.slice(0, boundaries.length ? Math.min(...boundaries) : tail.length).replace(/\b(?:across|in)\s*$/g, "").trim();
}

export function compileSECFFollowup(context, utterance) {
  const command = String(typeof context === "string" ? context : context?.command ?? "").toUpperCase();
  if (command !== "SECF") return null;
  const text = clean(utterance);
  if (!text || text.split(" ").length > 100) return null;
  const blockers = [];
  const current = typeof context === "object" && context?.current_config ? context.current_config : {};

  const tabs = TAB_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([tab]) => tab);
  const uniqueTabs = [...new Set(tabs)];
  if (uniqueTabs.length > 1) blockers.push(`Conflicting SECF tabs were requested: ${uniqueTabs.join(", ")}.`);
  const tab = uniqueTabs[0] ?? current.tab ?? "All";

  const parsedCap = parseCap(text, blockers);
  const max = parsedCap ?? current.max ?? 50;
  const venues = [...new Set(listAfter(text, /\b(?:venues?|exchanges?)\s+(?:is |are )?([a-z0-9 .&'-]+?)(?=\s+(?:countries?|country|hide|exclude|without|show|include|allow|max|limit|cap|top|up to)\b|$)/)
    .concat(listAfter(text, /\bon\s+([a-z0-9.-]+)(?=\s+(?:venue|exchange)\b|$)/))
    .filter(item => !/^(?:max|maximum|limit|cap|top|up to)\b/.test(item)))];
  const countries = listAfter(text, /\b(?:countries?|country)\s+(?:is |are )?([a-z .'-]+?)(?=\s+(?:venues?|exchanges?|hide|exclude|without|show|include|allow|max|limit|cap|top|up to)\b|$)/);

  const hideOn = /\b(?:hide|exclude|without)\s+(?:anything with )?no trades?\b|\bhide untraded\b/.test(text);
  const hideOff = /\b(?:show|include|allow)\s+(?:anything with )?no trades?\b|\bshow untraded\b/.test(text);
  if (hideOn && hideOff) blockers.push("No-trade results were requested both hidden and shown.");
  const hideNoTrade = hideOn ? true : hideOff ? false : current.hide_no_trade ?? false;
  const query = parseQuery(text) ?? current.query ?? "";
  const value = {
    query, tab, max,
    venues: venues.length ? venues : current.venues ?? [],
    countries: countries.length ? countries : current.countries ?? [],
    hide_no_trade: hideNoTrade
  };

  let normalized = null;
  try { normalized = normalizeSECFUnboundAction({ feature: "search", operation: "configure", value }); }
  catch (error) { blockers.push(error.message); }
  if (!normalized && !blockers.length) return null;
  const target = typeof context === "object" ? context.target ?? { mode: "last", command: "SECF", security: null } : { mode: "last", command: "SECF", security: null };
  return {
    kind: "secf-contextual-workflow-draft",
    command: "SECF",
    target,
    action: normalized,
    blockers: [...new Set(blockers)],
    ready_for_live_executor: Boolean(normalized && blockers.length === 0 && isSECFLiveAction(normalized)),
    blocked_reason: normalized && blockers.length === 0 && isSECFLiveAction(normalized) ? null : "SECF is live-enabled only for exact People searches with a documented result cap and no venue, country, or no-trade filters. Other tabs and dynamic filters remain disabled.",
    configure_step_draft: normalized ? { id: "configure-secf-1", kind: "configure", target, actions: [normalized], required: true } : null,
    documented_tabs: SECF_TABS,
    documented_result_caps: SECF_RESULT_CAPS
  };
}
