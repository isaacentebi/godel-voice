import {
  normalizeCommodityFacts,
  normalizeGLCOAction,
  normalizeVenueFacts,
  normalizeWorldAction,
  WORLD_COMMANDS
} from "./wei-glco-actions.mjs";

function clean(value) {
  return String(value ?? "").toLowerCase()
    .replace(/\bfewchers\b/g, "futures")
    .replace(/\bcommodaties\b/g, "commodities")
    .replace(/\bmetals?\b/g, match => match)
    .replace(/[^a-z0-9&%/.' -]+/g, " ").replace(/\s+/g, " ").trim();
}
function add(list, value) { if (!list.includes(value)) list.push(value); }
function corrected(text, relevant) {
  const pieces = text.split(/\s+(?:no |actually )?(?:sorry|correction|wait)\s+/);
  return pieces.length > 1 && relevant.test(pieces.at(-1)) ? pieces.at(-1) : text;
}
function targetFor(context, command) {
  return typeof context === "object" ? context.target ?? { mode: "last", command, security: null } : { mode: "last", command, security: null };
}
function labelOf(value) { return typeof value === "string" ? value : value?.label ?? value?.name ?? ""; }
function exactOption(name, options) {
  const matches = (Array.isArray(options) ? options : []).filter(value => labelOf(value).toLowerCase() === name.trim().toLowerCase());
  return matches.length === 1 ? labelOf(matches[0]) : null;
}
function mentionedOptions(text, options) {
  return (Array.isArray(options) ? options : []).filter(value => {
    const label = labelOf(value).toLowerCase();
    return label && new RegExp(`(?:^|\\b)${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|\\b)`, "i").test(text);
  });
}
function worldOptions(context, key) {
  return context?.live_options?.[key] ?? context?.documented_options?.[key] ?? [];
}

export function compileWorldFollowup(context, utterance) {
  const command = String(typeof context === "string" ? context : context?.command ?? "").toUpperCase();
  if (!WORLD_COMMANDS.includes(command)) return null;
  const rawText = clean(utterance);
  if (!rawText || rawText.split(" ").length > 140) return null;
  const text = corrected(rawText, /\b(?:select|show|focus|filter|sort|open|closed|active|next open|when)\b/);
  const blockers = [];
  const actions = [];
  const categories = worldOptions(context, "categories");
  const venues = worldOptions(context, "venues");
  const categoryMentions = mentionedOptions(text, categories);
  const venueMentions = mentionedOptions(text, venues);
  const selectionLanguage = /\b(?:select|show|focus(?: on)?|switch to)\b/.test(text);

  if (selectionLanguage && /\b(?:category|region)\b/.test(text)) {
    if (!categories.length) add(blockers, `${command} category selection requires the exact current documented/live category list.`);
    else if (categoryMentions.length !== 1) add(blockers, `${command} category selection requires one exact documented/live category.`);
    else actions.push({ feature: "category", operation: "select", value: labelOf(categoryMentions[0]) });
  }
  if (selectionLanguage && /\b(?:venues?|exchanges?|markets?)\b/.test(text)) {
    if (!venues.length) add(blockers, `${command} venue selection requires the exact current live venue list.`);
    else if (venueMentions.length !== 1) add(blockers, `${command} venue selection requires one exact current live venue.`);
    else actions.push({ feature: "venue", operation: "select", value: labelOf(venueMentions[0]) });
  }

  const filterMatch = /\bfilter by ([a-z0-9 &'/%.-]+?)(?:\s+and\s+sort|$)/.exec(text);
  if (filterMatch) {
    const allowed = context?.documented_controls?.filters;
    const value = exactOption(filterMatch[1], allowed);
    if (!value) add(blockers, `${command} filters are unavailable unless the exact filter is documented for the current panel.`);
    else actions.push({ feature: "filter", operation: "select", value });
  }
  const sortMatch = /\bsort by ([a-z0-9 &'/%.-]+?)(?:\s+(ascending|descending|highest first|lowest first))?(?:$|\s+and\b)/.exec(text);
  if (sortMatch) {
    const field = exactOption(sortMatch[1], context?.documented_controls?.sorts);
    if (!field) add(blockers, `${command} sorts are unavailable unless the exact field is documented for the current panel.`);
    else if (!sortMatch[2]) add(blockers, `${command} sort requires an explicit ascending or descending direction.`);
    else actions.push({ feature: "sort", operation: "set", value: { field, direction: /descending|highest/.test(sortMatch[2]) ? "descending" : "ascending" } });
  }

  let narration = null;
  if (/\b(?:which|is|are|when|tell me|what)\b/.test(text) && /\b(?:active|open|closed|next open|opening|status)\b/.test(text)) {
    try {
      const facts = normalizeVenueFacts(command, context?.grounded_venues);
      const selected = facts.filter(fact => new RegExp(`(?:^|\\b)${fact.venue_name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|\\b)`).test(text));
      narration = {
        venues: selected.length ? selected : facts,
        fields: /\b(?:when|next open|opening)\b/.test(text) ? ["Status", "Next Open"] : ["Status"],
        source: `${command === "WEI" ? "Godel WEI" : "Godel WEIF"} panel`
      };
    } catch (error) {
      add(blockers, `${error.message}; exchange state and opening time will not be invented.`);
    }
  }

  for (let index = 0; index < actions.length; index += 1) {
    try { actions[index] = normalizeWorldAction(command, actions[index]); }
    catch (error) { add(blockers, error.message); }
  }
  if (!actions.length && !narration && !blockers.length) return null;
  const target = targetFor(context, command);
  return {
    kind: "world-market-contextual-workflow-draft", command, target, actions, blockers,
    grounded_narration: narration,
    ready_for_grounded_narration: Boolean(narration) && !blockers.length,
    ready_for_live_executor: false,
    blocked_reason: actions.length ? `${command} controls remain disabled pending live proof.` : null,
    configure_step_draft: blockers.length || !actions.length ? null : { id: `configure-${command.toLowerCase()}-1`, kind: "configure", target, actions, required: true }
  };
}

function normalizeContractOption(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (![value.id, value.label, value.category].every(item => typeof item === "string" && item.trim())) return null;
  const aliases = Array.isArray(value.aliases) ? value.aliases.filter(alias => typeof alias === "string" && alias.trim()) : [];
  return { id: value.id.trim(), label: value.label.trim(), category: value.category.trim(), aliases };
}
function contractMention(text, options) {
  const matches = (Array.isArray(options) ? options : []).map(normalizeContractOption).filter(Boolean).filter(option =>
    [option.id, option.label, ...option.aliases].some(name => new RegExp(`(?:^|\\b)${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|\\b)`).test(text))
  );
  return matches.length === 1 ? matches[0] : null;
}

export function compileGLCOFollowup(context, utterance) {
  const command = String(typeof context === "string" ? context : context?.command ?? "").toUpperCase();
  if (command !== "GLCO") return null;
  const rawText = clean(utterance);
  if (!rawText || rawText.split(" ").length > 140) return null;
  const text = corrected(rawText, /\b(?:select|show|focus|switch|contract|future|commodity|energy|metal|agriculture|coal|read|price)\b/);
  const blockers = [];
  const actions = [];
  const categories = context?.live_options?.categories ?? context?.documented_options?.categories ?? [];
  const contracts = context?.live_options?.contracts ?? context?.documented_options?.contracts ?? [];
  const categoryMentions = mentionedOptions(text, categories);
  const selectedContract = contractMention(text, contracts);
  const selectionLanguage = /\b(?:select|show|focus(?: on)?|switch to|pull up)\b/.test(text);

  if (selectionLanguage && categoryMentions.length) {
    if (categoryMentions.length !== 1) add(blockers, "GLCO category selection requires one exact documented/live category.");
    else actions.push({ feature: "category", operation: "select", value: labelOf(categoryMentions[0]) });
  }
  const specificContractCue = /\b(?:contract|future|coal|rupiah|ncf|newc|atw|mtf|bz1)\b/.test(text);
  if (selectionLanguage && (selectedContract || specificContractCue)) {
    if (!selectedContract) add(blockers, "GLCO will not invent a commodity, coal, FX, or futures symbol; one exact documented/live identity is required.");
    else actions.push({ feature: "contract", operation: "select", value: { id: selectedContract.id, label: selectedContract.label, category: selectedContract.category } });
  }

  let narration = null;
  if (/\b(?:read|tell me|what|price|last|change)\b/.test(text)) {
    try {
      const facts = normalizeCommodityFacts(context?.grounded_contracts);
      const selected = facts.filter(fact => [fact.id, fact.label].some(name => new RegExp(`(?:^|\\b)${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|\\b)`).test(text)));
      if (!selected.length && facts.length > 1) throw new Error("GLCO grounded narration requires one exact spoken contract identity");
      narration = { contracts: selected.length ? selected : facts, fields: ["Last", "Change", "Change Percent"], source: "Godel GLCO panel" };
    } catch (error) {
      add(blockers, `${error.message}; commodity values will not be invented.`);
    }
  }

  for (let index = 0; index < actions.length; index += 1) {
    try { actions[index] = normalizeGLCOAction(actions[index]); }
    catch (error) { add(blockers, error.message); }
  }
  if (!actions.length && !narration && !blockers.length) return null;
  const target = targetFor(context, "GLCO");
  return {
    kind: "glco-contextual-workflow-draft", command: "GLCO", target, actions, blockers,
    grounded_narration: narration,
    ready_for_grounded_narration: Boolean(narration) && !blockers.length,
    ready_for_live_executor: false,
    blocked_reason: actions.length ? "GLCO controls remain disabled pending live proof." : null,
    configure_step_draft: blockers.length || !actions.length ? null : { id: "configure-glco-1", kind: "configure", target, actions, required: true }
  };
}
