export const OMON_MODES = Object.freeze(["Both", "Calls", "Puts"]);
export const OMON_GREEKS = Object.freeze(["Delta", "Gamma", "Vega", "Theta", "Rho", "Lambda", "Epsilon"]);
export const OMON_DESTINATIONS = Object.freeze(["FOCUS", "G", "OVME"]);

export const OMON_ACTION_STATES = Object.freeze({
  mode: "unbound",
  expiration: "live-vocabulary-unbound",
  "months out": "unbound",
  "strike depth": "live",
  "strikes above": "unbound",
  "strikes below": "unbound",
  "Greek visibility": "unbound",
  columns: "live-vocabulary-unbound",
  contract: "selected-identity-unbound"
});

const NUMBER_WORDS = new Map([
  ["zero", 0], ["one", 1], ["two", 2], ["three", 3], ["four", 4], ["five", 5],
  ["six", 6], ["seven", 7], ["eight", 8], ["nine", 9], ["ten", 10], ["fifteen", 15],
  ["twenty", 20], ["twenty five", 25], ["thirty", 30], ["forty", 40], ["fifty", 50]
]);

function clean(value) {
  return String(value ?? "").toLowerCase()
    .replace(/\bblack sho+les?\b|\bblack shoals?\b/g, "black scholes")
    .replace(/\blamb(?: duh|da)\b/g, "lambda")
    .replace(/\beps(?:i|y)lon\b/g, "epsilon")
    .replace(/\brow greek\b/g, "rho")
    .replace(/\bcoal'?s only\b/g, "calls only")
    .replace(/[^a-z0-9&/., -]+/g, " ").replace(/\s+/g, " ").trim();
}

function corrected(value) {
  return clean(value).split(/\b(?:wait no|no sorry|actually|scratch that|i mean|rather)\b/).at(-1).trim();
}

function number(value) {
  const normalized = clean(value);
  return /^\d+$/.test(normalized) ? Number(normalized) : NUMBER_WORDS.get(normalized) ?? null;
}

function exact(value, options) {
  const wanted = clean(value);
  const matches = (options ?? []).filter(option => clean(option) === wanted);
  return matches.length === 1 ? matches[0] : null;
}

function liveExpirations(context, mode) {
  return (context?.live_expirations ?? []).map(item => typeof item === "string"
    ? { id: item, label: item, aliases: [] }
    : { id: String(item.id ?? ""), label: String(item.label ?? ""), aliases: item.aliases ?? [], modes: item.modes ?? null })
    .filter(item => item.id && item.label && (!mode || !item.modes || item.modes.includes(mode)));
}

function resolveExpiry(context, text, mode, blockers) {
  if (!/\bexpir(?:y|ation|ing)\b/.test(text)) return null;
  const matches = liveExpirations(context, mode).filter(item => [item.label, ...item.aliases]
    .some(name => new RegExp(`(?:^|\\s)${clean(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`).test(text)));
  if (matches.length !== 1) {
    blockers.push(matches.length > 1
      ? "expiration request matches more than one live expiry identity"
      : "expiration requires one exact live expiration identity from the option-chain expiry list");
    return null;
  }
  return { id: matches[0].id, label: matches[0].label };
}

function resolveColumns(context, text, blockers) {
  if (!/\bcolumns?\b/.test(text)) return null;
  const segment = text.match(/\bcolumns?\s+(.+?)(?=\s+(?:then|for|on|at|expir(?:y|ation)|months? out)\b|$)/)?.[1];
  if (!segment) {
    blockers.push("columns require an explicit ordered list from the live option-chain columns");
    return null;
  }
  const hits = (context?.live_columns ?? []).map(name => {
    const normalized = clean(name);
    const index = segment.search(new RegExp(`(?:^|\\s)${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`));
    return { name, normalized, index };
  }).filter(item => item.index >= 0).sort((a, b) => a.index - b.index);
  let residue = segment;
  for (const hit of hits) residue = residue.replace(new RegExp(`(?:^|\\s)${hit.normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`), " ");
  residue = residue.replace(/\b(?:and|then|show|only|with)\b|[,]/g, " ").replace(/\s+/g, " ").trim();
  if (!hits.length || residue) {
    blockers.push(`columns contain a value not proven in the exact live ordered vocabulary${residue ? `: ${residue}` : ""}`);
    return null;
  }
  return hits.map(item => item.name);
}

function exactSelectedContract(context, blockers) {
  const item = context?.selected_contract;
  if (!item || typeof item !== "object" || !String(item.id ?? "").trim()
    || !String(item.expiration ?? "").trim() || !Number.isFinite(Number(item.strike))
    || !["Call", "Put"].includes(item.option_type)) {
    blockers.push("contract handoff requires one exact selected live row with id, expiration, strike, and Call/Put identity");
    return null;
  }
  return { id: String(item.id), expiration: String(item.expiration), strike: Number(item.strike), option_type: item.option_type };
}

function rememberedState(context, mode, actions) {
  const current = context?.current_state ?? {};
  const activeMode = mode ?? current.mode ?? null;
  if (!activeMode) return current;
  const oldModes = current.per_mode ?? {};
  const prior = oldModes[activeMode] ?? {};
  const next = { ...prior };
  for (const action of actions) {
    if (action.feature === "expiration") next.expiration = action.value;
    else if (action.feature === "months out") next.months_out = action.value;
    else if (action.feature === "strike depth") next.strike_depth = action.value;
    else if (action.feature === "strikes above") next.strikes_above = action.value;
    else if (action.feature === "strikes below") next.strikes_below = action.value;
    else if (action.feature === "columns") next.columns = action.value;
    else if (action.feature === "Greek visibility") {
      const set = new Set(next.greeks ?? []);
      if (action.operation === "show") set.add(action.value); else set.delete(action.value);
      next.greeks = [...set];
    }
  }
  return { ...current, mode: activeMode, per_mode: { ...oldModes, [activeMode]: next } };
}

export function compileOMONVoice(context = {}, utterance) {
  const text = corrected(utterance);
  if (!text || text.split(" ").length > 100) return null;
  if (/\b(?:buy|sell|exercise)\b|\b(?:submit|place|send|cancel) (?:an? |the |this )?(?:option|contract|trade|order)\b/.test(text)) {
    return { kind: "blocked", command: "OMON", actions: [], executable_actions: [], blockers: ["OMON voice is read-only and can never create, submit, cancel, or exercise an order"], confirmation_required: false, ready_for_live_executor: false };
  }

  const actions = [];
  const blockers = [];
  const contradictions = [];
  const callsOnly = /\bcalls? only\b/.test(text);
  const putsOnly = /\bputs? only\b/.test(text);
  if (callsOnly && putsOnly) contradictions.push("mode cannot be both Calls-only and Puts-only");
  const callsMentioned = /\bcalls?\b/.test(text);
  const putsMentioned = /\bputs?\b/.test(text);
  let mode = /\bboth\b|\bcalls? and puts?\b|\bputs? and calls?\b/.test(text) ? "Both"
    : callsOnly || (callsMentioned && !putsMentioned) ? "Calls"
      : putsOnly || (putsMentioned && !callsMentioned) ? "Puts" : null;
  if (mode) actions.push({ feature: "mode", operation: "select", value: mode, scope: "panel" });
  const effectiveMode = mode ?? context?.current_state?.mode ?? null;

  const expiry = resolveExpiry(context, text, effectiveMode, blockers);
  if (expiry) actions.push({ feature: "expiration", operation: "select", value: expiry, scope: "mode" });

  const months = text.match(/\b(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty) months? out\b/);
  if (months) actions.push({ feature: "months out", operation: "set", value: number(months[1]), scope: "mode" });

  const around = /\b(?:around|near) spot\b/.test(text);
  const total = text.match(/\b(?:show|display|use|make(?: (?:it|the (?:chain|option chain)))?)?\s*(\d+|five|ten|fifteen|twenty|twenty five|thirty|forty|fifty)\s+strikes?(?:\s+(?:deep|total))?\b/);
  if (around && total) blockers.push("“strikes around spot” is ambiguous above versus below; request native total depth or exact above and below counts");
  else if (total && !/\b(?:above|below|either side|each side)\b/.test(text)) {
    actions.push({ feature: "strike depth", operation: "set", value: number(total[1]), scope: "panel" });
  }
  const either = text.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty) strikes? (?:on )?(?:either|each) side\b/);
  for (const side of ["above", "below"]) {
    const match = text.match(new RegExp(`\\b(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty)(?: strikes?)? ${side}\\b`));
    const value = match ? number(match[1]) : either ? number(either[1]) : null;
    if (value != null) actions.push({ feature: `strikes ${side}`, operation: "set", value, scope: "mode" });
  }

  const showGreeks = /\b(?:show|add|include|with)\b/.test(text) || /\bgreeks?\b/.test(text);
  const hideGreeks = /\b(?:hide|remove|exclude|without)\b/.test(text);
  const mentionedGreeks = OMON_GREEKS.filter(greek => new RegExp(`\\b${greek.toLowerCase()}\\b`).test(text));
  if (mentionedGreeks.length && showGreeks && hideGreeks) contradictions.push("Greek visibility contains both show and hide instructions");
  else for (const greek of mentionedGreeks) actions.push({ feature: "Greek visibility", operation: hideGreeks ? "hide" : "show", value: greek, scope: "mode" });

  const columns = resolveColumns(context, text, blockers);
  if (columns) actions.push({ feature: "columns", operation: "configure", value: columns, scope: "mode" });

  const destinations = [];
  if (/\b(?:in|to|into) focus\b/.test(text)) destinations.push("FOCUS");
  if (/\b(?:in|to|into) (?:a |the )?chart\b|\b(?:a|the) chart\b/.test(text)) destinations.push("G");
  if (/\bblack scholes\b|\b(?:in|to|into) ovme\b/.test(text)) destinations.push("OVME");
  if (destinations.length) {
    const contract = exactSelectedContract(context, blockers);
    if (contract) for (const destination of [...new Set(destinations)]) {
      actions.push({ feature: "contract", operation: "open", value: { destination, contract }, scope: "selected-row" });
    }
  }

  if (contradictions.length) return { kind: "clarify", command: "OMON", actions: [], executable_actions: [], blockers: contradictions, confirmation_required: false, ready_for_live_executor: false };
  if (!actions.length && !blockers.length) return null;
  const needsEntitlement = actions.some(action => action.feature !== "contract");
  const entitlement = context?.option_entitlement === true || context?.existing_panel_authenticated === true;
  if (needsEntitlement && !entitlement) blockers.push("option entitlement must be confirmed by the loaded OMON panel before configuration");
  const unbound = actions.filter(action => OMON_ACTION_STATES[action.feature] !== "live");
  const live = actions.filter(action => OMON_ACTION_STATES[action.feature] === "live");
  const executable = blockers.length === 0 && unbound.length === 0 ? live : [];
  return {
    kind: "candidate", command: "OMON", actions, executable_actions: executable,
    blockers: [...new Set(blockers)], unbound_actions: unbound,
    desired_state: rememberedState(context, effectiveMode, actions),
    confirmation_required: false,
    ready_for_live_executor: executable.length > 0 && executable.length === actions.length
  };
}
