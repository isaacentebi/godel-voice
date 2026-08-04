import {
  MOST_RESULT_COUNTS, MOST_SECTORS, normalizeMOSTUnboundAction
} from "./most-actions.mjs";

const NUMBER_WORDS = new Map([
  ["ten", 10], ["twenty five", 25], ["fifty", 50], ["one hundred", 100],
  ["five hundred", 500], ["one", 1], ["two", 2], ["three", 3], ["five", 5], ["twenty", 20]
]);
const NUMBER = "(?:\\d+(?:\\.\\d+)?|one hundred|twenty five|five hundred|one|two|three|five|ten|twenty|fifty)";
const UNIT = "(?:k|thousand|m|mm|million|b|bn|bill|billion|t|tn|trillion)";

const SECTOR_PATTERNS = Object.freeze([
  ["Financial Services", /\b(?:financial services|financials|finance)\b/],
  ["Healthcare", /\b(?:healthcare|health care)\b/],
  ["Technology", /\b(?:technology|tech)\b/],
  ["Industrials", /\bindustrials?\b/],
  ["Consumer Cyclical", /\b(?:consumer cyclical|cyclicals?)\b/],
  ["Basic Materials", /\b(?:basic materials?|materials?)\b/],
  ["Energy", /\benergy\b/],
  ["Real Estate", /\breal estate\b/],
  ["Communication Services", /\b(?:communication services|communications?)\b/],
  ["Consumer Defensive", /\b(?:consumer defensive|defensives?|consumer staples?)\b/],
  ["Utilities", /\butilit(?:y|ies)\b/],
  ["All", /\b(?:all sectors|every sector)\b/]
]);

function clean(value) {
  return String(value ?? "").toLowerCase()
    .replace(/\bmost actives?\b/g, "most active")
    .replace(/\bgay nerds?\b/g, "gainers")
    .replace(/\bloozers?\b/g, "losers")
    .replace(/\bmarket cab\b/g, "market cap")
    .replace(/\btech knology\b/g, "technology")
    .replace(/[^a-z0-9.$ -]+/g, " ").replace(/\s+/g, " ").trim();
}
function number(raw) {
  const text = clean(raw);
  return /^\d/.test(text) ? Number(text) : NUMBER_WORDS.get(text) ?? null;
}
function unit(raw) {
  const text = clean(raw);
  return /^(?:k|thousand)$/.test(text) ? "K" : /^(?:m|mm|million)$/.test(text) ? "M"
    : /^(?:b|bn|bill|billion)$/.test(text) ? "B" : /^(?:t|tn|trillion)$/.test(text) ? "T" : null;
}
function cap(rawValue, rawUnit) {
  const value = number(rawValue);
  const canonicalUnit = unit(rawUnit);
  return value == null || !canonicalUnit ? null : { value, unit: canonicalUnit };
}
function ranking(text, blockers) {
  const corrected = /\b(?:sorry|no wait|rather|i mean)\b/.test(text) ? text.split(/\b(?:sorry|no wait|rather|i mean)\b/).at(-1) : text;
  const matches = [
    ["Gainers", /\b(?:gainers?|winners?|top performers?)\b/],
    ["Losers", /\b(?:losers?|decliners?|worst performers?)\b/],
    ["Value", /\b(?:dollar value|dollar volume|by value|value ranked)\b/],
    ["Active", /\b(?:most active|by (?:share )?volume|share volume|active stocks?)\b/]
  ].filter(([, pattern]) => pattern.test(corrected)).map(([value]) => value);
  const unique = [...new Set(matches)];
  if (unique.length > 1) blockers.push(`Conflicting MOST rankings were requested: ${unique.join(", ")}.`);
  return unique[0] ?? null;
}
function marketCap(text, blockers) {
  const between = new RegExp(`\\bbetween\\s+(\\$?${NUMBER})\\s*(?:${UNIT})?\\s+(?:and|to)\\s+(\\$?${NUMBER})\\s*(${UNIT})\\b`).exec(text);
  if (between) {
    const shared = unit(between[3]);
    const minimum = { value: number(between[1].replace("$", "")), unit: shared };
    const maximum = { value: number(between[2].replace("$", "")), unit: shared };
    if (minimum.value > maximum.value) blockers.push("MOST minimum market cap cannot exceed maximum market cap.");
    return { minimum, maximum };
  }
  const minimumMatch = new RegExp(`\\b(?:above|over|at least|minimum|min(?:imum)? of)\\s+\\$?(${NUMBER})\\s*(${UNIT})\\b`).exec(text);
  const maximumMatch = new RegExp(`\\b(?:below|under|at most|maximum|max(?:imum)? of|no more than)\\s+\\$?(${NUMBER})\\s*(${UNIT})\\b`).exec(text);
  const minimum = minimumMatch ? cap(minimumMatch[1], minimumMatch[2]) : null;
  const maximum = maximumMatch ? cap(maximumMatch[1], maximumMatch[2]) : null;
  if (minimum && maximum) {
    const factors = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
    if (minimum.value * factors[minimum.unit] > maximum.value * factors[maximum.unit]) blockers.push("MOST minimum market cap cannot exceed maximum market cap.");
  }
  return minimum || maximum ? { minimum, maximum } : null;
}

export function compileMOSTFollowup(context, utterance) {
  const command = String(typeof context === "string" ? context : context?.command ?? "").toUpperCase();
  if (command !== "MOST") return null;
  const text = clean(utterance);
  if (!text || text.split(" ").length > 80) return null;
  // The panel's proper name is not itself a request to change its ranking.
  // "...in the most active stocks window" therefore remains a pure count
  // follow-up, while "most active stocks by volume" still requests Active.
  const semanticText = text.replace(/\bmost active stocks? (?:window|panel)\b/g, "").replace(/\s+/g, " ").trim();
  const blockers = [];
  const current = typeof context === "object" && context?.current_config ? context.current_config : {};
  const requestedRanking = ranking(semanticText, blockers);
  const countRaw = new RegExp(`\\b(?:(?:top|show|limit|give me)\\s+(${NUMBER})|(${NUMBER})\\s+(?:results?|stocks?|names?|securities))\\b`).exec(semanticText);
  const countToken = countRaw?.[1] ?? countRaw?.[2];
  const requestedResults = countToken == null ? null : number(countToken);
  if (requestedResults != null && !MOST_RESULT_COUNTS.includes(requestedResults)) blockers.push(`Unsupported MOST result count ${requestedResults}; use exactly 10, 25, 50, or 100.`);
  const caps = marketCap(semanticText, blockers);
  const sectors = SECTOR_PATTERNS.filter(([, pattern]) => pattern.test(semanticText)).map(([value]) => value);
  const uniqueSectors = [...new Set(sectors)];
  if (uniqueSectors.length > 1) blockers.push(`Conflicting MOST sectors were requested: ${uniqueSectors.join(", ")}.`);

  const desired_config = {
    ranking: requestedRanking ?? current.ranking ?? "Active",
    results: requestedResults ?? current.results ?? 10,
    market_cap: caps ?? current.market_cap ?? { minimum: null, maximum: null },
    sector: uniqueSectors[0] ?? current.sector ?? "All"
  };
  const actions = [];
  if (requestedRanking) actions.push({ feature: "ranking", operation: "select", value: requestedRanking });
  if (requestedResults != null && MOST_RESULT_COUNTS.includes(requestedResults)) actions.push({ feature: "results", operation: "select", value: requestedResults });
  if (caps) actions.push({ feature: "market_cap", operation: "set", value: caps });
  if (uniqueSectors.length === 1) actions.push({ feature: "sector", operation: "select", value: uniqueSectors[0] });
  for (const action of actions.filter(item => item.feature !== "results")) {
    try { normalizeMOSTUnboundAction(action); } catch (error) { blockers.push(error.message); }
  }
  if (!actions.length && !blockers.length) return null;
  const executable = actions.filter(item => item.feature === "results");
  const ready = blockers.length === 0 && executable.length === actions.length && executable.length > 0;
  const target = typeof context === "object" ? context.target ?? { mode: "last", command: "MOST", security: null } : { mode: "last", command: "MOST", security: null };
  return {
    kind: "most-contextual-workflow-draft", command: "MOST", target, actions, blockers, desired_config,
    ready_for_live_executor: ready,
    blocked_reason: ready ? null : "MOST ranking, market-cap, and sector actions remain disabled until authenticated native controls and result metadata are live-proven.",
    configure_step_draft: blockers.length ? null : { id: "configure-most-1", kind: "configure", target, actions, required: true }
  };
}
