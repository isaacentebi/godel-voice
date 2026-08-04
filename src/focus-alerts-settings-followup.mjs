export const FOCUS_FIELDS = Object.freeze(["last", "change", "change_percent", "bid", "ask", "volume", "day_range"]);
export const PDF_PREFERENCES = Object.freeze(["theme", "font", "table_animation", "grid_snapping", "grid_size", "terminal_zoom", "help_popout_icons", "terminal_key", "des_default_chart", "command_titles", "breaking_news", "ticker_click_behavior", "pinned_commands", "external_link_trust"]);

function clean(value) {
  return String(value ?? "").toLowerCase()
    .replace(/\bprice flesh(?:ing)?\b/g, "price flashing").replace(/\bpop outt?\b/g, "pop out")
    .replace(/\b(?:allerts|a lerts)\b/g, "alerts").replace(/\bpee dee eff\b/g, "pdf")
    .replace(/\bgrid snack(?:ing)?\b/g, "grid snapping")
    .replace(/[^a-z0-9.$%/_:+ -]+/g, " ").replace(/\s+/g, " ").trim();
}
function corrected(value) { return clean(value).split(/\b(?:wait no|no sorry|actually|scratch that|i mean|rather|correction)\b/).at(-1).trim(); }
function base(kind, command, blockers = []) { return { kind, command, actions: [], executable_actions: [], blockers, ready_for_live_executor: false }; }
function validSecurity(value) {
  return value && typeof value === "object" && /^[A-Z][A-Z0-9.-]{0,14}$/.test(String(value.ticker ?? ""))
    && String(value.venue ?? "").trim() && String(value.asset_class ?? "").trim();
}
function securityIdentity(value) { return { ticker: String(value.ticker), venue: String(value.venue), asset_class: String(value.asset_class) }; }

export function normalizeFOCUSFacts(value) {
  if (!value || typeof value !== "object" || value.observed !== true || value.source !== "Godel FOCUS panel" || !validSecurity(value.security)) throw new Error("FOCUS facts require an exact observed Godel panel and security");
  const numeric = ["last", "change", "change_percent", "bid", "ask", "volume", "day_low", "day_high"];
  for (const key of numeric) if (value[key] != null && (typeof value[key] !== "number" || !Number.isFinite(value[key]))) throw new Error(`FOCUS ${key} must be a finite observed number`);
  if (value.last == null || !String(value.currency ?? "").trim() || !String(value.as_of ?? "").trim()) throw new Error("FOCUS facts require last, currency, and timestamp");
  if ((value.day_low == null) !== (value.day_high == null) || (value.day_low != null && value.day_low > value.day_high)) throw new Error("FOCUS day range is incomplete or inverted");
  return { security: securityIdentity(value.security), last: value.last, change: value.change ?? null, change_percent: value.change_percent ?? null, bid: value.bid ?? null, ask: value.ask ?? null, volume: value.volume ?? null, day_low: value.day_low ?? null, day_high: value.day_high ?? null, currency: String(value.currency), as_of: String(value.as_of), source: value.source };
}

function focusReadFields(text) {
  const fields = [];
  if (/\b(?:quote|last|price)\b/.test(text)) fields.push("last");
  if (/\bchange percent|percentage change\b/.test(text)) fields.push("change_percent");
  else if (/\bchange\b/.test(text)) fields.push("change");
  if (/\bbid\b/.test(text)) fields.push("bid");
  if (/\bask\b/.test(text)) fields.push("ask");
  if (/\bvolume\b/.test(text)) fields.push("volume");
  if (/\b(?:day range|day low|day high|low high|range)\b/.test(text)) fields.push("day_range");
  return [...new Set(fields)];
}

export function compileFOCUSVoice(context = {}, utterance) {
  const text = corrected(utterance);
  if (!text || text.split(" ").length > 100) return null;
  const on = /\b(?:turn on|enable|start) (?:the )?price flashing\b/.test(text);
  const off = /\b(?:turn off|disable|stop|no) (?:the )?price flashing\b/.test(text);
  const flashingConflict = /\b(?:turn on|enable|start)\s+(?:and|but)\s+(?:turn off|disable|stop) (?:the )?price flashing\b/.test(text);
  const popout = /\b(?:pop out|detach|open in (?:a )?native window)\b/.test(text);
  const fields = focusReadFields(text);
  const read = fields.length && /\b(?:read|tell me|say|what is|what's|how much)\b/.test(text);
  if (flashingConflict || (on && off)) return { ...base("clarify", "FOCUS", ["FOCUS price flashing cannot be both on and off"]), grounded_narration: null };
  if (!on && !off && !popout && !read) return null;
  if (!validSecurity(context.security)) return { ...base("clarify", "FOCUS", ["FOCUS actions require one exact resolved security identity"]), grounded_narration: null };
  const security = securityIdentity(context.security);
  const actions = [];
  if (on || off) actions.push({ feature: "price flashing", operation: "select", value: on ? "on" : "off", scope: "panel" });
  if (popout) actions.push({ feature: "native popout", operation: "open", value: { security }, scope: "native-window" });
  const blockers = [];
  let groundedNarration = null;
  if (read) try {
    const facts = normalizeFOCUSFacts(context.grounded_facts);
    if (JSON.stringify(facts.security) !== JSON.stringify(security)) blockers.push("FOCUS grounded quote does not match the exact requested security");
    else {
      const missing = fields.filter(field => field === "day_range" ? facts.day_low == null || facts.day_high == null : facts[field] == null);
      if (missing.length) blockers.push(`FOCUS panel does not expose the requested observed fields: ${missing.join(", ")}`);
      else groundedNarration = { security, fields, facts };
    }
  } catch (error) { blockers.push(`${error.message}; no quote value will be invented`); }
  return { kind: blockers.length ? "clarify" : "candidate", command: "FOCUS", security, actions, executable_actions: [], blockers, grounded_narration: groundedNarration, ready_for_grounded_narration: Boolean(groundedNarration) && !blockers.length, ready_for_live_executor: false };
}

function validAlert(value) {
  return value && typeof value === "object" && String(value.id ?? "").trim() && validSecurity(value.security)
    && String(value.condition ?? "").trim() && typeof value.enabled === "boolean" && value.observed === true;
}
function alertIdentity(value) { return { id: String(value.id), security: securityIdentity(value.security), condition: String(value.condition), enabled: value.enabled, triggered: value.triggered === true }; }
export function normalizeALGroundedFacts(value) {
  if (!value || value.observed !== true || value.source !== "Godel AL panel" || !Array.isArray(value.alerts) || value.alerts.length > 500 || !value.alerts.every(validAlert)) throw new Error("AL facts require exact observed alert rows from Godel");
  return { source: value.source, as_of: String(value.as_of ?? ""), alerts: value.alerts.map(alertIdentity) };
}

function alertMutation(text) {
  const result = [];
  if (/\b(?:create|set|add|new) (?:a |an )?(?:price )?alert\b/.test(text)) result.push("create");
  if (/\b(?:edit|change|modify) (?:this |the |selected )?alert\b/.test(text)) result.push("edit");
  if (/\b(?:delete|remove) (?:this |the |selected )?alert\b/.test(text)) result.push("delete");
  if (/\b(?:enable|turn on) (?:this |the |selected )?alert\b/.test(text)) result.push("enable");
  if (/\b(?:disable|turn off|pause) (?:this |the |selected )?alert\b/.test(text)) result.push("disable");
  return [...new Set(result)];
}

export function compileALVoice(context = {}, utterance) {
  const text = corrected(utterance);
  if (!text || text.split(" ").length > 120) return null;
  if (/\balert\b/.test(text) && ((/\benable\b/.test(text) && /\bdisable\b/.test(text)) || (/\bcreate\b/.test(text) && /\bdelete\b/.test(text)))) {
    return { ...base("clarify", "AL", ["Alert request contains conflicting mutations"]), required_confirmation: true };
  }
  const mutations = alertMutation(text);
  if (mutations.length > 1) return { ...base("clarify", "AL", ["Alert request contains conflicting mutations"]), required_confirmation: true };
  if (mutations.length === 1) {
    const operation = mutations[0];
    const blockers = [];
    let value = null;
    if (operation === "create") {
      const match = text.match(/\b(above|below|at)\s+\$?([0-9]+(?:\.[0-9]+)?)\b/);
      if (!validSecurity(context.security)) blockers.push("Alert creation requires one exact resolved security");
      if (!match || !Number.isFinite(Number(match[2])) || Number(match[2]) <= 0) blockers.push("Alert creation requires one explicit positive price and relation: above, below, or at");
      if (!blockers.length) value = { security: securityIdentity(context.security), relation: match[1], price: Number(match[2]) };
    } else {
      if (!validAlert(context.selected_alert)) blockers.push(`Alert ${operation} requires one exact selected live alert identity`);
      else value = alertIdentity(context.selected_alert);
    }
    return { ...base(blockers.length ? "clarify" : "confirmation-required", "AL", blockers), proposed_action: value ? { feature: "alert", operation, value, scope: operation === "create" ? "account" : "selected-row" } : null, required_confirmation: true, unsupported_unattended: true };
  }
  const open = /\b(?:open|show|list) (?:my |the )?(?:existing )?alerts\b/.test(text);
  const read = /\b(?:read|tell me|which|what)\b.*\balerts?\b|\balert status\b/.test(text);
  if (!open && !read) return null;
  const actions = open ? [{ feature: "alert list", operation: "open", value: "existing", scope: "panel" }] : [];
  const blockers = [];
  let groundedNarration = null;
  if (read) try { groundedNarration = normalizeALGroundedFacts(context.grounded_facts); }
  catch (error) { blockers.push(`${error.message}; no alert will be invented`); }
  return { kind: blockers.length ? "clarify" : "candidate", command: "AL", actions, executable_actions: [], blockers, grounded_narration: groundedNarration, ready_for_grounded_narration: Boolean(groundedNarration) && !blockers.length, ready_for_live_executor: false };
}

const BOOLEAN_PREFERENCES = Object.freeze({
  "table animation": "table_animation", "grid snapping": "grid_snapping", "help icons": "help_popout_icons", "popout icons": "help_popout_icons",
  "des chart": "des_default_chart", "description chart": "des_default_chart", "command titles": "command_titles", "breaking news": "breaking_news", "external link trust": "external_link_trust"
});
const DYNAMIC_PREFERENCES = Object.freeze({ "theme": "theme", "font": "font", "grid size": "grid_size", "terminal zoom": "terminal_zoom", "terminal key": "terminal_key", "ticker click behavior": "ticker_click_behavior", "pinned commands": "pinned_commands" });

function resolveLiveOption(context, key, spoken) {
  const options = context.live_options?.[key];
  if (!Array.isArray(options)) return null;
  const matches = options.filter(value => clean(value) === clean(spoken));
  return matches.length === 1 ? matches[0] : null;
}

export function compilePDFSettingsVoice(context = {}, utterance) {
  const text = corrected(utterance);
  if (!text || text.split(" ").length > 140) return null;
  if (/\b(?:save|download|export|open) (?:this |the )?(?:article |file )?(?:as )?(?:a )?pdf\b/.test(text)) return { ...base("blocked", "PDF", ["The Godel PDF command is preferences/settings, not a file or article PDF action"]) };
  const saysNoChange = /\b(?:do not|don't|dont) change (?:anything|settings?)\b/.test(text);
  const openOnly = /\b(?:open|show) (?:terminal |godel )?(?:settings|preferences)\b/.test(text) && (saysNoChange || !/\b(?:set|change|turn|enable|disable|pin|unpin|increase|decrease)\b/.test(text));
  const proposals = [];
  const blockers = [];
  for (const [spoken, key] of Object.entries(BOOLEAN_PREFERENCES)) if (text.includes(spoken)) {
    const escaped = spoken.replaceAll(" ", "\\s+");
    const directConflict = new RegExp(`\\b(?:enable|turn on)\\s+(?:the )?${escaped}\\s+(?:and|but)\\s+(?:disable|turn off)\\s+(?:the )?${escaped}\\b|\\b(?:enable|turn on)\\s+(?:and|but)\\s+(?:disable|turn off)\\s+(?:the )?${escaped}\\b`).test(text);
    const on = new RegExp(`\\b(?:turn on|enable|show|use|trust) (?:the )?${spoken.replaceAll(" ", "\\s+")}\\b`).test(text);
    const off = new RegExp(`\\b(?:turn off|disable|hide|do not trust|don't trust|dont trust) (?:the )?${spoken.replaceAll(" ", "\\s+")}\\b`).test(text);
    if (directConflict || (on && off)) blockers.push(`${key} cannot be both enabled and disabled`);
    else if (on || off) proposals.push({ feature: "preference", operation: "set", value: { key, value: on }, scope: "account" });
  }
  for (const [spoken, key] of Object.entries(DYNAMIC_PREFERENCES)) {
    const match = text.match(new RegExp(`\\b(?:set|change|use) (?:the )?${spoken.replaceAll(" ", "\\s+")} (?:to )?([a-z0-9.+/_ -]+?)(?=\\s+(?:and|then)\\s+|$)`));
    if (match) {
      const exact = resolveLiveOption(context, key, match[1].trim());
      if (exact == null) blockers.push(`${key} requires one exact value from the current live settings control`);
      else proposals.push({ feature: "preference", operation: "set", value: { key, value: exact }, scope: "account" });
    }
  }
  if (/\b(?:increase|decrease) (?:the )?(?:terminal )?zoom\b/.test(text)) blockers.push("Relative terminal zoom requires an exact target value from the live control");
  if (/\b(?:pin|unpin)\b/.test(text) && !proposals.some(item => item.value.key === "pinned_commands")) blockers.push("Pinned-command changes require one exact command list from the live settings control");
  if (openOnly && !proposals.length && !blockers.length) return { ...base("candidate", "PDF"), actions: [{ feature: "settings", operation: "open", value: "read-only", scope: "panel" }] };
  if (!proposals.length && !blockers.length) return null;
  const trust = proposals.some(item => item.value.key === "external_link_trust");
  return {
    ...base(blockers.length ? "clarify" : "confirmation-required", "PDF", blockers),
    proposed_actions: blockers.length ? [] : proposals,
    required_confirmation: trust ? "explicit-trust-change" : "persistent-settings-change",
    unsupported_unattended: true,
    desired_state: { ...(context.current_state ?? {}), ...Object.fromEntries(proposals.map(item => [item.value.key, item.value.value])) }
  };
}

export function compileFocusAlertsSettingsVoice(context = {}, utterance) {
  const command = String(context?.command ?? context ?? "").toUpperCase();
  if (command === "FOCUS") return compileFOCUSVoice(typeof context === "object" ? context : {}, utterance);
  if (command === "AL") return compileALVoice(typeof context === "object" ? context : {}, utterance);
  if (command === "PDF") return compilePDFSettingsVoice(typeof context === "object" ? context : {}, utterance);
  return null;
}
