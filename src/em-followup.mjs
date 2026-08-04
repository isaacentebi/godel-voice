import { EM_CHART_MODES, EM_DOCUMENTED_METRICS, EM_GROWTH_MODES, EM_SERIES, EM_VALUATIONS, normalizeEMUnboundAction } from "./em-actions.mjs";

const METRIC_PATTERNS = Object.freeze([
  ["Cash Flow From Operations", /\b(?:cfo|cash flow from operations?|operating cash flow)\b/],
  ["Cash Flow From Investing", /\b(?:cfi|cash flow from investing)\b/],
  ["Cash Flow From Financing", /\b(?:cff|cash flow from financing)\b/],
  ["Current Liabilities", /\bcurrent liabilities\b/], ["Current Assets", /\bcurrent assets\b/],
  ["Total Assets", /\btotal assets\b/], ["Shareholder Equity", /\b(?:shareholders?'? equity|book equity)\b/],
  ["Net Income", /\bnet income\b/], ["EPS (GAAP)", /\b(?:eps|e p s)(?: gaap)?\b/],
  ["EBITDA", /\b(?:ebitda|e bit duh|e bit da|ee bit da)\b/], ["Sales", /\b(?:sales|revenue)\b/]
]);
const VALUATION_PATTERNS = Object.freeze([
  ["EV/EBITDA", /\b(?:ev|enterprise value)\s*(?:over|to|divided by|\/)\s*(?:ebitda|e bit duh)\b/],
  ["EV/Sales", /\b(?:ev|enterprise value)\s*(?:over|to|divided by|\/)\s*(?:sales|revenue)\b/],
  ["EV/FCF", /\b(?:ev|enterprise value)\s*(?:over|to|divided by|\/)\s*(?:fcf|free cash flow)\b/],
  ["EV/CF", /\b(?:ev|enterprise value)\s*(?:over|to|divided by|\/)\s*(?:cf|cash flow)\b/],
  ["P/CF", /\b(?:p|price)\s*(?:over|to|divided by|\/)\s*(?:cf|cash flow)\b|\bp cf\b/],
  ["P/E", /\b(?:p|price|pee)\s*(?:over|to|divided by|\/)\s*(?:e|earnings)\b|\b(?:pee|p) e\b/],
  ["P/B", /\b(?:p|price|pee)\s*(?:over|to|divided by|\/)\s*(?:b|book)\b|\b(?:pee|p) b\b/],
  ["P/S", /\b(?:p|price|pee)\s*(?:over|to|divided by|\/)\s*(?:s|sales)\b|\bpee s\b|(?<!\be )\bp s\b/],
  ["Dividend Yield", /\bdividend yield\b/]
]);
function clean(value) {
  return String(value ?? "").toLowerCase()
    .replace(/\byear on year\b/g, "year over year").replace(/\bperiod on period\b/g, "period over period")
    .replace(/\bhistorical actuals?\b/g, "historical").replace(/\bconsensus estimates?\b/g, "estimates")
    .replace(/[^a-z0-9/%.' -]+/g, " ").replace(/\s+/g, " ").trim();
}
function add(blockers, value) { if (!blockers.includes(value)) blockers.push(value); }
function correction(text, patterns) {
  const marker = /\s+(?:no |actually )?(?:sorry|correction)\s+/;
  const parts = text.split(marker);
  if (parts.length < 2) return text;
  const right = parts.at(-1);
  if (!patterns.some(([, pattern]) => pattern.test(right))) return text;
  return right;
}
function hits(text, patterns) { return patterns.filter(([, pattern]) => pattern.test(text)).map(([value]) => value); }
function action(feature, operation, value) { return { feature, operation, value }; }

export function compileEMFollowup(context, utterance) {
  const command = String(typeof context === "string" ? context : context?.command ?? "").toUpperCase();
  if (command !== "EM") return null;
  let text = clean(utterance);
  if (!text || text.split(" ").length > 140) return null;
  const blockers = [];
  const actions = [];
  const current = typeof context === "object" ? context.current_config ?? {} : {};

  const metricText = correction(text, METRIC_PATTERNS);
  let metrics = hits(metricText, METRIC_PATTERNS);
  const valuations = hits(correction(text, VALUATION_PATTERNS), VALUATION_PATTERNS);
  if (valuations.some(row => ["P/S", "EV/Sales"].includes(row))) metrics = metrics.filter(metric => metric !== "Sales");
  if (valuations.includes("EV/EBITDA")) metrics = metrics.filter(metric => metric !== "EBITDA");
  if (new Set(metrics).size > 1) add(blockers, `Conflicting EM metrics were requested: ${[...new Set(metrics)].join(", ")}.`);
  if (new Set(valuations).size > 1) add(blockers, `Conflicting EM valuation rows were requested: ${[...new Set(valuations)].join(", ")}.`);
  if (metrics.length && valuations.length) add(blockers, "EM matrix metrics and valuation-table rows are different surfaces; request one or explicitly separate the steps.");
  if (metrics.length === 1 && !valuations.length) actions.push(action("metric", "select", metrics[0]));

  const growthText = correction(text, [["YoY", /\b(?:yoy|year over year)\b/], ["PoP", /\b(?:pop|period over period|quarter over quarter|qoq)\b/]]);
  const yoy = /\b(?:yoy|year over year)\b/.test(growthText);
  const pop = /\b(?:pop|period over period|quarter over quarter|qoq)\b/.test(growthText);
  if (yoy && pop) add(blockers, "Conflicting EM growth bases were requested: YoY and period-over-period.");
  else if (yoy || pop) actions.push(action("growth", "select", yoy ? "YoY % Growth" : "PoP % Growth"));

  const chartText = correction(text, [["Values", /\b(?:values chart|chart values|plot values|value chart)\b/], ["Growth", /\b(?:growth chart|chart growth|plot growth)\b/]]);
  const valuesChart = /\b(?:values chart|chart values|plot values|value chart)\b/.test(chartText);
  const growthChart = /\b(?:growth chart|chart growth|plot growth)\b/.test(chartText);
  if (valuesChart && growthChart) add(blockers, "Conflicting EM chart modes were requested: Values and Growth.");
  else if (valuesChart || growthChart) actions.push(action("chart", "select", valuesChart ? "Values Chart" : "Growth Chart"));

  const seriesOps = [];
  const historicalOnly = /\b(?:historical only|only historical)\b/.test(text);
  const estimatesOnly = /\b(?:estimates only|only estimates)\b/.test(text);
  if (historicalOnly && estimatesOnly) add(blockers, "Conflicting EM series-only states were requested.");
  else if (historicalOnly) seriesOps.push(["Historical", "show"], ["Estimates", "hide"]);
  else if (estimatesOnly) seriesOps.push(["Historical", "hide"], ["Estimates", "show"]);
  else {
    for (const [series, word] of [["Historical", "historical"], ["Estimates", "estimates"]]) {
      const show = new RegExp(`\\b(?:show|include|with) ${word}\\b`).test(text);
      const hide = new RegExp(`\\b(?:hide|exclude|without) ${word}\\b`).test(text);
      if (show && hide) add(blockers, `EM ${series} was requested both shown and hidden.`);
      else if (show || hide) seriesOps.push([series, show ? "show" : "hide"]);
    }
    if (/\b(?:historical (?:and|versus|vs) estimates|actuals? (?:and|versus|vs) estimates)\b/.test(text)) {
      seriesOps.push(["Historical", "show"], ["Estimates", "show"]);
    }
  }
  const uniqueSeries = new Map();
  for (const [series, operation] of seriesOps) {
    if (uniqueSeries.has(series) && uniqueSeries.get(series) !== operation) add(blockers, `EM ${series} has contradictory visibility requests.`);
    uniqueSeries.set(series, operation);
  }
  for (const [series, operation] of uniqueSeries) actions.push(action("series", operation, series));

  if (valuations.length === 1 && !metrics.length) {
    const row = valuations[0];
    actions.push(action("valuation", "read", { row, section: "Multiples", semantic_unit: row === "Dividend Yield" ? "Percent" : "Multiple" }));
  }
  if (/\b(?:percent|percentage)\b/.test(text) && valuations.length === 1 && valuations[0] !== "Dividend Yield") {
    add(blockers, `${valuations[0]} is a valuation multiple in EM, not a percentage.`);
  }
  if (/\b(?:times|multiple|multiples|x)\b/.test(text) && valuations[0] === "Dividend Yield") {
    add(blockers, "Dividend Yield is a percentage in EM, not a valuation multiple.");
  }

  for (let index = 0; index < actions.length; index++) {
    if (actions[index].feature === "metric") continue;
    try { actions[index] = normalizeEMUnboundAction(actions[index]); } catch (error) { add(blockers, error.message); }
  }
  if (!actions.length && !blockers.length) return null;
  const target = typeof context === "object" ? context.target ?? { mode: "last", command: "EM", security: null } : { mode: "last", command: "EM", security: null };
  const liveOnly = actions.length > 0 && actions.every(item => ["metric", "valuation"].includes(item.feature)) && blockers.length === 0;
  return {
    kind: "em-contextual-workflow-draft", command: "EM", target, actions, blockers,
    ready_for_live_executor: liveOnly,
    blocked_reason: liveOnly ? null : "EM metric selection and exact Multiples-table reads are live-proven; growth, chart, and series controls remain disabled pending exact postconditions.",
    configure_step_draft: blockers.length ? null : { id: "configure-em-1", kind: "configure", target, actions, required: true },
    current_config_preserved: current
  };
}
