import { validateWorkflowPlan } from "../workflow-plan.mjs";

export const NEWS_ACTION_STATES = Object.freeze({
  query: "live",
  scope: "unbound",
  watchlist: "unbound",
  "date range": "unbound",
  "before date": "unbound",
  pause: "unbound",
  clear: "unbound",
  sources: "unbound",
  categories: "unbound",
  languages: "unbound",
  "include keywords": "unbound",
  "exclude keywords": "unbound",
  "class action": "unbound",
  "article select": "unbound",
  "article reader": "unbound",
  "reader back": "unbound",
  "inline context": "unbound",
  tts: "unbound",
  "article pdf": "unbound",
  "global filters": "confirmation-gated"
});

const MONTHS = Object.freeze({ january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 });
const DAYS = Object.freeze({ first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20, "twenty first": 21, "twenty second": 22, "twenty third": 23, "twenty fourth": 24, "twenty fifth": 25, "twenty sixth": 26, "twenty seventh": 27, "twenty eighth": 28, "twenty ninth": 29, thirtieth: 30, "thirty first": 31 });

function normalizedSpeech(value) {
  return String(value ?? "").toLowerCase()
    .replace(/\bopen[ -]?eye\b/g, "OpenAI")
    .replace(/\banti[ -]?trust\b/g, "antitrust")
    .replace(/\bwatch\s+list\b/g, "watchlist")
    .replace(/\btext to speach\b|\btee tee ess\b/g, "tts")
    .replace(/\bclass act shuns?\b/g, "class actions")
    .replace(/[^a-z0-9,'"$ -]+/gi, " ")
    .replace(/\s+/g, " ").trim();
}

function correctedSpeech(value) {
  const text = normalizedSpeech(value);
  const parts = text.split(/\b(?:wait no|no wait|no sorry|actually|scratch that|i mean)\b/);
  if (parts.length > 1 && /^search exact term\s+/.test(parts[0])) return `search exact term ${parts.at(-1).trim()}`;
  return parts.at(-1).trim();
}

function exact(value, options) {
  const wanted = String(value).trim().toLowerCase();
  const matches = (options ?? []).filter(item => String(item).trim().toLowerCase() === wanted);
  return matches.length === 1 ? matches[0] : null;
}

function list(value) {
  return String(value ?? "").replace(/["']/g, "").split(/\s*(?:,|\band\b)\s*/i).map(item => item.trim()).filter(Boolean);
}

function exactDynamic(items, options, label, blockers) {
  const resolved = [];
  for (const item of items) {
    const match = exact(item, options);
    if (!match) blockers.push(`${label} requires an exact value from the live control: ${item}`);
    else if (!resolved.includes(match)) resolved.push(match);
  }
  return resolved;
}

function isoDate(text) {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)?.[0];
  if (iso && !Number.isNaN(Date.parse(`${iso}T00:00:00Z`))) return iso;
  const months = Object.keys(MONTHS).join("|");
  const days = Object.keys(DAYS).sort((a, b) => b.length - a.length).join("|");
  const match = text.match(new RegExp(`\\b(${months})\\s+(${days}|\\d{1,2})(?:st|nd|rd|th)?(?:,)?\\s+(20\\d{2})\\b`));
  if (!match) return null;
  const month = MONTHS[match[1]];
  const day = DAYS[match[2]] ?? Number(match[2]);
  const value = `${match[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? null : value;
}

export function extractNewsQuery(transcript) {
  const corrected = correctedSpeech(transcript);
  if (!corrected) return null;
  const patterns = [
    /^(?:please )?search exact term (.+)$/,
    /^(?:please )?(?:search|filter|find) (?:the )?(?:(?:current|this) )?(?:news feed|news|stories?) (?:for|by|with|mentioning|about) (.+)$/,
    /^(?:please )?(?:in|on) (?:the )?(?:(?:current|this) )?(?:news feed|news) (?:search|filter|find)(?: stories?)? (?:for|by|with|mentioning|about) (.+)$/,
    /^(?:please )?(?:set|change) (?:the )?(?:current )?news (?:search|query) to (.+)$/,
    /^(?:please )?news (?:search|query) (?:for|to) (.+)$/
  ];
  let query = patterns.map(pattern => corrected.match(pattern)?.[1]).find(Boolean)?.trim() ?? null;
  if (query) query = query.split(/\s+and\s+(?=(?:pause|resume|before|include|exclude|show|hide|open|save|download|export)\b)/)[0].trim();
  if (!query || query.length > 200 || /[\r\n]/.test(query)) return null;
  return query;
}

function addDynamicFilter(actions, blockers, text, context, feature, noun, liveKey) {
  for (const mode of ["include", "exclude"]) {
    const match = text.match(new RegExp(`\\b${mode}(?: only)?\\s+(.+?)\\s+(?:${noun})\\b`))
      ?? text.match(new RegExp(`\\b${mode}\\s+(?:${noun})\\s+(.+?)(?=\\s+(?:include|exclude|language|class action|before|pause|resume|save|$))`));
    if (!match) continue;
    const whole = exact(match[1], context?.[liveKey]);
    const items = whole ? [whole] : exactDynamic(list(match[1]), context?.[liveKey], feature, blockers);
    if (items.length) actions.push({ feature, operation: mode, value: items, scope: "account-draft" });
  }
}

function keywordAction(actions, blockers, text, mode) {
  const match = text.match(new RegExp(`\\b${mode}\\s+(?:keywords?|terms?|words?)\\s+(.+?)(?=\\s+(?:include|exclude|show|hide|only|class action|before|pause|resume|save)\\b|$)`));
  if (!match) return;
  const items = list(match[1]);
  if (!items.length || items.length > 20 || items.some(item => item.length > 80)) {
    blockers.push(`${mode} keywords requires between 1 and 20 explicit values`);
    return;
  }
  actions.push({ feature: `${mode} keywords`, operation: "set", value: items, scope: "account-draft" });
}

function selectedArticle(context, text, blockers) {
  const articles = context?.live_articles ?? [];
  const ordinal = text.match(/\b(?:select|choose|open) (?:the )?(first|second|third) (?:news )?(?:article|story|headline)\b/)?.[1];
  if (ordinal) {
    const index = { first: 0, second: 1, third: 2 }[ordinal];
    const article = articles[index];
    if (!article?.id || !article?.title) blockers.push("article selection requires exact live article identity");
    return article?.id && article?.title ? { id: article.id, title: article.title } : null;
  }
  const selected = context?.selected_article;
  if (selected?.id && selected?.title) return { id: selected.id, title: selected.title };
  if (/\b(?:selected|current|this) (?:article|story|headline)\b/.test(text)) blockers.push("selected article identity is unavailable");
  return null;
}

export function compileNewsCandidate(context = {}, transcript) {
  const text = correctedSpeech(transcript);
  const command = String(context?.command ?? context?.target?.command ?? "N").toUpperCase();
  if (command !== "N" || !text) return null;
  const relevant = /\b(?:news|feed|article|story|headline|sources?|categor(?:y|ies)|languages?|keywords?|class actions?|tts|reader|pdf|watchlist|pause|resume)\b/.test(text);
  const query = extractNewsQuery(transcript);
  if (!relevant && !query) return null;
  const actions = [];
  const blockers = [];
  const contradictions = [];
  const current = context.current_state && typeof context.current_state === "object" ? structuredClone(context.current_state) : {};
  const desired_state = structuredClone(current);
  if (query) actions.push({ feature: "query", operation: "set", value: query, scope: "window" });

  const scopeRequests = [];
  if (/\b(?:all|unfiltered) news\b|\bglobal news(?! filters?)\b|\bnews from everywhere\b/.test(text)) scopeRequests.push({ feature: "scope", operation: "select", value: "Global", scope: "window" });
  const watch = text.match(/\b(?:use|using|scope(?: the)? news to|switch(?: the)? news to|news for)\s+(?:my\s+)?(.+?)\s+watchlist\b/)
    ?? text.match(/\bshow\s+(?:my\s+)?(.+?)\s+watchlist news\b/);
  if (watch) {
    const value = exact(watch[1], context.live_watchlists);
    if (value) scopeRequests.push({ feature: "watchlist", operation: "select", value, scope: "window" });
    else blockers.push(`watchlist requires an exact value from the live control: ${watch[1]}`);
  }
  if (/\b(?:this|the|a) (?:security|ticker|stock)(?: news)?\b|\bnews for this (?:security|ticker|stock)\b/.test(text)) {
    const ticker = context.resolved_security?.ticker ?? context.target?.security ?? null;
    if (ticker) scopeRequests.push({ feature: "scope", operation: "select", value: `Security:${String(ticker).toUpperCase()}`, scope: "window" });
    else blockers.push("security scope requires an already resolved security identity");
  }
  if (scopeRequests.length > 1) contradictions.push("news scope has conflicting security, watchlist, or global values");
  else if (scopeRequests.length === 1) actions.push(scopeRequests[0]);

  const allDate = /\b(?:all dates|date range all|show all history)\b/.test(text);
  const before = /\bbefore\b/.test(text) ? isoDate(text) : null;
  if (allDate && before) contradictions.push("news date cannot be both All and Before");
  if (/\b(?:after|since|last (?:day|week|month|year)|between)\b/.test(text)) blockers.push("News documentation supports only All or Before date semantics");
  if (/\bbefore\b/.test(text) && !before) blockers.push("Before requires one exact ISO or spoken calendar date");
  if (allDate) actions.push({ feature: "date range", operation: "select", value: "All", scope: "window" });
  if (before) actions.push({ feature: "before date", operation: "set", value: before, scope: "window" });

  const pause = /\b(?:pause|stop updating|freeze) (?:this )?(?:news )?(?:feed|window)?\b/.test(text);
  const resume = /\b(?:resume|unpause|go live|start updating) (?:this )?(?:news )?(?:feed|window)?\b/.test(text);
  if (pause && resume) contradictions.push("news feed cannot be both Paused and Live");
  else if (pause || resume) actions.push({ feature: "pause", operation: "select", value: pause ? "Paused" : "Live", scope: "window" });

  const localClear = /\b(?:clear|reset) (?:(?:this|current|local)(?: news)? window|(?:this|current|local|window)) (?:news )?filters?\b/.test(text);
  const globalClear = /\b(?:clear|reset) (?:all |my )?(?:global|saved|account) (?:news )?filters?\b(?! to recommended)/.test(text);
  if (/\b(?:clear|reset) (?:the )?(?:news )?filters?\b/.test(text) && !localClear && !globalClear) contradictions.push("say whether to clear this News window or saved global News filters");
  if (localClear) actions.push({ feature: "clear", operation: "clear", value: null, scope: "window" });

  addDynamicFilter(actions, blockers, text, context, "sources", "sources?", "live_sources");
  addDynamicFilter(actions, blockers, text, context, "categories", "categor(?:y|ies)", "live_categories");
  const lang = text.match(/\b(?:languages?|only in)\s+(.+?)(?=\s+(?:include|exclude|class action|before|pause|resume|save|$))/)
    ?? text.match(/\b([a-z]+) only(?: news)?\b/);
  if (lang) {
    const values = exactDynamic(list(lang[1]), context.live_languages, "languages", blockers);
    if (values.length) actions.push({ feature: "languages", operation: "select", value: values, scope: "account-draft" });
  }
  keywordAction(actions, blockers, text, "include");
  keywordAction(actions, blockers, text, "exclude");
  const classModes = [
    ["Show", /\bshow class actions?\b/], ["Hide", /\b(?:hide|exclude) class actions?\b/], ["Only", /\b(?:only|just) class actions?\b|\bclass actions? only\b/]
  ].filter(([, pattern]) => pattern.test(text));
  if (classModes.length > 1) contradictions.push("class-action filter has conflicting Show, Hide, or Only values");
  else if (classModes.length === 1) actions.push({ feature: "class action", operation: "select", value: classModes[0][0], scope: "account-draft" });

  const accountDraft = actions.some(action => action.scope === "account-draft");
  if (accountDraft && /\b(?:this|current|local) (?:news )?(?:window|feed)\b/.test(text)) {
    blockers.push("source, category, language, keyword, and class-action filters are account-global, not per-window");
  }

  const article = selectedArticle(context, text, blockers);
  if (/\b(?:select|choose) (?:the )?(?:first|second|third) (?:news )?(?:article|story|headline)\b/.test(text) && article) {
    actions.push({ feature: "article select", operation: "select", value: article, scope: "window" });
  }
  if (/\bopen (?:the )?(?:selected|current|this|first|second|third) (?:news )?(?:article|story|headline)\b/.test(text) && article) {
    actions.push({ feature: "article reader", operation: "open", value: article, scope: "window" });
  }
  if (/\b(?:go )?back(?: to (?:the )?(?:news|feed|headlines))?\b/.test(text)) {
    if (context.reader_open !== true) blockers.push("News reader Back requires an open article reader");
    else actions.push({ feature: "reader back", operation: "back", value: null, scope: "window" });
  }
  const contextShow = /\b(?:show(?: and hide)?|enable|turn on) (?:the )?(?:inline |match )?context\b/.test(text);
  const contextHide = /\b(?:hide|disable|turn off) (?:the )?(?:inline |match )?context\b/.test(text);
  if (contextShow && contextHide) contradictions.push("inline context cannot be both Show and Hide");
  else if (contextShow || contextHide) actions.push({ feature: "inline context", operation: "select", value: contextShow ? "Show" : "Hide", scope: "window" });
  const ttsOn = /\b(?:start|play|enable|turn on|read)(?: the)? tts\b|\bread (?:this|the) (?:article|story) aloud\b/.test(text);
  const ttsOff = /\b(?:stop|pause|disable|turn off)(?: the)? tts\b|\bstop reading aloud\b/.test(text);
  if (ttsOn && ttsOff) contradictions.push("TTS cannot be both On and Off");
  else if (ttsOn || ttsOff) actions.push({ feature: "tts", operation: "select", value: ttsOn ? "On" : "Off", scope: "window" });
  if (/\b(?:save|download|export) (?:the |this )?(?:selected |current )?(?:article|story)?(?: as| to)? pdf\b|\bpdf export\b/.test(text)) {
    if (!article) blockers.push("News PDF requires exact selected-article identity");
    else actions.push({ feature: "article pdf", operation: "download", value: { article_id: article.id, format: "PDF" }, scope: "artifact" });
  }

  const saveGlobal = /\bsave (?:these|the|my) (?:news )?filters? (?:globally|to my account|for every news window)\b/.test(text);
  const resetRecommended = /\b(?:reset|set) (?:all |my )?(?:global |saved )?(?:news )?filters? to recommended\b/.test(text);
  if (saveGlobal) actions.push({ feature: "global filters", operation: "save", value: "Current draft", scope: "account" });
  if (resetRecommended) actions.push({ feature: "global filters", operation: "reset", value: "Recommended", scope: "account" });
  if (globalClear) actions.push({ feature: "global filters", operation: "clear", value: null, scope: "account" });
  if (/\bcancel (?:the )?(?:global |news )?filter changes\b/.test(text)) actions.push({ feature: "global filters", operation: "cancel", value: null, scope: "account" });

  if (contradictions.length) return { kind: "clarify", command: "N", actions: [], executable_actions: [], blockers: contradictions, desired_state: current, confirmation_required: false, ready_for_live_executor: false };
  if (!actions.length && !blockers.length) return null;
  for (const action of actions) desired_state[action.feature] = structuredClone(action.value);
  const gated = actions.some(action => NEWS_ACTION_STATES[action.feature] === "confirmation-gated");
  const unbound = actions.filter(action => NEWS_ACTION_STATES[action.feature] !== "live");
  blockers.push(...unbound.filter(action => NEWS_ACTION_STATES[action.feature] === "unbound").map(action => `${action.feature} is runtime-disabled pending live proof`));
  const ready = blockers.length === 0 && !gated && unbound.length === 0 && actions.length > 0;
  return {
    kind: "candidate", command: "N", actions,
    executable_actions: ready ? actions.map(({ feature, operation, value }) => ({ feature, operation, value })) : [],
    blockers: [...new Set(blockers)], desired_state,
    confirmation_required: gated,
    ready_for_live_executor: ready
  };
}

export function compileNewsFollowup(target, transcript) {
  const candidate = compileNewsCandidate({ command: "N", target }, transcript);
  if (!candidate?.ready_for_live_executor || candidate.executable_actions.length !== 1) return null;
  return validateWorkflowPlan({
    version: 2,
    failure_policy: "stop_on_any",
    layout: null,
    steps: [{
      id: "configure-1", kind: "configure",
      target: target?.command === "N" ? target : { mode: "command", command: "N", security: null },
      actions: candidate.executable_actions, required: true
    }]
  });
}
