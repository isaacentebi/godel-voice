export const GR_PERIODS = Object.freeze(["1D", "1W", "1M", "3M", "6M", "1Y", "longer"]);
export const GR_ACTION_STATES = Object.freeze({
  "buy leg": "existing-runtime-unverified",
  "sell leg": "existing-runtime-unverified",
  period: "existing-runtime-unverified",
  "correlation toggle": "existing-runtime-unverified",
  "correlation window": "existing-runtime-unverified",
  "regression toggle": "existing-runtime-unverified",
  "full/filtered data": "existing-runtime-unverified"
});

const SMALL = new Map([
  ["zero", 0], ["one", 1], ["two", 2], ["three", 3], ["four", 4], ["five", 5], ["six", 6],
  ["seven", 7], ["eight", 8], ["nine", 9], ["ten", 10], ["eleven", 11], ["twelve", 12],
  ["thirteen", 13], ["fourteen", 14], ["fifteen", 15], ["sixteen", 16], ["seventeen", 17],
  ["eighteen", 18], ["nineteen", 19], ["twenty", 20], ["thirty", 30], ["forty", 40],
  ["fifty", 50], ["sixty", 60], ["seventy", 70], ["eighty", 80], ["ninety", 90]
]);

function clean(value) {
  return String(value ?? "").toLowerCase().replace(/\bfour x\b/g, "forex")
    .replace(/\bcor relation\b/g, "correlation").replace(/[^a-z0-9.,%/&+ -]+/g, " ")
    .replace(/\s+/g, " ").trim();
}

function corrected(value) {
  return clean(value).split(/\b(?:wait no|no sorry|actually|scratch that|i mean|rather)\b/).at(-1).trim();
}

function spokenNumber(value) {
  const source = clean(value).replace(/[,]/g, "");
  if (/^\d+(?:\.\d+)?$/.test(source)) return Number(source);
  const tokens = source.split(/[ -]+/).filter(Boolean);
  let total = 0, current = 0;
  for (const token of tokens) {
    if (SMALL.has(token)) current += SMALL.get(token);
    else if (token === "hundred") current = (current || 1) * 100;
    else if (token === "thousand") { total += (current || 1) * 1000; current = 0; }
    else if (token === "million") { total += (current || 1) * 1_000_000; current = 0; }
    else return null;
  }
  return total + current;
}

function exactCurrencyMatches(context, text) {
  const matches = [];
  for (const item of context?.live_currencies ?? []) {
    const currency = typeof item === "string" ? { code: item, name: item, aliases: [] }
      : { code: String(item.code ?? "").toUpperCase(), name: String(item.name ?? ""), aliases: item.aliases ?? [] };
    if (!currency.code || !currency.name) continue;
    const positions = [currency.code, currency.name, ...currency.aliases].map(name => {
      const normalized = clean(name);
      const match = new RegExp(`(?:^|\\s)${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`).exec(text);
      return match ? match.index : -1;
    }).filter(index => index >= 0);
    if (positions.length) matches.push({ ...currency, index: Math.min(...positions) });
  }
  return matches.sort((a, b) => a.index - b.index);
}

export function groundedFXResult(context = {}) {
  const result = context.converted_result;
  if (!result || !Number.isFinite(result.amount) || !String(result.currency ?? "").match(/^[A-Z]{3}$/)
    || result.source?.panel !== "FX" || !String(result.source?.observed_at ?? "")) return null;
  return { amount: result.amount, currency: result.currency, source: { panel: "FX", observed_at: result.source.observed_at } };
}

export function compileFXVoice(context = {}, utterance) {
  const text = corrected(utterance);
  if (!text || text.split(" ").length > 80) return null;
  const blockers = [];
  const contradictions = [];
  const current = context.current_state ?? {};
  const matches = exactCurrencyMatches(context, text);
  const unique = [...new Map(matches.map(item => [item.code, item])).values()];
  if (unique.length > 2) contradictions.push("FX request names more than two currencies");
  let from = null, to = null;
  if (unique.length === 2) [from, to] = unique.map(item => item.code);
  else if (unique.length === 1) {
    const toIndex = text.indexOf(" to ");
    if (/^from\b/.test(text) || /\bfrom\b/.test(text) || (toIndex >= 0 && unique[0].index < toIndex)) from = unique[0].code;
    else if (/^to\b/.test(text) || (toIndex >= 0 && unique[0].index > toIndex)) to = unique[0].code;
    else blockers.push("one currency is ambiguous without explicit from or to direction");
  } else if (/\b(?:convert|currency|forex|from|to)\b/.test(text) && !/\binvert\b/.test(text)) {
    blockers.push("FX currencies require exact identities from the live currency list");
  }
  const amountMatch = text.match(/\b(?:convert|amount)\s+((?:\d[\d,.]*|(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million)(?:[ -]+(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million)){0,5}))\b/);
  const amount = amountMatch ? spokenNumber(amountMatch[1]) : null;
  if (amount != null && (!Number.isFinite(amount) || amount < 0)) blockers.push("FX amount must be finite and nonnegative");
  if (/\b(?:negative|minus)\b/.test(text) && /\b(?:convert|amount)\b/.test(text)) blockers.push("FX amount cannot be negative");
  const invertOn = /\b(?:invert|inverse|swap) (?:the )?(?:pair|currencies|it)\b/.test(text);
  const invertOff = /\b(?:direct|uninvert|do not invert|don't invert)\b/.test(text);
  if (invertOn && invertOff) contradictions.push("FX pair cannot be both direct and inverted");
  const merged = { ...current };
  if (from) merged.from = from;
  if (to) merged.to = to;
  if (amount != null) merged.amount = amount;
  if (invertOn || invertOff) merged.invert = invertOn;
  if (merged.from && merged.to && merged.from === merged.to) blockers.push("FX from and to currencies must differ");
  for (const field of ["from", "to", "amount"]) if (merged[field] == null) blockers.push(`FX conversion requires ${field}`);
  if (contradictions.length) return { kind: "clarify", command: "FX", actions: [], executable_actions: [], blockers: contradictions, desired_state: current, grounded_result: null, ready_for_live_executor: false };
  if (blockers.length) return { kind: "clarify", command: "FX", actions: [], executable_actions: [], blockers: [...new Set(blockers)], desired_state: merged, grounded_result: null, ready_for_live_executor: false };
  const action = { feature: "conversion", operation: "configure", value: merged, scope: "calculator" };
  return { kind: "candidate", command: "FX", actions: [action], executable_actions: [], blockers: ["FX controls are runtime-disabled pending exact live proof"], desired_state: merged, grounded_result: groundedFXResult(context), ready_for_live_executor: false };
}

function securityMatches(context, text) {
  const result = [];
  for (const item of context?.resolved_securities ?? []) {
    const ticker = String(item.ticker ?? "").toUpperCase();
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) continue;
    const names = [ticker, item.spoken_name, ...(item.aliases ?? [])].filter(Boolean);
    const positions = names.map(name => {
      const normalized = clean(name);
      const match = new RegExp(`(?:^|\\s)${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`).exec(text);
      return match ? match.index : -1;
    }).filter(index => index >= 0);
    if (positions.length) result.push({ ticker, index: Math.min(...positions) });
  }
  return [...new Map(result.sort((a, b) => a.index - b.index).map(item => [item.ticker, item])).values()];
}

export function groundedGRResult(context = {}) {
  const result = context.observed_result;
  if (!result || result.source?.panel !== "GR" || !String(result.source?.observed_at ?? "")) return null;
  const values = {};
  for (const key of ["ratio", "correlation", "beta", "adjusted_beta", "alpha", "r_squared", "pearson_r", "standard_error", "p_value"]) {
    if (result[key] != null) {
      if (!Number.isFinite(result[key])) return null;
      values[key] = result[key];
    }
  }
  if (!Object.keys(values).length) return null;
  return { ...values, source: { panel: "GR", observed_at: result.source.observed_at } };
}

function periodFrom(text, context, blockers, contradictions) {
  const candidates = [];
  for (const [value, pattern] of [
    ["1D", /\b(?:one|1) day\b/], ["1W", /\b(?:one|1) week\b/], ["1M", /\b(?:one|1) month\b/],
    ["3M", /\b(?:three|3) months?\b/], ["6M", /\b(?:six|6) months?\b/], ["1Y", /\b(?:one|1) year\b/]
  ]) if (pattern.test(text)) candidates.push(value);
  for (const item of context?.live_longer_periods ?? []) {
    const value = typeof item === "string" ? item : item.value;
    const aliases = typeof item === "string" ? [item] : [item.value, ...(item.aliases ?? [])];
    if (aliases.some(alias => new RegExp(`(?:^|\\s)${clean(alias).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`).test(text))) candidates.push(value);
  }
  const longRequest = /\b(?:two|2|three|3|five|5|ten|10) years?\b/.test(text);
  if (longRequest && !candidates.some(value => !GR_PERIODS.includes(value))) blockers.push("periods longer than 1Y require one exact value from the live GR period list");
  const unique = [...new Set(candidates)];
  if (unique.length > 1) contradictions.push("GR period has conflicting values");
  return unique.length === 1 ? unique[0] : null;
}

export function compileGRVoice(context = {}, utterance) {
  const text = corrected(utterance);
  if (!text || text.split(" ").length > 100) return null;
  if (/\b(?:buy|sell)\b.{0,40}\b(?:shares?|stock|contracts?)\b|\b(?:place|submit|send|cancel) (?:a |the )?(?:trade|order)\b/.test(text)) {
    return { kind: "blocked", command: "GR", actions: [], executable_actions: [], blockers: ["GR Buy and Sell are ratio legs only; voice cannot create or manage orders"], ready_for_live_executor: false };
  }
  const blockers = [];
  const contradictions = [];
  const current = context.current_state ?? {};
  const securities = securityMatches(context, text);
  if (securities.length > 2) contradictions.push("GR ratio requires exactly two security identities");
  let buy = null, sell = null;
  if (securities.length === 2) [buy, sell] = securities.map(item => item.ticker);
  else if (securities.length === 1) {
    if (/\b(?:versus|vs|divided by|ratio)\b/.test(text)) blockers.push("GR legs require exact identities from the trusted security resolver");
    else if (/\bbuy leg\b|\bnumerator\b/.test(text)) buy = securities[0].ticker;
    else if (/\bsell leg\b|\bdenominator\b/.test(text)) sell = securities[0].ticker;
    else blockers.push("one GR security is ambiguous without buy/numerator or sell/denominator direction");
  } else if (/\b(?:versus|vs|divided by|ratio)\b/.test(text)) blockers.push("GR legs require exact identities from the trusted security resolver");
  const period = periodFrom(text, context, blockers, contradictions);
  let corrOn = /\b(?:with|show|enable|turn on) (?:a )?(?:rolling )?correlation\b|\bturn correlation on\b/.test(text);
  const corrOff = /\b(?:without|hide|disable|turn off) (?:rolling )?correlation\b|\bturn correlation off\b/.test(text);
  if (corrOn && corrOff) contradictions.push("correlation cannot be both on and off");
  const windowMatch = text.match(/\b(\d+|two|three|five|ten|fifteen|twenty|thirty|sixty|ninety)[ -]days? (?:rolling )?correlation(?: window)?\b|\bcorrelation window (\d+|two|three|five|ten|fifteen|twenty|thirty|sixty|ninety)[ -]days?\b/);
  const correlationWindow = windowMatch ? spokenNumber(windowMatch[1] ?? windowMatch[2]) : null;
  if (correlationWindow != null) corrOn = true;
  if (correlationWindow != null && (correlationWindow < 2 || correlationWindow > 730)) blockers.push("GR correlation window must be from 2 to 730 days");
  const regressionOff = /\b(?:without|hide|disable|turn off) regression\b|\bturn regression off\b/.test(text);
  const regressionPositive = /\b(?:with|show|enable|turn on) regression\b|\bturn regression on\b/.test(text);
  const regressionOn = regressionPositive || (/\bregression\b/.test(text) && !regressionOff);
  if ((regressionOn && regressionOff) || /\bwith and without regression\b/.test(text)) contradictions.push("regression cannot be both on and off");
  const full = /\b(?:use|using|show) full data\b/.test(text);
  const filtered = /\b(?:use|using|show) filtered data\b/.test(text);
  if ((full && filtered) || (/\bfull\b/.test(text) && /\bfiltered\b/.test(text) && /\bdata\b/.test(text))) contradictions.push("GR data cannot be both Full and Filtered");

  const merged = { ...current };
  if (buy) merged.buy = buy;
  if (sell) merged.sell = sell;
  if (period) merged.period = period;
  if (corrOn || corrOff) merged.correlation = corrOn;
  if (correlationWindow != null) merged.correlation_window = correlationWindow;
  if (regressionOn || regressionOff) merged.regression = regressionOn;
  if (full || filtered) merged.data = full ? "Full" : "Filtered";
  if (merged.buy && merged.sell && merged.buy === merged.sell) blockers.push("GR numerator and denominator securities must differ");
  if (merged.correlation === true && merged.correlation_window == null) blockers.push("correlation requires an explicit rolling window in days");
  for (const field of ["buy", "sell"]) if (!merged[field]) blockers.push(`GR ratio requires ${field} leg`);
  if (contradictions.length) return { kind: "clarify", command: "GR", actions: [], executable_actions: [], blockers: contradictions, desired_state: current, grounded_result: null, ready_for_live_executor: false };
  if (blockers.length) return { kind: "clarify", command: "GR", actions: [], executable_actions: [], blockers: [...new Set(blockers)], desired_state: merged, grounded_result: null, ready_for_live_executor: false };
  const actions = [];
  if (buy) actions.push({ feature: "buy leg", operation: "select", value: buy, scope: "ratio" });
  if (sell) actions.push({ feature: "sell leg", operation: "select", value: sell, scope: "ratio" });
  if (period) actions.push({ feature: "period", operation: "select", value: period, scope: "ratio" });
  if (corrOn || corrOff) actions.push({ feature: "correlation toggle", operation: "select", value: corrOn ? "on" : "off", scope: "statistics" });
  if (correlationWindow != null) actions.push({ feature: "correlation window", operation: "set", value: correlationWindow, scope: "statistics" });
  if (regressionOn || regressionOff) actions.push({ feature: "regression toggle", operation: "select", value: regressionOn ? "on" : "off", scope: "statistics" });
  if (full || filtered) actions.push({ feature: "full/filtered data", operation: "select", value: full ? "Full" : "Filtered", scope: "statistics" });
  return {
    kind: "candidate", command: "GR", actions, executable_actions: [],
    blockers: ["strict GR compiler does not newly enable existing unverified runtime controls"], desired_state: {
      ...merged, ratio: { numerator: merged.buy, denominator: merged.sell, semantics: "buy price divided by sell price" }
    }, grounded_result: groundedGRResult(context), ready_for_live_executor: false
  };
}

export function compileFXGRVoice(context = {}, utterance) {
  const command = String(context?.command ?? context ?? "").toUpperCase();
  if (command === "FX") return compileFXVoice(typeof context === "object" ? context : {}, utterance);
  if (command === "GR") return compileGRVoice(typeof context === "object" ? context : {}, utterance);
  return null;
}
