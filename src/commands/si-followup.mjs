import { SI_DISPLAY_FIELDS, normalizeSIAction, normalizeSIGroundedFacts } from "./si-actions.mjs";

const FIELD_PATTERNS = Object.freeze([
  ["Latest Report Date", /\b(?:latest report date|report date|latest reported date)\b/],
  ["Short Interest", /\bshort interest\b/],
  ["Short Ratio / Days to Cover", /\b(?:short ratio|days? to cover|day(?:s)? two cover)\b/],
  ["Average Daily Volume", /\b(?:average daily volume|avg daily volume|a d v)\b/]
]);
function clean(value) {
  return String(value ?? "").toLowerCase().replace(/\bshort in\s*(?:ter|t)?est\b/g, "short interest")
    .replace(/\bfin rah\b/g, "finra").replace(/\bday two cover\b/g, "days to cover")
    .replace(/[^a-z0-9/.' -]+/g, " ").replace(/\s+/g, " ").trim();
}
function add(blockers, message) { if (!blockers.includes(message)) blockers.push(message); }
function corrected(text, patterns) {
  const parts = text.split(/\s+(?:no |actually )?(?:sorry|correction)\s+/);
  if (parts.length < 2 || !patterns.some(([, pattern]) => pattern.test(parts.at(-1)))) return text;
  return parts.at(-1);
}
function fields(text) { return FIELD_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([field]) => field); }
function wantsRead(text) { return /\b(?:what is|what are|read|tell me|say|narrate|how much|how many)\b/.test(text); }
function wantsDisplay(text) { return /\b(?:show|display|select|include|table|view)\b/.test(text); }

export function compileSIFollowup(context, utterance) {
  const command = String(typeof context === "string" ? context : context?.command ?? "").toUpperCase();
  if (command !== "SI") return null;
  const text = clean(utterance);
  if (!text || text.split(" ").length > 140) return null;
  const blockers = [];
  const actions = [];
  const current = typeof context === "object" ? context.current_config ?? {} : {};

  const rangeText = corrected(text, [["Range", /\b(?:from|between) \d{4}[-/]\d{2}[-/]\d{2}/]]);
  const range = /\b(?:from|between)\s+(\d{4}[-/]\d{2}[-/]\d{2})\s+(?:to|through|and)\s+(\d{4}[-/]\d{2}[-/]\d{2})\b/.exec(rangeText);
  if (range) actions.push({ feature:"date_range", operation:"set", value:{ from:range[1].replaceAll("/", "-"), to:range[2].replaceAll("/", "-") } });
  if (/\b(?:last|past|this|previous) (?:week|month|quarter|year)|\bsince \d{4}\b/.test(text) && !range) {
    add(blockers, "SI relative date ranges are ambiguous; provide exact ISO from/to dates.");
  }

  const requested = fields(corrected(text, FIELD_PATTERNS));
  const read = wantsRead(text);
  const display = wantsDisplay(text) || (!read && requested.length > 0);
  let groundedNarration = null;
  const requestsRealtime = /\b(?:today'?s|right now|real time|realtime|live) short interest\b|\bcurrent intraday short interest\b/.test(text);
  if (requestsRealtime) add(blockers, "FINRA short-interest data is reported twice monthly; SI cannot provide live or today's short interest.");
  if (read) {
    if (!requested.length) add(blockers, "Grounded SI narration requires at least one exact requested field.");
    else {
      try {
        const facts = normalizeSIGroundedFacts(context?.grounded_facts);
        groundedNarration = { fields: requested, cadence: "FINRA twice-monthly", facts };
      } catch (error) { add(blockers, `${error.message}; SI values will not be invented.`); }
    }
  }
  if (display && requested.length) {
    actions.push({ feature:"display", operation:"select", value:[...new Set([...(current.display_fields ?? []), ...requested])] });
  }
  if (/\brefresh\b|\breload\b|\bcheck for (?:a )?new report\b/.test(text)) actions.push({ feature:"refresh", operation:"refresh", value:null });

  for (let index = 0; index < actions.length; index++) try { actions[index] = normalizeSIAction(actions[index]); } catch (error) { add(blockers, error.message); }
  if (!actions.length && !groundedNarration && !blockers.length) return null;
  const target = typeof context === "object" ? context.target ?? { mode:"last", command:"SI", security:null } : { mode:"last", command:"SI", security:null };
  return {
    kind:"si-contextual-workflow-draft", command:"SI", target, actions, blockers,
    grounded_narration:groundedNarration,
    ready_for_grounded_narration:Boolean(groundedNarration) && blockers.length === 0,
    ready_for_live_executor:false,
    blocked_reason:actions.length ? "SI date, display, and refresh controls remain disabled until exact live bindings and FINRA report postconditions are proven." : null,
    configure_step_draft:blockers.length || !actions.length ? null : { id:"configure-si-1", kind:"configure", target, actions, required:true },
    data_cadence:"FINRA twice-monthly", current_config_preserved:current
  };
}
