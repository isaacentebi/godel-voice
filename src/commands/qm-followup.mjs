import { resolveTranscriptSecurities } from "../security-resolver.mjs";
import { normalizeQMAction } from "./qm-actions.mjs";

function clean(value) {
  return String(value ?? "").toLowerCase()
    .replace(/\bquote mon(?:itor|iter|it or)\b/g, "quote monitor")
    .replace(/\bwatch list\b/g, "watchlist")
    .replace(/\btickers? symbols?\b/g, "tickers")
    .replace(/\bdeleet\b/g, "delete")
    .replace(/\bree name\b/g, "rename")
    .replace(/[^a-z0-9.%&,' -]+/g, " ").replace(/\s+/g, " ").trim();
}
function title(value) {
  return String(value ?? "").trim().split(/\s+/).map(word => {
    if (["ai", "us", "uk", "eu", "qm"].includes(word.toLowerCase())) return word.toUpperCase();
    return word ? word[0].toUpperCase() + word.slice(1) : word;
  }).join(" ");
}
function confirmed(text) { return /\b(?:confirm(?:ed)?|yes do it|yes proceed|i confirm|approved?)\b/.test(text); }
function securitiesFrom(segment) {
  const text = clean(segment).replace(/\b(?:ticker|tickers|symbol|symbols)\b/g, " ").replace(/\s+/g, " ");
  const resolved = resolveTranscriptSecurities(`stock ${text}`);
  if (resolved.length) return resolved.map(item => ({ ...item, needs_resolution: false }));
  const unknown = clean(segment).replace(/\b(?:and|plus|also|ticker|tickers|symbol|symbols)\b/g, " ").replace(/\s+/g, " ").trim();
  return unknown ? [{ spoken_name: unknown, ticker: null, venue: null, asset_class: null, needs_resolution: true }] : [];
}
function list(value) {
  return value.split(/\s*(?:,|\band\b)\s*/).map(item => title(item)).filter(Boolean);
}
function watchlistAction(action, name, isConfirmed, overrides = {}) {
  return {
    feature: "watchlist", operation: "configure",
    value: { action, name: title(name), new_name: null, relative_to: null, placement: null, confirmed: isConfirmed, ...overrides }
  };
}
function addBlocker(blockers, message) { if (!blockers.includes(message)) blockers.push(message); }

export function compileQMFollowup(context, utterance) {
  const command = String(typeof context === "string" ? context : context?.command ?? "").toUpperCase();
  if (command !== "QM") return null;
  const text = clean(utterance);
  if (!text || text.split(" ").length > 140) return null;
  const isConfirmed = confirmed(text);
  const blockers = [];
  const actions = [];
  const current = typeof context === "object" && context?.current_config ? context.current_config : {};

  const create = /\bcreate (?:a )?(?:new )?watchlist(?: (?:called|named))? ([a-z0-9][a-z0-9 &'_-]{0,63}?)(?=\s+(?:and|then|with|add|confirm|yes)\b|$)/.exec(text);
  const switchTo = /\b(?:switch|change|go) to (?:my )?([a-z0-9][a-z0-9 &'_-]{0,63}?) watchlist\b/.exec(text);
  const rename = /\brename (?:my )?([a-z0-9][a-z0-9 &'_-]{0,63}?) watchlist to ([a-z0-9][a-z0-9 &'_-]{0,63}?)(?=\s+(?:and|then|confirm|yes)\b|$)/.exec(text);
  const remove = /\bdelete (?:my )?([a-z0-9][a-z0-9 &'_-]{0,63}?) watchlist\b/.exec(text);
  const reorder = /\b(?:move|put) (?:my )?([a-z0-9][a-z0-9 &'_-]{0,63}?) watchlist (before|after) (?:my )?([a-z0-9][a-z0-9 &'_-]{0,63}?) watchlist\b/.exec(text);
  if (create) actions.push(watchlistAction("create", create[1], isConfirmed));
  if (switchTo) actions.push(watchlistAction("switch", switchTo[1], false));
  if (rename) actions.push(watchlistAction("rename", rename[1], isConfirmed, { new_name: title(rename[2]) }));
  if (remove) actions.push(watchlistAction("delete", remove[1], isConfirmed));
  if (reorder) actions.push(watchlistAction("reorder", reorder[1], isConfirmed, { relative_to: title(reorder[3]), placement: title(reorder[2]) }));

  const watchlistMutations = actions.filter(action => action.feature === "watchlist" && action.value.action !== "switch");
  if (watchlistMutations.length && !isConfirmed) addBlocker(blockers, "Persistent QM watchlist changes require explicit confirmation.");
  const lifecycleByName = new Map();
  for (const action of watchlistMutations) {
    const key = action.value.name.toLowerCase();
    const prior = lifecycleByName.get(key);
    if (prior && prior !== action.value.action) addBlocker(blockers, `Conflicting QM watchlist actions were requested for ${action.value.name}.`);
    lifecycleByName.set(key, action.value.action);
  }

  const tickerMatches = [...text.matchAll(/\b(add|remove|import|batch import)\s+(.+?)\s+(?:to|from|into) (?:my )?([a-z0-9][a-z0-9 &'_-]{0,63}?) watchlist\b/g)];
  for (const tickerMatch of tickerMatches) {
    const tickerAction = /import/.test(tickerMatch[1]) ? "batch-import" : tickerMatch[1];
    const parsed = securitiesFrom(tickerMatch[2]);
    actions.push({
      feature: "tickers", operation: "configure",
      value: { action: tickerAction, watchlist: title(tickerMatch[3]), securities: parsed, confirmed: isConfirmed }
    });
    if (!isConfirmed) addBlocker(blockers, "Persistent QM ticker changes require explicit confirmation.");
    if (parsed.some(item => item.needs_resolution)) addBlocker(blockers, "One or more securities are unresolved; Godel autocomplete must resolve them before mutation.");
  }
  const addAndRemove = actions.filter(action => action.feature === "tickers");
  if (addAndRemove.some(action => action.value.action === "add") && addAndRemove.some(action => action.value.action === "remove")) {
    addBlocker(blockers, "The same atomic QM request cannot both add and remove securities.");
  }

  const columns = /\b(?:set|show|use|configure) (?:the )?columns? (?:to|as) ([a-z0-9][a-z0-9 ,&'%-]{0,300}?)(?=\s+(?:and then|then|confirm|yes|sort|scale)\b|$)/.exec(text);
  let columnState = columns ? { visible: list(columns[1]), order: list(columns[1]), widths: [] }
    : current.columns ? {
      visible: [...(current.columns.visible ?? [])], order: [...(current.columns.order ?? [])],
      widths: (current.columns.widths ?? []).map(item => ({ ...item }))
    } : null;
  let columnChanged = Boolean(columns);
  if (columns) {
    if (columnState.visible.length !== new Set(columnState.visible.map(item => item.toLowerCase())).size) {
      addBlocker(blockers, "QM column list contains duplicates.");
    }
  }
  const addColumn = /\badd ([a-z0-9][a-z0-9 &'%-]{0,63}?) column\b/.exec(text)?.[1];
  const removeColumn = /\bremove ([a-z0-9][a-z0-9 &'%-]{0,63}?) column\b/.exec(text)?.[1];
  const moveColumn = /\bmove ([a-z0-9][a-z0-9 &'%-]{0,63}?) column (before|after) ([a-z0-9][a-z0-9 &'%-]{0,63}?) column\b/.exec(text);
  const resizeColumn = /\bresize ([a-z0-9][a-z0-9 &'%-]{0,63}?) column to (\d+) pixels?\b/.exec(text);
  const needsCurrentColumns = addColumn || removeColumn || moveColumn || resizeColumn;
  if (needsCurrentColumns && !columnState) {
    addBlocker(blockers, "QM incremental column changes require authoritative current visible columns and order.");
  } else if (columnState) {
    const findIndex = value => columnState.order.findIndex(item => item.toLowerCase() === title(value).toLowerCase());
    if (addColumn) {
      const value = title(addColumn);
      if (findIndex(value) >= 0) addBlocker(blockers, `QM column ${value} is already visible.`);
      else { columnState.visible.push(value); columnState.order.push(value); columnChanged = true; }
    }
    if (removeColumn) {
      const value = title(removeColumn);
      if (findIndex(value) < 0) addBlocker(blockers, `QM column ${value} is not visible.`);
      else {
        columnState.visible = columnState.visible.filter(item => item.toLowerCase() !== value.toLowerCase());
        columnState.order = columnState.order.filter(item => item.toLowerCase() !== value.toLowerCase());
        columnState.widths = columnState.widths.filter(item => item.column.toLowerCase() !== value.toLowerCase());
        columnChanged = true;
      }
    }
    if (moveColumn) {
      const moving = title(moveColumn[1]);
      const anchor = title(moveColumn[3]);
      const movingIndex = findIndex(moving);
      const anchorIndex = findIndex(anchor);
      if (movingIndex < 0 || anchorIndex < 0 || moving.toLowerCase() === anchor.toLowerCase()) {
        addBlocker(blockers, "QM column reorder requires two distinct currently visible columns.");
      } else {
        columnState.order.splice(movingIndex, 1);
        const refreshedAnchor = findIndex(anchor);
        columnState.order.splice(refreshedAnchor + (moveColumn[2] === "after" ? 1 : 0), 0, moving);
        columnChanged = true;
      }
    }
    if (resizeColumn) {
      const column = title(resizeColumn[1]);
      if (findIndex(column) < 0) addBlocker(blockers, `QM width column ${column} is not visible.`);
      else {
        columnState.widths = columnState.widths.filter(item => item.column.toLowerCase() !== column.toLowerCase());
        columnState.widths.push({ column, pixels: Number(resizeColumn[2]) });
        columnChanged = true;
      }
    }
  }
  if (columnChanged && columnState) {
    actions.push({ feature: "columns", operation: "configure", value: { ...columnState, confirmed: isConfirmed } });
    if (!isConfirmed) addBlocker(blockers, "Persistent QM column changes require explicit confirmation.");
  }
  const scale = /\b(?:set|change|make) (?:the )?(?:quote monitor |qm )?(?:font |table |widget )?scale (?:to )?(\d+(?:\.\d+)?)\s*(?:percent|%)\b/.exec(text);
  if (scale) {
    actions.push({ feature: "scale", operation: "configure", value: { percent: Number(scale[1]), confirmed: isConfirmed } });
    if (!isConfirmed) addBlocker(blockers, "Persistent QM scale changes require explicit confirmation.");
  }
  const sortDirections = [
    ["Ascending", /\b(?:ascending|lowest to highest|smallest to largest|sort up)\b/],
    ["Descending", /\b(?:descending|highest to lowest|largest to smallest|sort down)\b/],
    ["Off", /\b(?:sort off|no sort|clear sorting|unsorted)\b/]
  ].filter(([, pattern]) => pattern.test(text)).map(([value]) => value);
  if (sortDirections.length > 1) addBlocker(blockers, "Conflicting QM sort states were requested.");
  const sortColumn = /\bsort(?: (?:the )?watchlist)? by ([a-z0-9][a-z0-9 &'%-]{0,63}?)(?=\s+(?:ascending|descending|highest|lowest|largest|smallest|sort up|sort down|and|then|confirm|yes)\b|$)/.exec(text)?.[1];
  if (sortDirections.length === 1) {
    const column = sortDirections[0] === "Off" ? (sortColumn ? title(sortColumn) : "Current") : sortColumn ? title(sortColumn) : null;
    if (!column) addBlocker(blockers, "QM ascending or descending sort requires an exact column name.");
    else actions.push({ feature: "sort", operation: "configure", value: { column, direction: sortDirections[0], confirmed: isConfirmed } });
    if (!isConfirmed) addBlocker(blockers, "Persistent QM sort changes require explicit confirmation.");
  }

  if (/\b(?:add|create|insert) (?:a )?group header\b|\bgroup (?:these|tickers|names) under\b/.test(text)) {
    addBlocker(blockers, "QM group headers are not documented or live-proven and remain unsupported.");
  }
  if (/\b(?:move|reorder)\s+.+\s+(?:above|below|before|after)\s+/.test(text)
      && !/\bwatchlist\b/.test(text) && !/\bcolumn\b/.test(text)) {
    addBlocker(blockers, "QM within-watchlist ticker reordering is not documented or live-proven and remains unsupported.");
  }

  for (const action of actions) {
    try { normalizeQMAction(action); } catch (error) { addBlocker(blockers, error.message); }
  }
  if (!actions.length && !blockers.length) return null;
  const target = typeof context === "object" ? context.target ?? { mode: "last", command: "QM", security: null } : { mode: "last", command: "QM", security: null };
  return {
    kind: "qm-contextual-workflow-draft", command: "QM", target, actions, blockers,
    persistent_mutation: actions.some(action => !(action.feature === "watchlist" && action.value.action === "switch")),
    deletion_requested: actions.some(action => action.feature === "watchlist" && action.value.action === "delete"),
    ready_for_live_executor: false,
    blocked_reason: "QM controls remain disabled until authenticated account-wide state, dynamic columns, security resolution, and persistence postconditions are live-proven.",
    configure_step_draft: blockers.length ? null : { id: "configure-qm-1", kind: "configure", target, actions, required: true },
    account_scope: "Watchlists, tab order, columns, scale, and sorting may synchronize account-wide; no mutation is window-local."
  };
}
