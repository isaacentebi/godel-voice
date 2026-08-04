export const AUM_TABS = Object.freeze(["Global", "Personal"]);

function clean(value) {
  return String(value ?? "").toLowerCase()
    .replace(/\ba\s+u\s+m\b/g, "aum")
    .replace(/\b(?:brocker|brockerage|broker age)\b/g, "brokerage")
    .replace(/\brefreshh\b/g, "refresh")
    .replace(/[^a-z0-9.,/&+:' -]+/g, " ").replace(/\s+/g, " ").trim();
}

function corrected(value) {
  return clean(value).split(/\b(?:wait no|no sorry|actually|scratch that|i mean|rather|correction)\b/).at(-1).trim();
}

function base(kind, command, blockers = []) {
  return { kind, command, actions: [], executable_actions: [], blockers, ready_for_live_executor: false };
}

function finiteNonNegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function normalizeAUMGroundedTotal(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("AUM total requires exact live panel facts");
  const keys = Object.keys(value).sort();
  const allowed = ["as_of", "currency", "observed", "source", "tab", "total"];
  if (keys.some(key => !allowed.includes(key))) throw new Error("AUM facts contain an unapproved or sensitive field");
  if (!AUM_TABS.includes(value.tab) || value.observed !== true || value.source !== "Godel AUM panel") throw new Error("AUM total is not authenticated to the current Godel AUM panel");
  if (!finiteNonNegative(value.total) || !/^[A-Z]{3}$/.test(String(value.currency ?? "")) || !String(value.as_of ?? "").trim()) throw new Error("AUM total has an invalid amount, currency, or timestamp");
  return { tab: value.tab, total: value.total, currency: value.currency, as_of: value.as_of, source: value.source };
}

function requestedAUMTabs(text) {
  const tabs = [];
  if (/\bglobal(?: aum| assets?| tab| total)?\b/.test(text)) tabs.push("Global");
  if (/\bpersonal(?: aum| assets?| tab| total| accounts?)?\b|\bmy (?:linked |connected )?brokerage (?:aum|account value|total)\b|\bmy aum\b/.test(text)) tabs.push("Personal");
  return [...new Set(tabs)];
}

function asksForAmount(text) {
  return /\b(?:how much|read|say|announce|tell me)\b/.test(text)
    || /\bwhat(?:'s| is| are) (?:my |the )?(?:(?:global|personal) )?(?:aum|total|account value|assets under management)\b/.test(text);
}

function suppressesAmount(text) {
  return /\b(?:do not|don't|dont|never) (?:read|say|speak|announce|tell me) (?:the )?(?:amount|total|value)\b|\bsilently\b|\bprivacy mode\b/.test(text);
}

export function compileAUMVoice(context = {}, utterance) {
  const text = corrected(utterance);
  if (!text || text.split(" ").length > 100) return null;
  const tabs = requestedAUMTabs(text);
  const refresh = /\b(?:refresh|reload|update)\b/.test(text);
  const readAmount = asksForAmount(text);
  const noAmount = suppressesAmount(text);
  if (tabs.length > 1) return { ...base("clarify", "AUM", ["AUM tab cannot be both Global and Personal"]), grounded_narration: null };
  if (readAmount && noAmount) return { ...base("clarify", "AUM", ["The request both asks for and suppresses sensitive AUM amounts"]), grounded_narration: null };
  if (!tabs.length && !refresh && !readAmount) return null;

  const desiredTab = tabs[0] ?? context.current_tab ?? null;
  const actions = [];
  if (tabs[0]) actions.push({ feature: "tab", operation: "select", value: tabs[0], scope: "panel" });
  if (refresh) actions.push({ feature: "refresh", operation: "refresh", value: null, scope: "panel" });
  const blockers = [];
  let groundedNarration = null;
  if (readAmount) {
    if (refresh) blockers.push("AUM amount may be spoken only from the post-refresh panel state");
    else {
      try {
        const fact = normalizeAUMGroundedTotal(context.grounded_total);
        if (!desiredTab) blockers.push("AUM amount request requires an exact Global or Personal tab context");
        else if (fact.tab !== desiredTab) blockers.push(`AUM grounded total is for ${fact.tab}, not the requested ${desiredTab} tab`);
        else groundedNarration = fact;
      } catch (error) { blockers.push(`${error.message}; no amount will be spoken`); }
    }
  }
  return {
    kind: blockers.length ? "clarify" : "candidate", command: "AUM", actions, executable_actions: [], blockers,
    grounded_narration: groundedNarration, ready_for_grounded_narration: Boolean(groundedNarration) && blockers.length === 0,
    desired_state: { ...(context.current_state ?? {}), ...(desiredTab ? { tab: desiredTab } : {}) },
    configure_step_draft: blockers.length || !actions.length ? null : { command: "AUM", actions },
    ready_for_live_executor: false
  };
}

function validConnection(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.every(key => ["id", "brokerage", "account_label", "connected", "status", "observed"].includes(key))
    && String(value.id ?? "").trim() && String(value.brokerage ?? "").trim()
    && typeof value.connected === "boolean" && String(value.status ?? "").trim()
    && String(value.status).length <= 80 && value.observed === true;
}

function connectionIdentity(value) {
  return { id: String(value.id), brokerage: String(value.brokerage), account_label: value.account_label == null ? null : String(value.account_label), connected: value.connected, status: String(value.status) };
}

export function normalizeBROKGroundedStatus(value) {
  if (!value || typeof value !== "object" || value.observed !== true || value.source !== "Godel BROK panel" || !Array.isArray(value.connections)) throw new Error("BROK status requires exact live panel facts");
  if (value.connections.length > 100 || !value.connections.every(validConnection)) throw new Error("BROK connection status contains an invalid or unapproved field");
  return { source: value.source, as_of: String(value.as_of ?? ""), connections: value.connections.map(connectionIdentity) };
}

function mutationIntent(text) {
  const intents = [];
  if (/\breconnect\b/.test(text)) intents.push("reconnect");
  else if (/\bconnect\b/.test(text)) intents.push("connect");
  if (/\bdisconnect\b|\bunlink\b/.test(text)) intents.push("disconnect");
  if (/\brequest (?:a |another )?brokerage\b/.test(text)) intents.push("request brokerage");
  return [...new Set(intents)];
}

export function compileBROKVoice(context = {}, utterance) {
  const text = corrected(utterance);
  if (!text || text.split(" ").length > 100) return null;
  const credentialIntent = /\b(?:credential|password|passcode|api key|secret|token|query id|login)\b/.test(text);
  const financialMutation = /\b(?:buy|sell|trade|order|exercise|transfer|deposit|withdraw|move money|change balance|edit balance)\b/.test(text);
  const balanceRead = /\b(?:balance|buying power|cash available)\b/.test(text);
  if (credentialIntent) return { ...base("blocked", "BROK", ["Credentials, tokens, Query IDs, and login data are never accepted, retained, or repeated by voice"]), no_secret_logging: true };
  if (financialMutation) return { ...base("blocked", "BROK", ["BROK is a read-only connection manager and cannot perform orders or money movement"]), no_secret_logging: true };
  if (balanceRead) return { ...base("blocked", "BROK", ["BROK voice does not read balances; use an explicitly requested grounded Personal AUM total instead"]), no_secret_logging: true };

  const mutations = mutationIntent(text);
  if (mutations.length > 1) return { ...base("clarify", "BROK", ["BROK connection mutation has conflicting actions"]), no_secret_logging: true };
  if (mutations.length === 1) {
    const selected = validConnection(context.selected_connection) ? connectionIdentity(context.selected_connection) : null;
    const blockers = selected ? [] : ["BROK mutation requires one exact selected live brokerage connection"];
    return {
      ...base(blockers.length ? "clarify" : "confirmation-required", "BROK", blockers),
      proposed_action: selected ? { feature: "connection", operation: mutations[0], value: { id: selected.id, brokerage: selected.brokerage }, scope: "selected-row" } : null,
      required_confirmation: true, unsupported_unattended: true, no_secret_logging: true
    };
  }

  const open = /\b(?:open|show) (?:the )?(?:read only )?(?:brokerage|broker) (?:connection )?(?:manager|connections?|settings?)\b/.test(text);
  const readStatus = /\b(?:status|connection state|which accounts? (?:are )?connected|is (?:this|my) account connected|read (?:my )?connections?)\b/.test(text);
  if (!open && !readStatus) return null;
  const actions = open ? [{ feature: "manager", operation: "open", value: "read-only", scope: "panel" }] : [];
  const blockers = [];
  let groundedNarration = null;
  if (readStatus) {
    try {
      const facts = normalizeBROKGroundedStatus(context.grounded_status);
      if (/\b(?:this|selected) (?:account|connection)\b/.test(text)) {
        if (!validConnection(context.selected_connection)) blockers.push("BROK selected-account status requires one exact selected live connection");
        else {
          const match = facts.connections.filter(item => item.id === String(context.selected_connection.id));
          if (match.length !== 1) blockers.push("BROK selected connection does not match one exact grounded row");
          else groundedNarration = { source: facts.source, as_of: facts.as_of, connections: match };
        }
      } else groundedNarration = facts;
    } catch (error) { blockers.push(`${error.message}; no connection status will be invented`); }
  }
  return {
    kind: blockers.length ? "clarify" : "candidate", command: "BROK", actions, executable_actions: [], blockers,
    grounded_narration: groundedNarration, ready_for_grounded_narration: Boolean(groundedNarration) && blockers.length === 0,
    no_secret_logging: true, ready_for_live_executor: false
  };
}

export function compileAUMBROKVoice(context = {}, utterance) {
  const command = String(context?.command ?? context ?? "").toUpperCase();
  if (command === "AUM") return compileAUMVoice(typeof context === "object" ? context : {}, utterance);
  if (command === "BROK") return compileBROKVoice(typeof context === "object" ? context : {}, utterance);
  return null;
}
