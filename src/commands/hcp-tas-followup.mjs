import {
  HCP_PERIODS,
  normalizeHCPAction,
  normalizeOHLCVRows,
  normalizeTASAction
} from "./hcp-tas-actions.mjs";

function clean(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\btime and sells\b/g, "time and sales")
    .replace(/\bmilli seconds\b/g, "milliseconds")
    .replace(/[^a-z0-9/.' &%-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function add(blockers, message) {
  if (!blockers.includes(message)) blockers.push(message);
}

function corrected(text, relevant) {
  const pieces = text.split(/\s+(?:no |actually )?(?:sorry|correction)\s+/);
  return pieces.length > 1 && relevant.test(pieces.at(-1)) ? pieces.at(-1) : text;
}

function targetFor(context, command) {
  return typeof context === "object"
    ? context.target ?? { mode: "last", command, security: null }
    : { mode: "last", command, security: null };
}

export function compileHCPFollowup(context, utterance) {
  const command = String(typeof context === "string" ? context : context?.command ?? "").toUpperCase();
  if (command !== "HCP") return null;
  const text = clean(utterance);
  if (!text || text.split(" ").length > 120) return null;

  const blockers = [];
  const actions = [];
  const rangeText = corrected(text, /\b(?:1w|1m|3m|6m|1y|one week|one months?|three m(?:onth|unth)s?|six m(?:onth|unth)s?|one year|from \d{4}|between \d{4})\b/);
  const presetPatterns = [
    ["1W", /\b(?:1w|one week)\b/],
    ["1M", /\b(?:1m|one months?)\b/],
    ["3M", /\b(?:3m|three m(?:onth|unth)s?)\b/],
    ["6M", /\b(?:6m|six m(?:onth|unth)s?)\b/],
    ["1Y", /\b(?:1y|one year)\b/]
  ];
  const presets = presetPatterns.filter(([, pattern]) => pattern.test(rangeText)).map(([value]) => value);
  const range = /\b(?:from|between) (\d{4}[-/]\d{2}[-/]\d{2}) (?:to|through|and) (\d{4}[-/]\d{2}[-/]\d{2})\b/.exec(rangeText);
  if (presets.length > 1 || (presets.length && range)) {
    add(blockers, "Conflicting HCP ranges were requested.");
  } else if (range) {
    actions.push({
      feature: "range",
      operation: "set",
      value: { kind: "Custom", period: null, from: range[1].replaceAll("/", "-"), to: range[2].replaceAll("/", "-") }
    });
  } else if (presets.length) {
    actions.push({ feature: "range", operation: "set", value: { kind: "Preset", period: presets[0], from: null, to: null } });
  }

  const pageText = corrected(text, /\b(?:previous page|go back a page|next page)\b/);
  const pages = [
    ["Previous", /\b(?:previous page|go back a page)\b/],
    ["Next", /\bnext page\b/]
  ].filter(([, pattern]) => pattern.test(pageText)).map(([value]) => value);
  if (pages.length > 1) add(blockers, "Conflicting HCP page directions were requested.");
  else if (pages.length) actions.push({ feature: "page", operation: "select", value: pages[0] });

  let narration = null;
  if (/\b(?:read|tell me|what is|narrate)\b/.test(text) && /\b(?:ohlcv|open|high|low|close|volume|row)\b/.test(text)) {
    try {
      narration = {
        fields: ["Open", "High", "Low", "Close", "Volume"],
        rows: normalizeOHLCVRows(context?.grounded_rows),
        source: "Godel HCP table"
      };
    } catch (error) {
      add(blockers, `${error.message}; HCP values will not be invented.`);
    }
  }

  for (let index = 0; index < actions.length; index += 1) {
    try { actions[index] = normalizeHCPAction(actions[index]); }
    catch (error) { add(blockers, error.message); }
  }
  if (!actions.length && !narration && !blockers.length) return null;
  const target = targetFor(context, "HCP");
  return {
    kind: "hcp-contextual-workflow-draft",
    command: "HCP",
    target,
    actions,
    blockers,
    grounded_narration: narration,
    ready_for_grounded_narration: Boolean(narration) && !blockers.length,
    ready_for_live_executor: false,
    blocked_reason: actions.length ? "HCP controls remain disabled pending live proof." : null,
    configure_step_draft: blockers.length || !actions.length ? null : {
      id: "configure-hcp-1", kind: "configure", target, actions, required: true
    }
  };
}

function exactLive(name, options) {
  const matches = options.filter(option => option.toLowerCase() === name.trim().toLowerCase());
  return matches.length === 1 ? matches[0] : null;
}

export function compileTASFollowup(context, utterance) {
  const command = String(typeof context === "string" ? context : context?.command ?? "").toUpperCase();
  if (command !== "TAS") return null;
  const rawText = clean(utterance);
  if (!rawText || rawText.split(" ").length > 140) return null;
  const text = corrected(rawText, /\b(?:show|hide|add|remove|include|exclude|move|enable|disable|turn on|turn off)\b/);
  const blockers = [];
  const current = context?.current_config;
  const live = context?.live_options?.columns;
  if (!current || !Array.isArray(current.columns) || typeof current.price_flash !== "boolean" || typeof current.milliseconds !== "boolean") {
    add(blockers, "TAS changes require authoritative current columns and toggle state.");
  }
  if (!Array.isArray(live) || !live.length) add(blockers, "TAS changes require the exact live column vocabulary.");
  if (current && Array.isArray(live)) {
    const invalid = current.columns.find(column => !exactLive(column, live));
    if (invalid) add(blockers, `Authoritative TAS state contains a column outside the live vocabulary: ${invalid}.`);
  }

  const state = current ? {
    columns: [...current.columns],
    price_flash: current.price_flash,
    milliseconds: current.milliseconds
  } : null;
  const show = /\b(?:show|add|include) ([a-z0-9 &'/%.-]+?) column\b/.exec(text);
  const hide = /\b(?:hide|remove|exclude) ([a-z0-9 &'/%.-]+?) column\b/.exec(text);
  const move = /\bmove ([a-z0-9 &'/%.-]+?) column (before|after) ([a-z0-9 &'/%.-]+?) column\b/.exec(text);
  const flashOn = /\b(?:enable|turn on|show) (?:price )?flash(?:ing)?\b/.test(text);
  const flashOff = /\b(?:disable|turn off|hide) (?:price )?flash(?:ing)?\b/.test(text);
  const millisecondsOn = /\b(?:show|enable|turn on|include) milliseconds\b/.test(text);
  const millisecondsOff = /\b(?:hide|disable|turn off|exclude) milliseconds\b/.test(text);
  const touched = Boolean(show || hide || move || flashOn || flashOff || millisecondsOn || millisecondsOff);

  if (state && Array.isArray(live)) {
    if (show) {
      const column = exactLive(show[1], live);
      if (!column) add(blockers, `Unknown or ambiguous TAS live column: ${show[1].trim()}.`);
      else if (state.columns.some(value => value.toLowerCase() === column.toLowerCase())) add(blockers, `TAS column ${column} is already visible.`);
      else state.columns.push(column);
    }
    if (hide) {
      const column = exactLive(hide[1], live);
      if (!column || !state.columns.some(value => value.toLowerCase() === column.toLowerCase())) add(blockers, "TAS can hide only one exact currently visible live column.");
      else if (state.columns.length === 1) add(blockers, "TAS cannot hide its final visible column.");
      else state.columns = state.columns.filter(value => value.toLowerCase() !== column.toLowerCase());
    }
    if (move) {
      const moving = exactLive(move[1], live);
      const anchor = exactLive(move[3], live);
      const movingIndex = state.columns.findIndex(value => value === moving);
      const anchorIndex = state.columns.findIndex(value => value === anchor);
      if (movingIndex < 0 || anchorIndex < 0 || moving === anchor) {
        add(blockers, "TAS reorder requires two distinct currently visible exact columns.");
      } else {
        state.columns.splice(movingIndex, 1);
        const newAnchorIndex = state.columns.indexOf(anchor);
        state.columns.splice(newAnchorIndex + (move[2] === "after" ? 1 : 0), 0, moving);
      }
    }
    if (flashOn && flashOff) add(blockers, "TAS price flash was requested both on and off.");
    else if (flashOn || flashOff) state.price_flash = flashOn;
    if (millisecondsOn && millisecondsOff) add(blockers, "TAS milliseconds were requested both on and off.");
    else if (millisecondsOn || millisecondsOff) state.milliseconds = millisecondsOn;
  }

  let actions = [];
  if (touched && state) {
    try { actions = [normalizeTASAction({ feature: "table", operation: "configure", value: state })]; }
    catch (error) { add(blockers, error.message); }
  }
  if (!touched && !blockers.length) return null;
  const target = targetFor(context, "TAS");
  return {
    kind: "tas-contextual-workflow-draft",
    command: "TAS",
    target,
    actions,
    blockers,
    ready_for_live_executor: false,
    blocked_reason: "TAS remains disabled pending authoritative live columns and toggle postconditions.",
    configure_step_draft: blockers.length || !actions.length ? null : {
      id: "configure-tas-1", kind: "configure", target, actions, required: true
    }
  };
}

export { HCP_PERIODS };
