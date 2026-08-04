import { ERN_DISPLAY_FIELDS, normalizeERNAction, normalizeGroundedForwardPE } from "./ern-actions.mjs";

const FIELD_PATTERNS = Object.freeze([
  ["Analyst Count", /\b(?:analyst count|number of analysts?|how many analysts?)\b/],
  ["Low EPS", /\b(?:low eps|lowest eps|low estimate)\b/], ["High EPS", /\b(?:high eps|highest eps|high estimate)\b/],
  ["Average EPS", /\b(?:average eps|avg eps|mean eps|consensus eps)\b/],
  ["Forward P/E", /\b(?:forward|fwd)\s+(?:(?:p|pee)\s*(?:\/|to|over)?\s*e|price to earnings?)\b/],
  ["EPS YoY", /\b(?:eps yoy|e p s year over year|eps year over year)\b/],
  ["Earnings History", /\b(?:earnings history|historical earnings)\b/],
  ["Estimate vs Actual", /\b(?:estimate|estimates)\s+(?:vs|versus|against)\s+actuals?\b|\bactual vs estimates?\b/],
  ["Beat/Miss Percentage", /\b(?:beat miss percentage|beat\/miss percentage|beat or miss percent|beat rate|miss rate)\b/]
]);
function clean(value) {
  return String(value ?? "").toLowerCase()
    .replace(/\bearnins?\b/g, "earnings").replace(/\besty mates?\b/g, "estimates")
    .replace(/\bpee ee\b/g, "pee e").replace(/\be p s\b/g, "eps")
    .replace(/[^a-z0-9/%.' -]+/g, " ").replace(/\s+/g, " ").trim();
}
function add(blockers, message) { if (!blockers.includes(message)) blockers.push(message); }
function correction(text, patterns) {
  const parts = text.split(/\s+(?:no |actually )?(?:sorry|correction)\s+/);
  if (parts.length < 2 || !patterns.some(([, pattern]) => pattern.test(parts.at(-1)))) return text;
  return parts.at(-1);
}
function fields(text) { return FIELD_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([field]) => field); }
function wantsRead(text) { return /\b(?:what is|what are|read|tell me|say|narrate|how much|how many)\b/.test(text); }
function wantsDisplay(text) { return /\b(?:show|display|select|include|open|table|view)\b/.test(text); }

export function compileERNFollowup(context, utterance) {
  const command = String(typeof context === "string" ? context : context?.command ?? "").toUpperCase();
  if (command !== "ERN") return null;
  let text = clean(utterance);
  if (!text || text.split(" ").length > 140) return null;
  const blockers = [];
  const actions = [];
  const current = typeof context === "object" ? context.current_config ?? {} : {};

  const explicitRange = /\b(?:from|between)\s+(\d{4}[-/]\d{2}[-/]\d{2})\s+(?:to|through|and)\s+(\d{4}[-/]\d{2}[-/]\d{2})\b/.exec(text);
  if (explicitRange) actions.push({ feature: "date_range", operation: "set", value: { start: explicitRange[1].replaceAll("/", "-"), end: explicitRange[2].replaceAll("/", "-") } });
  if (/\b(?:last|this|next|previous) (?:quarter|year)|\bthrough \d{4}\b|\bsince \d{4}\b/.test(text) && !explicitRange) {
    add(blockers, "ERN relative or fiscal periods are ambiguous; provide an exact ISO date range or select Quarterly/Annual display.");
  }

  const periodText = correction(text, [["Quarterly", /\b(?:quarterly|quarter by quarter)\b/], ["Annual", /\b(?:annual|annually|yearly)\b/]]);
  const quarterly = /\b(?:quarterly|quarter by quarter)\b/.test(periodText);
  const annual = /\b(?:annual|annually|yearly)\b/.test(periodText);
  if (quarterly && annual) add(blockers, "Conflicting ERN periods were requested: Quarterly and Annual.");
  else if (quarterly || annual) actions.push({ feature: "period", operation: "select", value: quarterly ? "Quarterly" : "Annual" });

  const requestedFields = fields(correction(text, FIELD_PATTERNS));
  const read = wantsRead(text);
  const display = wantsDisplay(text) || (!read && requestedFields.length > 0);
  let groundedNarration = null;
  if (read) {
    if (requestedFields.length !== 1) add(blockers, "Grounded ERN narration requires one exact requested field.");
    else if (requestedFields[0] !== "Forward P/E") add(blockers, `No grounded ERN reader is live-proven for ${requestedFields[0]}; values will not be invented.`);
    else {
      try {
        const facts = normalizeGroundedForwardPE(context?.grounded_facts?.forward_pe);
        groundedNarration = { field: "Forward P/E", unit: "Multiple", source: "Godel ERN panel", facts };
      } catch (error) { add(blockers, `${error.message}; values will not be invented.`); }
    }
  }
  if (display && requestedFields.length) {
    const desired = [...new Set([...(current.display_fields ?? []), ...requestedFields])];
    actions.push({ feature: "display", operation: "select", value: desired });
  }

  for (let index = 0; index < actions.length; index++) try { actions[index] = normalizeERNAction(actions[index]); } catch (error) { add(blockers, error.message); }
  if (!actions.length && !groundedNarration && !blockers.length) return null;
  const target = typeof context === "object" ? context.target ?? { mode: "last", command: "ERN", security: null } : { mode: "last", command: "ERN", security: null };
  return {
    kind: "ern-contextual-workflow-draft", command: "ERN", target, actions, blockers,
    grounded_narration: groundedNarration,
    ready_for_grounded_narration: Boolean(groundedNarration) && blockers.length === 0,
    ready_for_live_executor: false,
    blocked_reason: actions.length ? "ERN display controls remain disabled pending exact live bindings; only grounded forward-P/E narration is currently proven." : null,
    configure_step_draft: blockers.length || !actions.length ? null : { id: "configure-ern-1", kind: "configure", target, actions, required: true },
    current_config_preserved: current
  };
}
