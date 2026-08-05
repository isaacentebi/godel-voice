export const G_RESOLUTIONS = Object.freeze(["1m", "5m", "15m", "30m", "1h", "1d"]);
export const G_RANGES = Object.freeze(["5y", "1y", "6m", "3m", "1m", "5d", "1d"]);
export const G_STYLES = Object.freeze(["Candles", "Bars", "Line", "Area", "Baseline", "Heikin Ashi", "Hollow Candles", "Renko", "Kagi", "Point & Figure", "Line Break"]);
export const G_SCALES = Object.freeze(["linear", "percent", "indexed", "log"]);

export const G_ACTION_STATES = Object.freeze({
  resolution: "live-bounded",
  range: "unbound",
  style: "unbound",
  scale: "unbound",
  compare: "unbound",
  indicator: "unbound",
  "drawings toolbar": "unbound",
  layout: "unbound",
  "layout save": "confirmation-gated",
  snapshot: "unbound",
  alert: "confirmation-gated"
});

function clean(value) {
  return String(value ?? "").toLowerCase()
    .replace(/\bhi+kin as+hy+\b|\bhe can ash[ei]\b/g, "heikin ashi")
    .replace(/\bcandle sticks?\b/g, "candles")
    .replace(/\blog a rhythmic\b/g, "logarithmic")
    .replace(/\bpercent age\b/g, "percentage")
    .replace(/[^a-z0-9%.$&/ -]+/g, " ").replace(/\s+/g, " ").trim();
}

function corrected(value) {
  const parts = clean(value).split(/\b(?:wait no|no sorry|actually|scratch that|i mean|rather)\b/);
  return parts.at(-1).trim();
}

function exact(value, options) {
  const wanted = String(value ?? "").trim().toLowerCase();
  const matches = (options ?? []).filter(option => String(option).trim().toLowerCase() === wanted);
  return matches.length === 1 ? matches[0] : null;
}

function validIsoDate(value) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function choose(text, label, choices, contradictions) {
  const matches = choices.filter(choice => choice.pattern.test(text));
  if (matches.length > 1) contradictions.push(`${label} has conflicting values: ${matches.map(item => item.value).join(" and ")}`);
  return matches.length === 1 ? matches[0].value : null;
}

function resolvedCompare(context, requested, blockers) {
  const identities = context?.resolved_securities ?? [];
  const wanted = requested.trim().toLowerCase();
  const matches = identities.filter(item => [item.ticker, item.spoken_name, ...(item.aliases ?? [])]
    .some(value => String(value ?? "").trim().toLowerCase() === wanted));
  if (matches.length !== 1 || !matches[0].ticker) {
    blockers.push(`compare symbol requires one resolved security identity: ${requested}`);
    return null;
  }
  return String(matches[0].ticker).toUpperCase();
}

function dynamicIndicators(context, text, blockers) {
  const match = text.match(/\b(?:add|show|use) (?:the )?(.+?) indicators?\b/);
  if (!match) return [];
  const requested = match[1].split(/\s*(?:,|\band\b)\s*/).map(value => value.trim()).filter(Boolean);
  const result = [];
  for (const name of requested) {
    const live = exact(name, context?.live_indicators);
    if (!live) blockers.push(`Indicator names are a dynamic TradingView vocabulary and cannot be guessed: ${name}`);
    else if (!result.includes(live)) result.push(live);
  }
  return result;
}

export function compileGChartVoice(context = {}, utterance) {
  const command = String(context?.command ?? "G").toUpperCase();
  if (command !== "G") return null;
  const text = corrected(utterance);
  if (!text || text.split(" ").length > 80) return null;
  const actions = [];
  const blockers = [];
  const contradictions = [];

  const resolution = choose(text, "resolution", [
    ["1m", /\b(?:one|1)[ -]?minutes?\b/], ["5m", /\b(?:five|5)[ -]?minutes?\b/],
    ["15m", /\b(?:fifteen|15)[ -]?minutes?\b/], ["30m", /\b(?:thirty|30)[ -]?minutes?\b/],
    ["1h", /\b(?:one|1)[ -]?hour\b|\bhourly\b/], ["1d", /\b(?:one|1)[ -]?day\b|\bdaily\b/]
  ].map(([value, pattern]) => ({ value, pattern })), contradictions);
  if (resolution) actions.push({ feature: "resolution", operation: "select", value: resolution, scope: "chart" });

  const presetRange = choose(text, "range", [
    ["5y", /\bfive years?\b|\b5y\b/], ["1y", /\bone year\b|\b1y\b/],
    ["6m", /\bsix months?\b|\b6m\b/], ["3m", /\bthree months?\b|\b3m\b/],
    ["1m", /\bone month\b/], ["5d", /\bfive days?\b|\b5d\b/], ["1d", /\bone day range\b|\b1d range\b/]
  ].map(([value, pattern]) => ({ value, pattern })), contradictions);
  const custom = text.match(/\b(?:custom range|from) (20\d{2}-\d{2}-\d{2}) (?:to|through) (20\d{2}-\d{2}-\d{2})\b/);
  if (presetRange && custom) contradictions.push("range cannot be both preset and custom");
  if (custom) {
    if (!validIsoDate(custom[1]) || !validIsoDate(custom[2])) contradictions.push("custom chart range requires valid calendar dates");
    else if (Date.parse(custom[1]) > Date.parse(custom[2])) contradictions.push("custom chart range start cannot exceed end");
    else actions.push({ feature: "range", operation: "set", value: { start: custom[1], end: custom[2] }, scope: "chart" });
  } else if (presetRange) actions.push({ feature: "range", operation: "select", value: presetRange, scope: "chart" });
  else if (/\bcustom range\b/.test(text)) blockers.push("custom chart range requires exact YYYY-MM-DD start and end dates");

  const style = choose(text, "style", [
    ["Heikin Ashi", /\bheikin ashi\b/], ["Hollow Candles", /\bhollow candles?\b/],
    ["Point & Figure", /\bpoint and figure\b/], ["Line Break", /\bline break\b/],
    ["Baseline", /\bbaseline\b/], ["Renko", /\brenko\b/], ["Kagi", /\bkagi\b/],
    ["Candles", /\bcandles?\b/], ["Bars", /\bbars?\b/], ["Line", /\bline chart\b/], ["Area", /\barea chart\b/]
  ].map(([value, pattern]) => ({ value, pattern })), contradictions);
  if (style) actions.push({ feature: "style", operation: "select", value: style, scope: "chart" });

  const scale = choose(text, "scale", [
    ["log", /\blog(?:arithmic)?(?: scale)?\b/], ["percent", /\bpercent(?:age)?(?: scale)?\b/],
    ["indexed", /\bindexed(?: to (?:one hundred|100))?(?: scale)?\b/], ["linear", /\blinear(?: scale)?\b/]
  ].map(([value, pattern]) => ({ value, pattern })), contradictions);
  if (scale) actions.push({ feature: "scale", operation: "select", value: scale, scope: "chart" });

  const compare = text.match(/\bcompare(?: (?:this chart|this|the chart))? (?:with|against|to) (.+?)(?=\s+(?:and|on|for|using|with)\b|$)/)?.[1];
  if (compare) {
    const ticker = resolvedCompare(context, compare, blockers);
    if (ticker) actions.push({ feature: "compare", operation: "add", value: ticker, scope: "chart" });
  }
  for (const indicator of dynamicIndicators(context, text, blockers)) {
    actions.push({ feature: "indicator", operation: "add", value: indicator, scope: "chart" });
  }

  const drawingsShow = /\b(?:show|open|enable) (?:the )?drawings? toolbar\b/.test(text);
  const drawingsHide = /\b(?:hide|close|disable) (?:the )?drawings? toolbar\b/.test(text);
  if (drawingsShow && drawingsHide) contradictions.push("drawings toolbar cannot be both Show and Hide");
  else if (drawingsShow || drawingsHide) actions.push({ feature: "drawings toolbar", operation: "select", value: drawingsShow ? "Show" : "Hide", scope: "chart" });

  const layoutMatch = text.match(/\b(?:open|use|switch to|load) (?:the )?(.+?) (?:chart )?layout\b/);
  if (layoutMatch) {
    const layout = exact(layoutMatch[1], context?.live_layouts);
    if (!layout) blockers.push(`chart layout requires an exact live layout name: ${layoutMatch[1]}`);
    else actions.push({ feature: "layout", operation: "select", value: layout, scope: "chart" });
  }
  const saveLayout = /\bsave (?:(?:this|the) )?(?:current )?(?:chart )?layout\b/.test(text);
  if (saveLayout) actions.push({ feature: "layout save", operation: "save", value: "Current", scope: "account" });
  const snapshot = /\b(?:take|download|export|save) (?:a |the |this )?(?:chart )?(?:snapshot|screenshot)\b/.test(text);
  if (snapshot) actions.push({ feature: "snapshot", operation: "download", value: "PNG", scope: "artifact" });
  if (/\bsave (?:this|the) chart\b/.test(text) && !saveLayout && !snapshot) contradictions.push("say whether to save the chart layout or a snapshot");

  const alert = text.match(/\b(?:create|add|set) (?:a |an )?(?:chart |price )?alert(?: (?:for|when|at) (.+?))?(?: confirm(?:ed)?)?$/);
  if (alert) {
    const request = (alert[1] ?? "open alert editor").replace(/\s+confirm(?:ed)?$/, "").trim();
    actions.push({ feature: "alert", operation: "create", value: { request, confirmed: /\bconfirm(?:ed)?\b/.test(text) }, scope: "account" });
  }

  if (contradictions.length) return { kind: "clarify", command: "G", actions: [], executable_actions: [], blockers: contradictions, cli_arguments: [], ready_for_cli: false, confirmation_required: false, ready_for_live_executor: false };
  if (!actions.length && !blockers.length) return null;
  const confirmationRequired = actions.some(action => G_ACTION_STATES[action.feature] === "confirmation-gated");
  const semanticBlockers = blockers.length;
  blockers.push(...actions.filter(action => G_ACTION_STATES[action.feature] === "unbound").map(action => `${action.feature} is runtime-disabled pending live proof`));
  blockers.push(...actions.filter(action => action.feature === "resolution" && action.value !== "1h")
    .map(action => `resolution ${action.value} is runtime-disabled pending exact live proof`));
  const executableActions = actions.filter(action => action.feature === "resolution" && action.value === "1h");
  const readyForLiveExecutor = semanticBlockers === 0 && blockers.length === 0 && !confirmationRequired
    && executableActions.length === actions.length && actions.length > 0;
  return {
    kind: "candidate", command: "G", actions,
    executable_actions: readyForLiveExecutor ? executableActions : [],
    blockers: [...new Set(blockers)], cli_arguments: [],
    ready_for_cli: false, confirmation_required: confirmationRequired,
    ready_for_live_executor: readyForLiveExecutor
  };
}
