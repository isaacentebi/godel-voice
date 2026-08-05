import { resolveTranscriptSecurities } from "../security-resolver.mjs";
import { CF_FILING_TYPES, normalizeCFAction } from "./cf-actions.mjs";

const FORM_PATTERNS = Object.freeze([
  ["10-K", /\b10-k\b/g], ["10-Q", /\b10-q\b/g], ["8-K", /\b8-k\b/g],
  ["13F", /\b13f\b/g], ["S-1", /\bs-1\b/g], ["Proxy", /\bproxy\b/g]
]);
function clean(value) {
  return String(value ?? "").toLowerCase().replace(/\bfilings? feed\b/g, "filings")
    .replace(/\bwatch list\b/g, "watchlist")
    .replace(/\b(?:10|ten)\s*(?:-| )?(?:k|kay)\b/g, "10-k")
    .replace(/\b(?:10|ten)\s*(?:-| )?(?:q|cue|queue|que)\b/g, "10-q")
    .replace(/\b(?:8|eight)\s*(?:-| )?(?:k|kay)\b/g, "8-k")
    .replace(/\b(?:13|thirteen)\s*(?:-| )?(?:f|eff)\b/g, "13f")
    .replace(/\b(?:s|ess)\s*(?:-| )?(?:1|one)\b/g, "s-1")
    .replace(/\bprox(?:y|ey|ie)\b/g, "proxy")
    .replace(/\bface book\b/g, "facebook")
    .replace(/[^a-z0-9&.' -]+/g, " ").replace(/\s+/g, " ").trim();
}
function title(value) { return value.trim().split(/\s+/).map(word => word ? word[0].toUpperCase() + word.slice(1) : word).join(" "); }
function corrected(text) {
  return text.replace(/\b(?:10-k|10-q|8-k|13f|s-1|proxy)\s+(?:no |actually )?(?:sorry|correction)\s+(10-k|10-q|8-k|13f|s-1|proxy)\b/g, "$1");
}
function forms(text) {
  const hits = [];
  for (const [form, pattern] of FORM_PATTERNS) for (const match of text.matchAll(pattern)) hits.push({ form, index: match.index });
  hits.sort((a, b) => a.index - b.index);
  return [...new Set(hits.map(hit => hit.form))];
}
function securityFrom(text) {
  const security = resolveTranscriptSecurities(text)[0];
  return security ? { ...security, needs_resolution: false } : null;
}
function add(blockers, message) { if (!blockers.includes(message)) blockers.push(message); }
function exactIdentity(value) {
  if (!value || typeof value !== "object") return null;
  return {
    row_id: value.row_id ?? null, accession_number: value.accession_number ?? null,
    ticker: value.ticker, form: value.form, filed_date: value.filed_date, company: value.company
  };
}

export function compileCFFollowup(context, utterance) {
  const command = String(typeof context === "string" ? context : context?.command ?? "").toUpperCase();
  if (command !== "CF") return null;
  const text = corrected(clean(utterance));
  if (!text || text.split(" ").length > 140) return null;
  const blockers = [];
  const actions = [];
  const current = typeof context === "object" ? context.current_config ?? {} : {};
  const selected = typeof context === "object" ? exactIdentity(context.selected_filing) : null;

  if (/\b(?:download|export|save)(?:\s+(?:this|the|that))?\s+filing\b|\bdownload\b/.test(text)) {
    add(blockers, "CF does not document file export or download; no artifact action will be invented.");
  }
  if (/\b(?:next|previous|page|paging|search within|filter search|filed before|filed after|date range|from \d{4}|since \d{4}|latest filings? only)\b/.test(text)) {
    add(blockers, "CF paging, date filtering, and search are not documented or live-audited.");
  }

  const wantsGlobal = /\b(?:global|all companies|all filings|market wide)\b/.test(text);
  const watchlistMatch = /\bmy ([a-z0-9][a-z0-9 &'_-]{0,63}?) watchlist\b/.exec(text)
    ?? /\b(?:for|from|in) ([a-z0-9][a-z0-9 &'_-]{0,63}?) watchlist\b/.exec(text);
  const spokenSecurity = securityFrom(text);
  const scopes = [wantsGlobal ? "Global" : null, watchlistMatch ? "Watchlist" : null, spokenSecurity ? "Security" : null].filter(Boolean);
  if (new Set(scopes).size > 1) add(blockers, `Conflicting CF scopes were requested: ${[...new Set(scopes)].join(", ")}.`);
  const scope = scopes[0] ?? current.scope ?? "Global";
  const security = scope === "Security" ? (spokenSecurity ?? current.security ?? null) : null;
  const watchlist = scope === "Watchlist" ? (watchlistMatch ? title(watchlistMatch[1]) : current.watchlist ?? null) : null;

  const requestedForms = forms(text);
  const filingTypes = requestedForms.length ? requestedForms : current.filing_types ?? [...CF_FILING_TYPES];
  const godel = /\b(?:inside|in|within) godel\b|\bgodel reader\b/.test(text);
  const edgar = /\bedgar\b/.test(text);
  if (godel && edgar) add(blockers, "Conflicting CF render destinations were requested: Godel and EDGAR.");
  const render = edgar ? "EDGAR" : godel ? "Godel" : current.render ?? "Godel";
  const explicitExternal = edgar;

  const wantsOpen = /\b(?:open|read|show me this|take me to)\b/.test(text) && /\b(?:this|that|selected|filing|edgar|godel)\b/.test(text);
  if (wantsOpen) {
    if (!selected) add(blockers, "Opening a CF row requires an authoritative selected filing with row_id or accession_number; speech alone cannot identify an exact row.");
    else actions.push({ feature: "filing", operation: "open", value: { identity: selected, destination: render, explicit_external: explicitExternal } });
  } else if (requestedForms.length || scopes.length || godel || edgar || /\b(?:filings?|cf)\b/.test(text)) {
    actions.push({ feature: "feed", operation: "configure", value: {
      scope, security, watchlist, filing_types: filingTypes, render, explicit_external: explicitExternal
    } });
    if (security?.needs_resolution) add(blockers, "CF security scope must be resolved by Godel autocomplete before Apply.");
  }

  for (let index = 0; index < actions.length; index += 1) {
    try { actions[index] = normalizeCFAction(actions[index]); } catch (error) { add(blockers, error.message); }
  }
  if (!actions.length && !blockers.length) return null;
  const target = typeof context === "object" ? context.target ?? { mode: "last", command: "CF", security: null } : { mode: "last", command: "CF", security: null };
  return {
    kind: "cf-contextual-workflow-draft", command: "CF", target, actions, blockers,
    external_navigation_requested: actions.some(action => action.value?.destination === "EDGAR" || action.value?.render === "EDGAR"),
    ready_for_live_executor: false,
    blocked_reason: "CF remains disabled until authenticated scope controls, filing-type menu, Apply transition, exact row identity, and Godel/EDGAR opening callbacks are live-proven.",
    configure_step_draft: blockers.length ? null : { id: "configure-cf-1", kind: "configure", target, actions, required: true },
    unsupported_controls: ["paging", "date filtering", "search", "download", "export"]
  };
}
