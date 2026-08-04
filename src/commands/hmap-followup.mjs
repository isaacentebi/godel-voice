const UI_ORDER = Object.freeze([
  "universe", "watchlist", "size by", "label", "sectors", "animate",
  "update interval", "color", "movers", "tile quick action", "view"
]);

export const HMAP_ACTION_STATES = Object.freeze({
  universe: "live",
  watchlist: "unbound",
  "size by": "unbound",
  label: "unbound",
  sectors: "unbound",
  animate: "unbound",
  "update interval": "unbound",
  color: "unbound",
  movers: "unbound",
  "tile quick action": "unbound",
  view: "live"
});

const numberWords = Object.freeze({
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10
});
const tensWords = Object.freeze({ twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 });

function clean(value) {
  return String(value ?? "").toLowerCase()
    .replace(/s\s*&\s*p/g, "s and p")
    .replace(/watch\s+list/g, "watchlist")
    .replace(/heat\s+map/g, "heatmap")
    .replace(/\bperc(?:i|e)nt(?:age)?\b/g, "percent")
    .replace(/\banim(?:ay|a)shun\b/g, "animation")
    .replace(/\bauto matic(?:ally)?\b/g, "auto")
    .replace(/\banimation off\b/g, "animation off")
    .replace(/[^a-z0-9%.+$ -]+/g, " ")
    .replace(/\s+/g, " ").trim();
}

function title(value) {
  return String(value).trim().split(/\s+/).map(word => word ? word[0].toUpperCase() + word.slice(1) : word).join(" ");
}

function has(text, expression) { return expression.test(text); }

function oneOf(text, name, choices, contradictions) {
  const matches = choices.filter(item => has(text, item.pattern));
  if (matches.length > 1) contradictions.push(`${name} has conflicting values: ${matches.map(item => item.value).join(" and ")}`);
  return matches.length === 1 ? matches[0].value : null;
}

function dynamicPhrase(text, start, stops) {
  const match = text.match(start);
  if (!match) return null;
  const tail = match[1].split(new RegExp(`\\b(?:${stops.join("|")})\\b`))[0].trim();
  return tail && tail.length <= 64 ? tail : null;
}

function canonicalMetric(value, kind) {
  if (!value) return null;
  if (/^(?:absolute )?(?:percent|percentage|pct) change$|^absolute change$/.test(value)) return kind === "size" ? "Chg % abs" : "Chg %";
  if (/^(?:change )?percent(?:age)?$|^pct change$/.test(value)) return "Chg %";
  if (/^market cap(?:italization)?$/.test(value)) return "Market Cap";
  if (/^(?:last|price|last price)$/.test(value)) return "Last";
  return title(value);
}

function parseMilliseconds(text, contradictions) {
  const numberPhrase = "(?:\\d+(?:\\.\\d+)?|(?:(?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|and)(?:\\s+|$))+?)";
  const pattern = new RegExp(`(?:update|refresh)(?: the heatmap)?(?: every| interval(?: to| of)?)\\s+(${numberPhrase})\\s*(milliseconds?|msecs?|ms|seconds?|secs?|s)\\b`, "g");
  const matches = [...text.matchAll(pattern)];
  if (matches.length > 1) {
    contradictions.push("update interval has more than one requested value");
    return null;
  }
  if (!matches.length) return null;
  const phrase = matches[0][1].trim();
  let amount = Number(phrase);
  if (!Number.isFinite(amount)) {
    let subtotal = 0;
    let total = 0;
    for (const word of phrase.split(/\s+/)) {
      if (word === "and") continue;
      if (numberWords[word]) subtotal += numberWords[word];
      else if (tensWords[word]) subtotal += tensWords[word];
      else if (word === "hundred") subtotal = Math.max(1, subtotal) * 100;
      else if (word === "thousand") { total += Math.max(1, subtotal) * 1000; subtotal = 0; }
      else { subtotal = Number.NaN; break; }
    }
    amount = total + subtotal;
  }
  const milliseconds = /^(?:s|sec|secs|second|seconds)$/.test(matches[0][2]) ? amount * 1000 : amount;
  if (!Number.isInteger(milliseconds) || milliseconds <= 0) {
    contradictions.push("update interval must resolve to a positive whole number of milliseconds");
    return null;
  }
  return milliseconds;
}

function liveExact(value, options = []) {
  const matches = options.filter(option => String(option).trim().toLowerCase() === String(value).trim().toLowerCase());
  return matches.length === 1 ? matches[0] : null;
}

function quickAction(context, original, blockers) {
  const match = String(original ?? "").match(/(?:from|on)\s+(?:the\s+)?(?:ticker\s+|\$)?([A-Z][A-Z0-9.-]{0,9})\s+tile\s+(?:open|launch|choose|select|show)\s+([a-z][a-z ]{1,40})/i);
  if (!match) return null;
  const ticker = liveExact(match[1], context?.live_tiles ?? []);
  const requested = match[2].replace(/\s+(?:please|for me)$/i, "").trim();
  const action = liveExact(requested, context?.live_quick_actions ?? []);
  if (!ticker || !action) {
    blockers.push("tile quick action requires exact live tile and quick-action options");
    return null;
  }
  return { ticker, action };
}

export function compileHMAPFollowup(context, transcript) {
  const original = String(transcript ?? "");
  const text = clean(original);
  if (!text || !/\b(?:hmap|heatmap|this|that|it|tile)\b/.test(text)) return null;
  const contradictions = [];
  const blockers = [];
  const actions = [];

  const index = oneOf(text, "universe", [
    { value: "S&P 500", pattern: /\b(?:s and p|s p)(?: five hundred| 500)?\b/ },
    { value: "DJIA", pattern: /\b(?:djia|dow|dow jones)\b/ }
  ], contradictions);
  const watchMatch = text.match(/\b(?:use|map|show|select|switch(?: the heatmap)?(?: universe)? to)\s+(?:my\s+)?([a-z0-9][a-z0-9 -]{0,50}?)\s+watchlist\b/)
    ?? text.match(/\bmy\s+([a-z0-9][a-z0-9 -]{0,50}?)\s+watchlist\b/);
  const watchlist = watchMatch ? title(watchMatch[1]) : null;
  if (index && watchlist) contradictions.push("universe cannot be both an index and a watchlist");
  if (index) actions.push({ feature: "universe", operation: "select", value: index });
  if (watchlist) actions.push({ feature: "watchlist", operation: "select", value: watchlist });

  const stops = ["label", "show", "hide", "sector", "animate", "animation", "update", "refresh", "color", "movers", "table", "map view"];
  const size = canonicalMetric(dynamicPhrase(text, /\bsize(?: the tiles?)? by\s+(.+)$/, stops), "size");
  const label = canonicalMetric(dynamicPhrase(text, /\blabel(?: the tiles?)?(?: by| with)\s+(.+)$/, ["show", "hide", "sector", "animate", "animation", "update", "refresh", "color", "movers", "table", "map view"]), "label");
  if (size) actions.push({ feature: "size by", operation: "select", value: size });
  if (label) actions.push({ feature: "label", operation: "select", value: label });

  const sectors = oneOf(text, "sector headers", [
    { value: "Show", pattern: /\b(?:show|display|add|enable) (?:the )?sector (?:headers?|groups?|borders?)\b/ },
    { value: "Hide", pattern: /\b(?:hide|remove|disable) (?:the )?sector (?:headers?|groups?|borders?)\b/ }
  ], contradictions);
  const animate = oneOf(text, "animation", [
    { value: "On", pattern: /\b(?:start|enable|turn on|resume) (?:the )?(?:heatmap )?animat(?:e|ion)\b|\banimation on\b/ },
    { value: "Off", pattern: /\b(?:stop|disable|turn off|pause) (?:the )?(?:heatmap )?animat(?:e|ion)\b|\banimation off\b/ }
  ], contradictions);
  const color = oneOf(text, "color mode", [
    { value: "Auto", pattern: /\b(?:auto|automatic) color(?:s| mode| scale)?\b|\bcolor(?:s| mode| scale)? (?:auto|automatic)\b/ },
    { value: "Manual", pattern: /\bmanual (?:heatmap )?color(?:s| mode| scale)?\b|\bcolor(?:s| mode| scale)? manual\b/ }
  ], contradictions);
  const movers = oneOf(text, "Movers", [
    { value: "Open", pattern: /\b(?:open|show|expand) (?:the )?movers(?: drawer| panel)?\b/ },
    { value: "Closed", pattern: /\b(?:close|hide|collapse) (?:the )?movers(?: drawer| panel)?\b/ }
  ], contradictions);
  const view = oneOf(text, "view", [
    { value: "Table", pattern: /\b(?:switch|change|show|use|to|in) (?:the )?table(?: view)?\b|\btable view\b/ },
    { value: "Map", pattern: /\b(?:switch|change|show|use|to|in) (?:the )?map view\b|\bmap view\b/ }
  ], contradictions);
  const interval = parseMilliseconds(text, contradictions);
  if (sectors) actions.push({ feature: "sectors", operation: "select", value: sectors });
  if (animate) actions.push({ feature: "animate", operation: "select", value: animate });
  if (interval != null) actions.push({ feature: "update interval", operation: "set", value: interval });
  if (color) actions.push({ feature: "color", operation: "select", value: color });
  if (movers) actions.push({ feature: "movers", operation: "select", value: movers });

  if (color === "Manual" && /\b(?:from|between|minimum|maximum|min|max|threshold|gradient|red|green)\b/.test(text)) {
    blockers.push("manual color parameters are unbound");
  }
  const tileAction = quickAction(context, original, blockers);
  if (tileAction) actions.push({ feature: "tile quick action", operation: "handoff", value: tileAction });
  if (view) actions.push({ feature: "view", operation: "select", value: view });
  actions.sort((a, b) => UI_ORDER.indexOf(a.feature) - UI_ORDER.indexOf(b.feature));

  if (contradictions.length) {
    return { kind: "clarify", command: "HMAP", actions: [], executable_actions: [], blockers: contradictions, ready_for_live_executor: false };
  }
  if (!actions.length && !blockers.length) return null;
  const unbound = actions.filter(action => HMAP_ACTION_STATES[action.feature] !== "live");
  blockers.push(...unbound.map(action => `${action.feature} is runtime-disabled pending live proof`));
  const ready = blockers.length === 0 && unbound.length === 0;
  return {
    kind: "candidate", command: "HMAP", actions,
    executable_actions: ready ? actions : [],
    blockers: [...new Set(blockers)],
    ready_for_live_executor: ready
  };
}
