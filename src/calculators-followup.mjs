export const OVME_OPTION_TYPES = Object.freeze(["Call", "Put"]);
export const OVME_TIME_UNITS = Object.freeze(["days", "months", "years"]);
export const OVME_SOLVES = Object.freeze(["Option Price", "Implied Volatility"]);
export const CALC_FUNCTIONS = Object.freeze([
  "sqrt", "abs", "sin", "cos", "tan", "asin", "acos", "atan", "log", "ln", "exp", "pow", "min", "max",
  "pv", "rate", "pmt", "fv", "nper", "apr", "ear"
]);

const WORD_VALUES = new Map([
  ["zero", 0], ["one", 1], ["two", 2], ["three", 3], ["four", 4], ["five", 5], ["six", 6],
  ["seven", 7], ["eight", 8], ["nine", 9], ["ten", 10], ["eleven", 11], ["twelve", 12],
  ["thirteen", 13], ["fourteen", 14], ["fifteen", 15], ["sixteen", 16], ["seventeen", 17],
  ["eighteen", 18], ["nineteen", 19], ["twenty", 20], ["thirty", 30], ["forty", 40],
  ["fifty", 50], ["sixty", 60], ["seventy", 70], ["eighty", 80], ["ninety", 90]
]);

function clean(value) {
  return String(value ?? "").toLowerCase()
    .replace(/\bblack sho+les?\b|\bblack shoals?\b/g, "black scholes")
    .replace(/\bimplied vol\b/g, "implied volatility")
    .replace(/\brisk free\b/g, "risk-free")
    .replace(/\s+/g, " ").trim();
}

function corrected(value) {
  return clean(value).split(/\b(?:wait no|no sorry|actually|scratch that|i mean|rather)\b/).at(-1).trim();
}

function parseSpokenNumber(value) {
  const source = clean(value).replace(/[$,]/g, "").trim();
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(source)) return Number(source);
  const tokens = source.replace(/-/g, " ").split(" ").filter(Boolean);
  if (!tokens.length || tokens.some(token => !WORD_VALUES.has(token) && !["hundred", "thousand", "point"].includes(token))) return null;
  if (tokens.length === 2 && WORD_VALUES.get(tokens[0]) > 0 && WORD_VALUES.get(tokens[0]) < 10
    && WORD_VALUES.get(tokens[1]) >= 10 && WORD_VALUES.get(tokens[1]) < 100) {
    return WORD_VALUES.get(tokens[0]) * 100 + WORD_VALUES.get(tokens[1]);
  }
  let total = 0;
  let current = 0;
  let decimal = "";
  let afterPoint = false;
  for (const token of tokens) {
    if (token === "point") { afterPoint = true; continue; }
    const valuePart = WORD_VALUES.get(token);
    if (afterPoint) {
      if (valuePart == null || valuePart > 9) return null;
      decimal += String(valuePart);
    } else if (token === "hundred") current = (current || 1) * 100;
    else if (token === "thousand") { total += (current || 1) * 1000; current = 0; }
    else current += valuePart;
  }
  const result = total + current + (decimal ? Number(`0.${decimal}`) : 0);
  return Number.isFinite(result) ? result : null;
}

const NUMBER_PHRASE = "(?:[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)|(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|point)(?:[ -]+(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|point)){0,5})";
const WORD_NUMBER_PHRASE = "(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|point)(?:[ -]+(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|point)){0,5}";

function numericMatches(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const after = new RegExp(`\\b${escaped}\\s+(?:of |is |at )?(${NUMBER_PHRASE})`, "g");
  const results = [];
  for (const match of text.matchAll(after)) {
    const value = parseSpokenNumber(match[1]);
    if (value != null) results.push(value);
  }
  return results;
}

function chooseNumber(text, labels, field, contradictions) {
  const results = labels.flatMap(label => numericMatches(text, label));
  const unique = [...new Set(results)];
  if (unique.length > 1) contradictions.push(`${field} has conflicting values`);
  return unique.length === 1 ? unique[0] : null;
}

function percentMatches(text, labels) {
  const results = [];
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const match of text.matchAll(new RegExp(`\\b${escaped}\\s+(?:of |is |at )?(${NUMBER_PHRASE})(?:\\s+(percent|percentage|decimal))?`, "g"))) {
      const value = parseSpokenNumber(match[1]);
      if (value != null) results.push({ value, unit: match[2] ?? null, direction: "after" });
    }
    for (const match of text.matchAll(new RegExp(`\\b(${NUMBER_PHRASE})\\s+(percent|percentage|decimal)\\s+${escaped}\\b`, "g"))) {
      const value = parseSpokenNumber(match[1]);
      if (value != null) results.push({ value, unit: match[2], direction: "before" });
    }
    if (new RegExp(`\\bzero\\s+${escaped}\\b`).test(text)) results.push({ value: 0, unit: null, direction: "before-zero" });
  }
  return results;
}

function choosePercent(text, labels, field, contradictions, blockers, preferredDirection) {
  const all = percentMatches(text, labels);
  const zeroBefore = all.filter(item => item.direction === "before-zero");
  const preferred = zeroBefore.length ? zeroBefore : all.filter(item => item.direction === preferredDirection);
  const matches = preferred.length ? preferred : all;
  const normalized = matches.map(item => {
    if (item.value === 0 && !item.unit) return { decimal: 0, display_percent: 0 };
    if (!item.unit) { blockers.push(`${field} requires an explicit percent or decimal unit`); return null; }
    const decimal = item.unit === "decimal" ? item.value : item.value / 100;
    return { decimal, display_percent: decimal * 100 };
  }).filter(Boolean);
  const unique = [...new Map(normalized.map(item => [item.decimal, item])).values()];
  if (unique.length > 1) contradictions.push(`${field} has conflicting values`);
  return unique.length === 1 ? unique[0] : null;
}

function finitePositive(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function validateFiniteCalculationOutput(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("calculation output must be finite");
  return value;
}

export function compileOVMEVoice(context = {}, utterance) {
  const text = corrected(utterance);
  if (!text || text.split(" ").length > 100) return null;
  if (/\b(?:buy|sell|exercise)\b|\b(?:submit|place|send|cancel)\s+(?:an? |the |this )?(?:order|trade|option|contract)\b/.test(text)) {
    return { kind: "blocked", command: "OVME", actions: [], executable_actions: [], blockers: ["OVME is calculation-only and cannot create or manage trades or orders"], ready_for_live_executor: false };
  }
  const contradictions = [];
  const blockers = [];
  const call = /\bcalls?\b/.test(text);
  const put = /\bputs?\b/.test(text);
  if (call && put) contradictions.push("option type cannot be both Call and Put");
  const optionType = call ? "Call" : put ? "Put" : null;
  const optionPriceSolve = /\b(?:price|value) (?:a |the )?(?:call|put|option)\b|\bsolve (?:for )?(?:theoretical |option )?price\b/.test(text);
  const impliedSolve = /\b(?:solve (?:for )?|calculate )?implied volatility\b/.test(text);
  if (optionPriceSolve && impliedSolve) contradictions.push("solve target cannot be both Option Price and Implied Volatility");
  const solve = impliedSolve ? "Implied Volatility" : optionPriceSolve ? "Option Price" : null;

  const spot = chooseNumber(text, ["spot", "spot price"], "spot", contradictions);
  const shorthand = text.match(new RegExp(`\\bstrike\\s+(one|two|three|four|five|six|seven|eight|nine)\\s+(ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety(?:[ -]+(?:one|two|three|four|five|six|seven|eight|nine))?)\\s+(${NUMBER_PHRASE})\\s+(days?|months?|years?)\\b`));
  const shorthandStrike = shorthand ? WORD_VALUES.get(shorthand[1]) * 100 + parseSpokenNumber(shorthand[2]) : null;
  const genericStrike = shorthand ? null : chooseNumber(text, ["strike", "strike price"], "strike", contradictions);
  const strike = shorthandStrike ?? genericStrike;
  const optionPrice = chooseNumber(text, ["option price", "market price", "premium"], "option price", contradictions);
  const timeMatches = shorthand ? [{ value: parseSpokenNumber(shorthand[3]), unit: shorthand[4].replace(/s?$/, "s") }]
    : [...text.matchAll(new RegExp(`\\b(${NUMBER_PHRASE})\\s+(days?|months?|years?)\\b`, "g"))]
    .map(match => ({ value: parseSpokenNumber(match[1]), unit: match[2].replace(/s?$/, "s") }));
  const uniqueTimes = [...new Map(timeMatches.map(item => [`${item.value}:${item.unit}`, item])).values()];
  if (uniqueTimes.length > 1) contradictions.push("time to expiry has conflicting values");
  const time = uniqueTimes.length === 1 ? uniqueTimes[0] : null;
  const riskFreeRate = choosePercent(text, ["risk-free rate", "rates", "rate"], "risk-free rate", contradictions, blockers, "before");
  const dividendYield = choosePercent(text, ["dividend yield", "dividend"], "dividend yield", contradictions, blockers, "after");
  const volatility = choosePercent(text, ["volatility", "vol"], "volatility", contradictions, blockers, "before");

  if (contradictions.length) return { kind: "clarify", command: "OVME", actions: [], executable_actions: [], blockers: contradictions, ready_for_live_executor: false };
  const proposed = { option_type: optionType, spot, strike, time_to_expiry: time, risk_free_rate: riskFreeRate,
    dividend_yield: dividendYield, volatility, option_price: optionPrice, solve };
  const merged = { ...(context?.current_state ?? {}) };
  for (const [key, value] of Object.entries(proposed)) if (value != null) merged[key] = value;
  const required = merged.solve === "Implied Volatility"
    ? ["option_type", "spot", "strike", "time_to_expiry", "risk_free_rate", "dividend_yield", "option_price", "solve"]
    : ["option_type", "spot", "strike", "time_to_expiry", "risk_free_rate", "dividend_yield", "volatility", "solve"];
  const missing = required.filter(key => merged[key] == null);
  if (!OVME_SOLVES.includes(merged.solve)) blockers.push("say whether to solve Option Price or Implied Volatility");
  if (missing.length) blockers.push(`OVME requires all model fields; missing: ${missing.join(", ")}`);
  if (merged.spot != null && !finitePositive(merged.spot)) blockers.push("spot must be finite and positive");
  if (merged.strike != null && !finitePositive(merged.strike)) blockers.push("strike must be finite and positive");
  if (merged.option_price != null && !finitePositive(merged.option_price)) blockers.push("option price must be finite and positive");
  if (merged.time_to_expiry && (!finitePositive(merged.time_to_expiry.value) || !OVME_TIME_UNITS.includes(merged.time_to_expiry.unit))) blockers.push("time to expiry requires a positive value and explicit days, months, or years");
  for (const key of ["risk_free_rate", "dividend_yield", "volatility"]) {
    if (merged[key] && (!Number.isFinite(merged[key].decimal) || (key === "volatility" && merged[key].decimal < 0))) blockers.push(`${key.replaceAll("_", " ")} is invalid`);
  }
  if (context?.computed_output != null) {
    try { validateFiniteCalculationOutput(context.computed_output); } catch (error) { blockers.push(error.message); }
  }
  if (blockers.length) return { kind: "clarify", command: "OVME", actions: [], executable_actions: [], blockers: [...new Set(blockers)], desired_state: merged, ready_for_live_executor: false };
  const action = { feature: "model", operation: "configure", value: merged, scope: "calculator" };
  return { kind: "candidate", command: "OVME", actions: [action], executable_actions: [], blockers: ["OVME controls are runtime-disabled pending exact live proof"], desired_state: merged, ready_for_live_executor: false };
}

function financial(name, args) {
  if (name === "pmt") {
    const [rate, nper, present, future = 0, type = 0] = args;
    const factor = rate === 0 ? nper : ((1 + rate) ** nper - 1) / rate;
    return rate === 0 ? -(present + future) / nper : -(present * (1 + rate) ** nper + future) / (factor * (1 + rate * type));
  }
  if (name === "fv") {
    const [rate, nper, payment, present = 0, type = 0] = args;
    const factor = rate === 0 ? nper : ((1 + rate) ** nper - 1) / rate;
    return -(present * (1 + rate) ** nper + payment * (1 + rate * type) * factor);
  }
  if (name === "pv") {
    const [rate, nper, payment, future = 0, type = 0] = args;
    const factor = rate === 0 ? nper : ((1 + rate) ** nper - 1) / rate;
    return -(future + payment * (1 + rate * type) * factor) / ((1 + rate) ** nper);
  }
  if (name === "nper") {
    const [rate, payment, present, future = 0, type = 0] = args;
    return rate === 0 ? -(present + future) / payment
      : Math.log((payment * (1 + rate * type) - future * rate) / (present * rate + payment * (1 + rate * type))) / Math.log(1 + rate);
  }
  if (name === "apr") return args[0] * args[1];
  if (name === "ear") return (1 + args[0] / args[1]) ** args[1] - 1;
  if (name === "rate") {
    const [periods, pmt, pv, fv = 0, timing = 0] = args;
    let low = -0.999999, high = 10;
    const residual = r => pv * (1 + r) ** periods + pmt * (1 + r * timing) * (r === 0 ? periods : ((1 + r) ** periods - 1) / r) + fv;
    let lo = residual(low), hi = residual(high);
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo * hi > 0) return NaN;
    for (let i = 0; i < 160; i++) { const mid = (low + high) / 2; const value = residual(mid); if (lo * value <= 0) { high = mid; hi = value; } else { low = mid; lo = value; } }
    return (low + high) / 2;
  }
  return NaN;
}

function evaluateExpression(source) {
  if (source.length > 500 || /[;{}\[\]="'`]|\b(?:eval|function|constructor|fetch|import|require|process|global|window|document)\b/i.test(source)) throw new Error("unsafe or unsupported calculator syntax");
  const tokens = source.match(/\d+(?:\.\d+)?|\.\d+|[a-z]+|[()+\-*/%^,]/gi) ?? [];
  if (tokens.join("").toLowerCase() !== source.replace(/\s+/g, "").toLowerCase() || tokens.length > 256) throw new Error("calculator expression contains unsupported tokens");
  let index = 0;
  const expression = () => { let value = term(); while (["+", "-"].includes(tokens[index])) { const op = tokens[index++]; const right = term(); value = op === "+" ? value + right : value - right; } return value; };
  const term = () => { let value = power(); while (["*", "/", "%"].includes(tokens[index])) { const op = tokens[index++]; const right = power(); value = op === "*" ? value * right : op === "/" ? value / right : value % right; } return value; };
  const power = () => { let value = unary(); if (tokens[index] === "^") { index++; value **= power(); } return value; };
  const unary = () => tokens[index] === "+" ? (index++, unary()) : tokens[index] === "-" ? (index++, -unary()) : primary();
  const primary = () => {
    const token = tokens[index++];
    if (token === "(") { const value = expression(); if (tokens[index++] !== ")") throw new Error("unbalanced parentheses"); return value; }
    if (/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(token ?? "")) return Number(token);
    const name = String(token ?? "").toLowerCase();
    if (name === "pi" || name === "e") return name === "pi" ? Math.PI : Math.E;
    if (!CALC_FUNCTIONS.includes(name) || tokens[index++] !== "(") throw new Error(`unsupported calculator identifier: ${name || "end"}`);
    const args = [];
    if (tokens[index] !== ")") { do { args.push(expression()); } while (tokens[index] === "," && ++index); }
    if (tokens[index++] !== ")") throw new Error("unbalanced function call");
    const basic = { sqrt: Math.sqrt, abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin,
      acos: Math.acos, atan: Math.atan, log: Math.log10, ln: Math.log, exp: Math.exp, pow: Math.pow, min: Math.min, max: Math.max };
    return basic[name] ? basic[name](...args) : financial(name, args);
  };
  const value = expression();
  if (index !== tokens.length) throw new Error("calculator expression has trailing tokens");
  return validateFiniteCalculationOutput(value);
}

function wordsToDigits(text) {
  return text.replace(new RegExp(`\\b${WORD_NUMBER_PHRASE}\\b`, "gi"), phrase => {
    const value = parseSpokenNumber(phrase);
    return value == null ? phrase : String(value);
  });
}

function naturalExpression(text, context) {
  let value = text.replace(/^(?:calculate|compute|work out|what is)\s+/, "").replace(/\bplease\b/g, "").trim();
  const previous = context?.current_state?.expression;
  if (/^(?:add|plus)\b/.test(value) && previous) value = `(${previous}) + ${value.replace(/^(?:add|plus)\s+/, "")}`;
  else if (/^subtract\b/.test(value) && previous) value = `(${previous}) - ${value.replace(/^subtract\s+/, "")}`;
  else if (/^multiply (?:that|it) by\b/.test(value) && previous) value = `(${previous}) * ${value.replace(/^multiply (?:that|it) by\s+/, "")}`;
  else if (/^divide (?:that|it) by\b/.test(value) && previous) value = `(${previous}) / ${value.replace(/^divide (?:that|it) by\s+/, "")}`;
  value = value.replace(new RegExp(`\\bsquare root of\\s+(${NUMBER_PHRASE})`, "g"), "sqrt($1)")
    .replace(new RegExp(`\\b(?:natural log|ln) of\\s+(${NUMBER_PHRASE})`, "g"), "ln($1)")
    .replace(new RegExp(`\\blog(?: base ten)? of\\s+(${NUMBER_PHRASE})`, "g"), "log($1)")
    .replace(new RegExp(`\\b(sine|cosine|tangent) of\\s+(${NUMBER_PHRASE})`, "g"), (_m, fn, arg) => `${{ sine: "sin", cosine: "cos", tangent: "tan" }[fn]}(${arg})`)
    .replace(/\bopen parenthes(?:is|es)\b/g, "(").replace(/\bclose parenthes(?:is|es)\b/g, ")")
    .replace(/\bto the power of\b/g, "^").replace(/\bmultiplied by\b|\btimes\b/g, "*")
    .replace(/\bdivided by\b|\bover\b/g, "/").replace(/\bplus\b/g, "+").replace(/\bminus\b/g, "-");
  value = value.replace(/\b([a-z0-9.]+) squared\b/g, "$1^2").replace(/\b([a-z0-9.]+) cubed\b/g, "$1^3");
  return wordsToDigits(value).replace(/\s+/g, " ").trim();
}

export function compileCALCVoice(context = {}, utterance) {
  const text = corrected(utterance);
  if (!text || text.split(" ").length > 100) return null;
  if (/\b(?:or|and then)\b/.test(text)) return { kind: "clarify", command: "CALC", actions: [], executable_actions: [], blockers: ["CALC accepts one atomic expression at a time"], desired_state: context?.current_state ?? {}, ready_for_live_executor: false };
  let expression;
  let result;
  try {
    expression = naturalExpression(text, context);
    result = evaluateExpression(expression);
  } catch (error) {
    return { kind: /unsafe|unsupported tokens|identifier/.test(error.message) ? "blocked" : "clarify", command: "CALC", actions: [], executable_actions: [], blockers: [error.message], desired_state: context?.current_state ?? {}, ready_for_live_executor: false };
  }
  const value = { expression, result };
  return { kind: "candidate", command: "CALC", actions: [{ feature: "expression", operation: "evaluate", value, scope: "calculator" }], executable_actions: [], blockers: ["CALC controls are runtime-disabled pending exact live proof"], desired_state: value, ready_for_live_executor: false };
}

export function compileCalculatorVoice(context = {}, utterance) {
  const command = String(context?.command ?? context ?? "").toUpperCase();
  if (command === "OVME") return compileOVMEVoice(typeof context === "object" ? context : {}, utterance);
  if (command === "CALC") return compileCALCVoice(typeof context === "object" ? context : {}, utterance);
  return null;
}
