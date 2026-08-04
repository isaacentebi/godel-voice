import { compileGChartVoice } from "./g-chart-followup.mjs";
import { compileOMONVoice } from "./omon-followup.mjs";

const COMMAND_ALIASES = new Map([
  ["G", "G"], ["CHART", "G"],
  ["GF", "GF"], ["FUNDAMENTALS", "GF"], ["FUNDAMENTALS GRAPH", "GF"],
  ["HP", "HP"], ["HISTORICAL PRICES", "HP"],
  ["FA", "FA"], ["FINANCIALS", "FA"], ["FINANCIAL STATEMENTS", "FA"],
  ["OMON", "OMON"], ["OPT", "OMON"], ["OPTION CHAIN", "OMON"], ["CALL", "OMON"], ["PUT", "OMON"]
]);

const COMMON_SECURITIES = new Map([
  ["amazon", "AMZN"], ["meta", "META"], ["facebook", "META"],
  ["microsoft", "MSFT"], ["apple", "AAPL"], ["nvidia", "NVDA"],
  ["tesla", "TSLA"], ["alphabet", "GOOG"], ["google", "GOOG"], ["oracle", "ORCL"]
]);

const NUMBER_WORDS = new Map([
  ["one", 1], ["two", 2], ["three", 3], ["four", 4], ["five", 5], ["six", 6],
  ["seven", 7], ["eight", 8], ["nine", 9], ["ten", 10], ["eleven", 11], ["twelve", 12],
  ["fifteen", 15], ["twenty", 20], ["twenty five", 25], ["thirty", 30],
  ["thirty five", 35], ["forty", 40], ["forty five", 45], ["fifty", 50]
]);

const GF_METRICS = [
  ["r and d as percent of revenue", "R&D as % of Revenue", "margin metric"],
  ["r d as percent of revenue", "R&D as % of Revenue", "margin metric"],
  ["s g and a as percent of revenue", "SG&A as % of Revenue", "margin metric"],
  ["return on equity", "Return on Equity", "margin metric"],
  ["operating margin", "Operating Margin", "margin metric"],
  ["gross margin", "Gross Margin", "margin metric"],
  ["net margin", "Net Margin", "margin metric"],
  ["price to cash flow", "P/CF", "ratio metric"],
  ["price to sales", "P/S", "ratio metric"],
  ["price to book", "P/B", "ratio metric"],
  ["price earnings", "P/E", "ratio metric"],
  ["p/e", "P/E", "ratio metric"], ["pe", "P/E", "ratio metric"],
  ["p/s", "P/S", "ratio metric"], ["ps", "P/S", "ratio metric"],
  ["p/b", "P/B", "ratio metric"], ["pb", "P/B", "ratio metric"],
  ["p/cf", "P/CF", "ratio metric"], ["pcf", "P/CF", "ratio metric"],
  ["p e", "P/E", "ratio metric"], ["p s", "P/S", "ratio metric"],
  ["p b", "P/B", "ratio metric"], ["p cf", "P/CF", "ratio metric"],
  ["revenue", "Revenue", "add metric"]
];

const OMON_GREEKS = ["Delta", "Gamma", "Vega", "Theta", "Rho", "Lambda", "Epsilon"];

function clean(value) {
  return String(value ?? "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9%./ -]+/g, " ").replace(/\s+/g, " ").trim();
}

function canonicalCommand(context) {
  const raw = typeof context === "string" ? context : context?.command;
  return COMMAND_ALIASES.get(String(raw ?? "").trim().toUpperCase()) ?? null;
}

function action(feature, operation, value, capabilityState, evidence) {
  return { feature, operation, value, capability_state: capabilityState, evidence };
}

function numberFrom(value) {
  const normalized = clean(value);
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return NUMBER_WORDS.get(normalized) ?? null;
}

function rangeFromText(text, values) {
  for (const [pattern, value] of values) if (pattern.test(text)) return value;
  return null;
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

function parseG(text, actions, blockers, context, original) {
  const candidate = compileGChartVoice(typeof context === "object" ? { ...context, command: "G" } : { command: "G" }, original);
  if (!candidate) return;
  for (const item of candidate.actions) {
    actions.push(action(item.feature, item.operation, item.value,
      item.feature === "resolution" && item.value === "1h" ? "live-verified"
        : item.feature === "alert" || item.feature === "layout save" ? "documented-unbound-confirmation-gated" : "documented-unbound",
      item.feature === "resolution" && item.value === "1h" ? "live-ui:2026-08-04; exact popup plus chart-image label"
        : item.feature === "snapshot" ? "G docs; artifact gate not wired" : "G docs"));
  }
  blockers.push(...candidate.blockers.filter(value => !/runtime-disabled pending live proof/.test(value)));
}

function parseGF(text, actions, blockers) {
  if (/\bquarterly\b/.test(text)) actions.push(action("periodicity", "select", "Quarterly", "source-verified", "extension/main-world.js#setGFPairControl"));
  if (/\bannual(?:ly)?\b|\byearly\b/.test(text)) actions.push(action("periodicity", "select", "Annual", "source-verified", "extension/main-world.js#setGFPairControl"));
  const range = rangeFromText(text, [
    [/\bone year\b|\b1y\b/, "1Y"], [/\bthree years?\b|\b3y\b/, "3Y"],
    [/\bfive years?\b|\b5y\b/, "5Y"], [/\bten years?\b|\b10y\b/, "10Y"],
    [/\bmax(?:imum)?\b|\ball time\b/, "Max"]
  ]);
  if (range) actions.push(action("range", "select", range, "source-verified", "extension/main-world.js#setRange"));
  if (/\bsplit\b/.test(text)) actions.push(action("layout", "select", "Split", "source-verified", "extension/main-world.js#setGFPairControl"));
  else if (/\boverlay\b/.test(text)) actions.push(action("layout", "select", "Overlay", "source-verified", "extension/main-world.js#setGFPairControl"));
  const currency = rangeFromText(text, [
    [/\b(?:euros?|eur)\b/, "EUR"], [/\b(?:pounds?|sterling|gbp)\b/, "GBP"],
    [/\b(?:yen|jpy)\b/, "JPY"], [/\b(?:canadian dollars?|cad)\b/, "CAD"],
    [/\b(?:australian dollars?|aud)\b/, "AUD"], [/\b(?:u s dollars?|usd)\b/, "USD"]
  ]);
  if (currency) actions.push(action("display currency", "select", currency, "source-verified", "extension/main-world.js#setGFDisplayCurrency"));
  if (/\b(?:include|show|turn on|with) (?:consensus )?estimates?\b/.test(text)) {
    actions.push(action("include consensus estimates", "select", "on", "source-verified", "extension/main-world.js#setEstimates"));
  }
  if (/\b(?:hide|exclude|turn off|without) (?:consensus )?estimates?\b/.test(text)) {
    actions.push(action("include consensus estimates", "select", "off", "source-verified", "extension/main-world.js#setEstimates"));
  }
  for (const [phrase, value, feature] of GF_METRICS) {
    if (new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text)) {
      if (value === "P/E" && /\bforward\b|\bfwd\b|\btrailing\b|\bttm\b/.test(text)) {
        blockers.push("GF exposes P/E without a verified forward-versus-trailing label; use EM or ERN for forward P/E.");
      } else {
        actions.push(action(feature, "add", value, "source-verified-data-dependent", "extension/main-world.js#addMetric"));
      }
      break;
    }
  }
  if (/\badd\b/.test(text)) {
    for (const [name, ticker] of COMMON_SECURITIES) {
      if (new RegExp(`\\b${name}\\b`).test(text)) {
        actions.push(action("add company", "add", ticker, "source-verified", "extension/main-world.js#addCompany"));
      }
    }
    const explicitTicker = /\badd ticker ([a-z]{1,5})(?=\s|$)/.exec(text)?.[1];
    if (explicitTicker && !COMMON_SECURITIES.has(explicitTicker)) {
      actions.push(action("add company", "add", explicitTicker.toUpperCase(), "source-verified", "extension/main-world.js#addCompany"));
    }
  }
  if (/\b(?:export|download)\b/.test(text)) {
    actions.push(action("export", "open", "native chooser", "live-observed-unbound", "GF chooser observed; artifact unverified"));
  }
}

function parseHP(text, actions) {
  const resolution = rangeFromText(text, [
    [/\b(?:one|1)[ -]?minute\b|\bminute(?:ly)?\b/, "1M"],
    [/\b(?:one|1)[ -]?hour\b|\bhourly\b/, "1H"],
    [/\b(?:one|1)[ -]?day\b|\bdaily\b/, "1D"]
  ]);
  if (resolution) actions.push(action("resolution", "select", resolution, "documented-unbound", "HP docs"));
  if (/\bnext page\b/.test(text)) actions.push(action("page", "select", "Next", "documented-unbound", "HP docs"));
  if (/\bprevious page\b|\bgo back a page\b/.test(text)) actions.push(action("page", "select", "Previous", "documented-unbound", "HP docs"));
  const format = /\bjson\b/.test(text) ? "JSON" : /\bexcel\b|\bxlsx\b/.test(text) ? "Excel" : null;
  if (/\b(?:export|download)\b/.test(text) && format) {
    actions.push(action("export", "download", format, "documented-unbound", "HP docs; artifact gate not wired"));
  }
}

function parseFA(text, actions) {
  for (const [pattern, value] of [
    [/\bincome statement\b/, "Income Statement"], [/\bbalance sheet\b/, "Balance Sheet"],
    [/\bcash ?flow(?: statement)?\b/, "Cash Flow"]
  ]) if (pattern.test(text)) { actions.push(action("statement", "select", value, "documented-unbound", "FA docs")); break; }
  if (/\bquarterly\b/.test(text)) actions.push(action("periodicity", "select", "Quarterly", "documented-unbound", "FA docs"));
  if (/\bannual(?:ly)?\b|\byearly\b/.test(text)) actions.push(action("periodicity", "select", "Yearly", "documented-unbound", "FA docs"));
  const format = /\bjson\b/.test(text) ? "JSON" : /\bexcel\b|\bxlsx\b/.test(text) ? "Excel" : null;
  if (/\b(?:export|download)\b/.test(text) && format) {
    actions.push(action("export", "download", format, "documented-unbound", "FA docs; artifact gate not wired"));
  }
}

function parseOMON(text, actions, blockers, context, original) {
  const candidate = compileOMONVoice(typeof context === "object"
    ? { ...context, existing_panel_authenticated: Boolean(context.target) }
    : {}, original);
  if (!candidate) return;
  for (const item of candidate.actions) {
    const state = item.feature === "strike depth" ? "live-verified"
      : ["expiration", "columns"].includes(item.feature) ? "blocked-live-vocabulary" : "documented-unbound";
    actions.push(action(item.feature, item.operation, item.value, state,
      item.feature === "strike depth" ? "OMON native strike-depth slider" : "OMON docs"));
  }
  blockers.push(...candidate.blockers);
  if (!candidate.actions.some(item => item.feature === "contract")
    && candidate.blockers.some(value => /contract handoff requires/.test(value))) {
    const destination = /\bblack scholes\b|\bovme\b/.test(text) ? "OVME"
      : /\b(?:in|to|into) (?:a |the )?chart\b/.test(text) ? "G"
        : /\b(?:in|to|into) focus\b/.test(text) ? "FOCUS" : null;
    if (destination) actions.push(action("contract", "open", destination, "documented-unbound", "OMON docs; exact selected row still required"));
  }
}

export function compileChartOptionsFollowup(context, utterance) {
  const command = canonicalCommand(context);
  if (!command) return null;
  const text = clean(utterance);
  if (!text || text.split(" ").length > 40) return null;
  const actions = [];
  const blockers = [];
  if (command === "G") parseG(text, actions, blockers, context, utterance);
  else if (command === "GF") parseGF(text, actions, blockers);
  else if (command === "HP") parseHP(text, actions, blockers);
  else if (command === "FA") parseFA(text, actions, blockers);
  else if (command === "OMON") parseOMON(text, actions, blockers, context, utterance);
  let resultActions = uniqueActions(actions);
  if (command === "GF") {
    const priority = item => item.feature === "add company" ? 0
      : ["add metric", "margin metric", "ratio metric"].includes(item.feature) ? 2
        : item.feature === "export" ? 3 : 1;
    resultActions = resultActions
      .map((item, index) => ({ item, index }))
      .sort((left, right) => priority(left.item) - priority(right.item) || left.index - right.index)
      .map(entry => entry.item);
  }
  if (!resultActions.length && !blockers.length) return null;
  let executableActions = resultActions.filter(item => item.capability_state.startsWith("source-verified")
    || item.capability_state === "live-verified");
  const unboundActions = resultActions.filter(item => !executableActions.includes(item));
  if (["G", "OMON"].includes(command) && (blockers.length > 0 || unboundActions.length > 0)) executableActions = [];
  return {
    kind: "contextual-followup-candidate",
    command,
    target: typeof context === "object" ? context.target ?? { mode: "last" } : { mode: "last" },
    actions: resultActions,
    executable_actions: executableActions,
    unbound_actions: unboundActions,
    blockers,
    ready_for_live_executor: blockers.length === 0 && unboundActions.length === 0 && executableActions.length > 0
  };
}

export const chartOptionsCommands = Object.freeze(["G", "GF", "HP", "FA", "OMON"]);
export const chartOptionsAliases = Object.freeze(Object.fromEntries(COMMAND_ALIASES));
