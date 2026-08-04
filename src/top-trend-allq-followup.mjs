export const TREND_TIMEFRAMES = Object.freeze(["1H", "24H", "WEEK", "MONTH"]);
export const ALLQ_DESTINATIONS = Object.freeze(["Q", "G", "DES", "FOCUS", "OMON"]);

function clean(value) {
  return String(value ?? "").toLowerCase()
    .replace(/\brooters?\b/g, "reuters").replace(/\ball coats?\b/g, "all quotes")
    .replace(/\btrendin\b/g, "trending").replace(/[^a-z0-9.,/&+ -]+/g, " ")
    .replace(/\s+/g, " ").trim();
}

function corrected(value) {
  return clean(value).split(/\b(?:wait no|no sorry|actually|scratch that|i mean|rather)\b/).at(-1).trim();
}

function ordinal(text) {
  const words = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15 };
  for (const [word, value] of Object.entries(words)) if (new RegExp(`\\b${word}\\b`).test(text)) return value;
  const match = text.match(/\b(?:number|rank) (\d{1,2})\b|\b(\d{1,2})(?:st|nd|rd|th)\b/);
  return match ? Number(match[1] ?? match[2]) : null;
}

function validArticle(item) {
  return item && typeof item === "object" && String(item.id ?? "").trim()
    && Number.isInteger(Number(item.rank)) && Number(item.rank) >= 1 && Number(item.rank) <= 15
    && String(item.headline ?? "").trim() && String(item.source ?? "").trim() && String(item.time ?? "").trim();
}

function articleIdentity(item) {
  return { id: String(item.id), rank: Number(item.rank), headline: String(item.headline), source: String(item.source), time: String(item.time) };
}

function resolveArticle(context, text, blockers) {
  const articles = (context.live_articles ?? []).filter(validArticle);
  const position = ordinal(text);
  if (position != null) {
    const matches = articles.filter(item => Number(item.rank) === position);
    if (matches.length === 1) return articleIdentity(matches[0]);
    blockers.push(`TOP rank ${position} requires one exact live article identity`);
    return null;
  }
  if (/\b(?:this|selected|current) (?:story|article|headline)\b/.test(text)) {
    if (validArticle(context.selected_article)) return articleIdentity(context.selected_article);
    blockers.push("TOP selected-story language requires one exact selected live article identity");
    return null;
  }
  blockers.push("TOP article opening requires an exact rank or selected live article identity");
  return null;
}

export function groundedTOPFact(context = {}, article = context.selected_article) {
  if (!validArticle(article) || article.observed !== true || article.panel !== "TOP") return null;
  return articleIdentity(article);
}

export function compileTOPVoice(context = {}, utterance) {
  const text = corrected(utterance);
  if (!text || text.split(" ").length > 80) return null;
  if (!/\b(?:open|read|show|select)\b/.test(text)) return null;
  if (/\b(?:external|outside|browser|new tab|website|reuters site)\b/.test(text)) return {
    kind: "blocked", command: "TOP", actions: [], executable_actions: [],
    blockers: ["TOP voice opens only Godel's internal reader; external news navigation requires a separate explicit verified flow"], ready_for_live_executor: false
  };
  const blockers = [];
  const article = resolveArticle(context, text, blockers);
  if (!article) return { kind: "clarify", command: "TOP", actions: [], executable_actions: [], blockers, grounded_fact: null, ready_for_live_executor: false };
  return {
    kind: "candidate", command: "TOP",
    actions: [{ feature: "article", operation: "open", value: article, scope: "reader" }],
    executable_actions: [], blockers: ["TOP reader opening is runtime-disabled pending exact live proof"],
    grounded_fact: groundedTOPFact(context, context.live_articles?.find(item => String(item.id) === article.id)), ready_for_live_executor: false
  };
}

export function compileTRENDVoice(context = {}, utterance) {
  const text = corrected(utterance);
  if (!text || text.split(" ").length > 80) return null;
  const matches = [];
  for (const [value, pattern] of [
    ["1H", /\b(?:last |past )?(?:one|1) hour\b|\b1h\b/],
    ["24H", /\b(?:last |past )?(?:twenty four|24) hours?\b|\b24h\b|\btoday\b/],
    ["WEEK", /\b(?:this|last|past) week\b|\bweekly\b/],
    ["MONTH", /\b(?:this|last|past) month\b|\bmonthly\b/]
  ]) if (pattern.test(text)) matches.push(value);
  if (new Set(matches).size > 1) return { kind: "clarify", command: "TREND", actions: [], executable_actions: [], blockers: ["TREND timeframe has conflicting values"], desired_state: context.current_state ?? {}, ready_for_live_executor: false };
  const timeframe = matches[0] ?? null;
  const refresh = /\b(?:refresh|reload|update) (?:now|it|this|trends?|trending)?\b/.test(text);
  if (!timeframe && !refresh) return null;
  if (context.paid_subscription === false) return { kind: "blocked", command: "TREND", actions: [], executable_actions: [], blockers: ["TREND requires the documented paid subscription entitlement"], desired_state: context.current_state ?? {}, ready_for_live_executor: false };
  const actions = [];
  if (timeframe) actions.push({ feature: "timeframe", operation: "select", value: timeframe, scope: "panel" });
  if (refresh) actions.push({ feature: "refresh", operation: "refresh", value: null, scope: "panel" });
  return {
    kind: "candidate", command: "TREND", actions, executable_actions: [],
    blockers: ["TREND controls are runtime-disabled pending exact live proof"],
    desired_state: { ...(context.current_state ?? {}), ...(timeframe ? { timeframe } : {}) }, ready_for_live_executor: false
  };
}

function validQuote(item) {
  return item && typeof item === "object" && String(item.id ?? "").trim()
    && /^[A-Z][A-Z0-9.-]{0,9}$/.test(String(item.ticker ?? "")) && String(item.venue ?? "").trim();
}

function quoteIdentity(item) {
  return { id: String(item.id), ticker: String(item.ticker), venue: String(item.venue), active: item.active === true };
}

function destinationMatches(text) {
  const result = [];
  if (/\b(?:quote|q panel)\b/.test(text)) result.push("Q");
  if (/\bchart\b/.test(text)) result.push("G");
  if (/\b(?:description|company description|des)\b/.test(text)) result.push("DES");
  if (/\bfocus\b/.test(text)) result.push("FOCUS");
  if (/\b(?:option chain|options chain|omon)\b/.test(text)) result.push("OMON");
  return [...new Set(result)];
}

export function compileALLQVoice(context = {}, utterance) {
  const text = corrected(utterance);
  if (!text || text.split(" ").length > 80) return null;
  const contradictions = [];
  const blockers = [];
  const activeOn = /\b(?:active (?:all )?quotes? only|only active quotes?|show active (?:all )?quotes?)\b/.test(text);
  const explicitActiveOff = /\b(?:show inactive quotes?|include inactive quotes?|turn off active quotes? only)\b/.test(text);
  const activeOff = explicitActiveOff || (!activeOn && /\b(?:show )?all quotes?\b/.test(text));
  if (activeOn && activeOff) contradictions.push("ALLQ active-only filter cannot be both on and off");
  const destinations = destinationMatches(text);
  const handoffIntent = /\b(?:open|send|show)\b/.test(text) && destinations.length > 0;
  let quote = null;
  if (handoffIntent) {
    if (validQuote(context.selected_quote)) quote = quoteIdentity(context.selected_quote);
    else blockers.push("ALLQ handoff requires one exact selected live quote identity with id, ticker, and venue");
  }
  if (contradictions.length) return { kind: "clarify", command: "ALLQ", actions: [], executable_actions: [], blockers: contradictions, desired_state: context.current_state ?? {}, ready_for_live_executor: false };
  if (!activeOn && !activeOff && !handoffIntent) return null;
  if (blockers.length) return { kind: "clarify", command: "ALLQ", actions: [], executable_actions: [], blockers, desired_state: context.current_state ?? {}, ready_for_live_executor: false };
  const actions = [];
  if (activeOn || activeOff) actions.push({ feature: "active quotes only", operation: "select", value: activeOn ? "on" : "off", scope: "panel" });
  if (quote) for (const destination of destinations) actions.push({ feature: "row context action", operation: "open", value: { destination, quote }, scope: "selected-row" });
  return {
    kind: "candidate", command: "ALLQ", actions, executable_actions: [],
    blockers: ["ALLQ nested controls are runtime-disabled pending exact live proof"],
    desired_state: { ...(context.current_state ?? {}), ...(activeOn || activeOff ? { active_only: activeOn } : {}) }, ready_for_live_executor: false
  };
}

export function compileTopTrendAllQVoice(context = {}, utterance) {
  const command = String(context?.command ?? context ?? "").toUpperCase();
  if (command === "TOP") return compileTOPVoice(typeof context === "object" ? context : {}, utterance);
  if (command === "TREND") return compileTRENDVoice(typeof context === "object" ? context : {}, utterance);
  if (command === "ALLQ") return compileALLQVoice(typeof context === "object" ? context : {}, utterance);
  return null;
}
