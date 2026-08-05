import { encodeWorkflowPlan, validateWorkflowPlan } from "./workflow-plan.mjs";
import { compileChartOptionsFollowup } from "./commands/chart-options-followup.mjs";
import { compileEQSFollowup } from "./commands/eqs-followup.mjs";
import { compileNewsFollowup } from "./commands/news-followup.mjs";
import { compileHMAPFollowup } from "./commands/hmap-followup.mjs";
import { compileMOSTFollowup } from "./commands/most-followup.mjs";
import { compileSECFFollowup } from "./commands/secf-followup.mjs";
import { compileHMSFollowup } from "./commands/q-hldr-hms-followup.mjs";
import { compileEMFollowup } from "./commands/em-followup.mjs";
import { parseTRANResearchAction, parseTRANResearchContinuation } from "./commands/tran-help-change-followup.mjs";
import { compileDeterministicDesk } from "./deterministic-desks.mjs";

const targetCommands = [
  ["earnings matrix", "EM"], ["market heatmap", "HMAP"], ["heatmap", "HMAP"],
  ["intraday market map", "IMAP"], ["intraday map", "IMAP"], ["index map", "IMAP"],
  ["market halts", "HALT"], ["halts", "HALT"],
  ["most active stocks", "MOST"], ["most active", "MOST"],
  ["world equity index futures", "WEIF"], ["index futures", "WEIF"],
  ["world equity index", "WEI"], ["world stock indexes", "WEI"], ["world indices", "WEI"],
  ["fundamentals graph", "GF"], ["fundamental graph", "GF"], ["chart", "G"],
  ["historical comparison", "HMS"], ["comparison graph", "HMS"],
  ["news feed", "N"], ["news", "N"], ["option chain", "OMON"], ["screener", "EQS"],
  ["world venue map", "MAP"], ["world map", "MAP"],
  ["securities finder", "SECF"], ["security finder", "SECF"],
  ["company description", "DES"], ["company profile", "DES"],
  ["company page", "DES"], ["three statements", "FA"], ["financial statements", "FA"],
  ["analyst ratings", "ANR"], ["broker ratings", "ANR"],
  ["analyst earnings estimates", "ERN"], ["analyst estimates", "ERN"], ["earnings estimates", "ERN"],
  ["financials", "FA"], ["short interest", "SI"], ["days to cover", "SI"],
  ["dividend history", "DVD"], ["dividend yield", "DVD"], ["payment history", "DVD"],
  ["quote monitor", "QM"], ["time and sales", "TAS"], ["live tape", "TAS"],
  ["historical percent changes", "HCP"], ["historical change percent", "HCP"],
  ["global commodities", "GLCO"], ["commodity futures", "GLCO"], ["commodities screen", "GLCO"],
  ["forex cross rates", "FX"], ["currency converter", "FX"], ["forex pairs", "FX"],
  ["most active options", "MOSO"], ["active options", "MOSO"],
  ["latest holdings", "HLDR"], ["portfolio holdings", "HLDR"],
  ["news search", "NI"], ["top news", "TOP"], ["top stories", "TOP"],
  ["trending tickers", "TREND"], ["trending on godel", "TREND"],
  ["research reports", "RES"], ["historical prices", "HP"], ["historical price data", "HP"],
  ["ipo calendar", "IPO"], ["ipo list", "IPO"], ["all quotes", "ALLQ"],
  ["black scholes", "OVME"], ["options calculator", "OVME"], ["calculator", "CALC"],
  ["pattern search", "PAT"], ["systematic pattern search", "PRT"],
  ["wojak sentiment", "WJI"], ["sentiment gauge", "WJI"],
  ["citadel overview", "CITADEL"], ["kelly criterion", "KELLY"],
  ["godel help", "HELP"], ["release notes", "CHANGE"], ["changelog", "CHANGE"],
  ["earnings transcript", "TRAN"], ["earnings calls", "TRAN"], ["earnings call", "TRAN"], ["transcript", "TRAN"], ["filings", "CF"],
  ["institutional holders", "HDS"], ["institutional owners", "HDS"], ["holders window", "HDS"], ["ownership window", "HDS"],
  ["quick quote", "G"], ["ticker chat", "CHAT"], ["brokerage connection manager", "BROK"],
  ["linked brokerage account value", "AUM"], ["account management", "ACM"], ["terminal settings", "PDF"],
  ["existing alerts", "AL"], ["data entitlements", "ENT"], ["bug report form", "ERR"], ["company note", "NOTE"], ["note", "NOTE"]
];

function clean(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9% ]+/g, " ")
    .replace(/\bheat\s+map\b/g, "heatmap")
    .replace(/\brev a new\b/g, "revenue")
    .replace(/\bmicro soft\b/g, "microsoft")
    .replace(/\bn vidia\b/g, "nvidia")
    .replace(/\bmatt? tricks\b/g, "matrix")
    .replace(/\bearnins\b/g, "earnings")
    .replace(/\brooters\b/g, "reuters")
    .replace(/\bfill ins\b/g, "filings")
    .replace(/\bmoniter\b/g, "monitor")
    .replace(/\btime and sails\b/g, "time and sales")
    .replace(/\bmarket holts\b/g, "market halts")
    .replace(/\bblack shoals\b/g, "black scholes")
    .replace(/\borr? a cul\b/g, "oracle")
    .replace(/\binstitush(?:un|on)al\b/g, "institutional")
    .replace(/\bbub bull\b/g, "bubble")
    .replace(/\bsecurit(?:y|ies) (?:find her|find are)\b/g, "security finder")
    .replace(/\s+/g, " ").trim();
}

const commonSecurities = [
  ["amazon", "AMZN"], ["meta", "META"], ["facebook", "META"], ["microsoft", "MSFT"],
  ["apple", "AAPL"], ["nvidia", "NVDA"], ["tesla", "TSLA"], ["oracle", "ORCL"],
  ["alphabet", "GOOG"], ["google", "GOOG"], ["reddit", "RDDT"], ["netflix", "NFLX"],
  ["service now", "NOW"], ["servicenow", "NOW"], ["palantir", "PLTR"], ["novo nordisk", "NVO"],
  ["eli lilly", "LLY"], ["lilly", "LLY"], ["chipotle", "CMG"], ["unity", "U"],
  ["corsair", "CRSR"], ["sandisk", "SNDK"], ["coca cola", "KO"],
  ["berkshire hathaway", "BRK.B"], ["berkshire", "BRK.B"], ["block", "XYZ"], ["square", "XYZ"]
];
const directSecurityOpen = new Set([
  "EM", "G", "Q", "DES", "ANR", "ERN", "HDS", "HLDR", "OMON", "GF", "FA", "TRAN", "CF",
  "SI", "DVD", "TAS", "HCP", "N", "RES", "HP", "PAT", "PRT", "CHAT", "NOTE"
]);
const directGlobalOpen = new Set([
  "HMAP", "IMAP", "HALT", "MOST", "MOSO", "WEI", "WEIF", "MAP", "EQS", "QM", "GLCO", "FX",
  "NI", "TOP", "TREND", "ALLQ", "SECF", "WJI", "IPO", "CALC", "CITADEL", "KELLY", "HELP", "CHANGE",
  "OVME", "BROK", "AUM", "ACM", "PDF", "AL", "ENT", "ERR"
]);
const directOpenModifier = /\b(?:with|as|set|change|switch|compare|versus|vs|download|export|close|move|put|place|bigger|smaller|table|bubbles?|treemap|active|resumed|all|metric|multiple|revenue|ebit|ebitda|margin|growth|minutes?|hourly|candles?|ten k|ten q|eight k|forms?)\b/;

function targetFor(text) {
  const security = commonSecurities.find(([name]) => new RegExp(`\\b${name}\\b`).test(text))?.[1] ?? null;
  if (security
      && /\b(?:after[ -]?hours?|pre[ -]?market|before the open)\b/.test(text)
      && /\b(?:how|doing|trading|price|quote|check|show|tell)\b/.test(text)) {
    return { mode: "command", command: "Q", security };
  }
  if (/\btop\b.*\breuters\b.*\b(?:stories|headlines|news)\b/.test(text)
      || /\breuters\b.*\btop\b.*\b(?:stories|headlines|news)\b/.test(text)) {
    return { mode: "command", command: "TOP", security };
  }
  if (/\b(?:what s|whats) new\b|\blatest (?:godel )?release\b/.test(text)) return { mode: "command", command: "CHANGE", security };
  if (/\b(?:tickers?|securities)\b.*\btrending\b|\btrending\b.*\b(?:tickers?|securities)\b/.test(text)) return { mode: "command", command: "TREND", security };
  if (/\bevery (?:listing|venue)\b.*\bquote\b|\ball (?:listings|venues)\b/.test(text)) return { mode: "command", command: "ALLQ", security };
  if (/\bsimilar historical (?:price )?patterns?\b/.test(text)) return { mode: "command", command: "PAT", security };
  if (/\bworld (?:venue|exchange opening) map\b/.test(text)) return { mode: "command", command: "MAP", security };
  if (/\bcompany graph\b/.test(text)) return { mode: "command", command: "G", security };
  if (/\b(?:operating|gross|net) margin\b.*\b(?:graph|chart)\b|\b(?:graph|chart)\b.*\b(?:operating|gross|net) margin\b/.test(text)) {
    return { mode: "command", command: "GF", security };
  }
  const match = targetCommands
    .filter(([phrase]) => text.includes(phrase))
    .sort((left, right) => right[0].length - left[0].length)[0];
  if (match) return { mode: "command", command: match[1], security };
  if (/\b(focused|active)\b/.test(text)) return { mode: "focused", command: null, security: null };
  return { mode: "last", command: null, security: null };
}

function commandStep(command, security = null, id = "command-1") {
  return {
    id, kind: "command", command,
    terminal_command: security ? `${security} US EQ ${command}` : command,
    security_query: null, arguments: [], actions: [], required: true, layout: null
  };
}

function workflowLayout(preset = "grid") {
  return { mode: "tile", direction: "row", gap_px: 12, preset, preserve_existing: false, new_screen: false };
}

function asksForNewScreen(text) {
  return /\b(?:on |in )?(?:a )?(?:new|second) (?:screen|tab)\b|\b(?:new|fresh|clean|blank) (?:market |research |company |macro )?screen\b/.test(text);
}

function trailingOpenControl(text) {
  const placements = "top[ -]?left|top[ -]?right|bottom[ -]?left|bottom[ -]?right|left|right|top|bottom|full";
  const specs = [
    {
      pattern: /^(.*?)(?:\s+(?:and then|then|and))?\s+(?:make\s+(?:it|that|this)\s+full ?screen|full ?screen|maximi[sz]e(?:\s+(?:it|that|this|the\s+.+))?)$/,
      operation: "maximize", value: null
    },
    {
      pattern: /^(.*?)(?:\s+(?:and then|then|and))?\s+(?:make|resize|grow|shrink)\s+(?:it|that|this)\s+(bigger|larger|wider|taller|smaller|narrower|shorter)$/,
      operation: "resize"
    },
    {
      pattern: new RegExp(`^(.*?)(?:\\s+(?:and then|then|and))?\\s+(?:put|move|place|send)\\s+(?:it|that|this)\\s+(?:on|to)?\\s*(?:the\\s+)?(${placements})$`),
      operation: "move"
    },
    {
      pattern: new RegExp(`^(.*?)(?:\\s+(?:and then|then|and))?\\s+(?:on|to)\\s+(?:the\\s+)?(${placements})$`),
      operation: "move"
    }
  ];
  for (const spec of specs) {
    const match = spec.pattern.exec(text);
    const core = match?.[1]?.trim();
    if (!core || !/\b(?:open|launch|create|build|display)\b|\bpull(?: up)?\b|\bbring up\b|\bshow\b/.test(core)) continue;
    let value = spec.value ?? null;
    if (spec.operation === "resize") value = /\b(?:bigger|larger|wider|taller)\b/.test(match[2]) ? "larger" : "smaller";
    if (spec.operation === "move") value = String(match[2]).toLowerCase().replace(/\s+/g, "-");
    const tail = text.slice(core.length);
    const namedTarget = targetFor(tail);
    return {
      core,
      operation: spec.operation,
      value,
      target: namedTarget.command
        ? { mode: "command", command: namedTarget.command, security: namedTarget.security }
        : { mode: "last", command: null, security: null }
    };
  }
  return null;
}

function exactTerminalStep(command, terminalCommand, id, placement = null) {
  return {
    id, kind: "command", command, terminal_command: terminalCommand,
    security_query: null, arguments: [], actions: [], required: true,
    layout: placement ? { placement } : null
  };
}

export function parseControlFollowup(transcript, context = null) {
  const text = clean(transcript);
  if (!text) return null;
  const focusedPanel = context?.focused_panel;
  let target = targetFor(text);
  // “Open eye” is a frequent OpenAI transcription and is query content, not
  // an instruction to open a new Godel panel.
  const openingText = text.replace(/\bopen[ -]?(?:eye|ai)\b/g, "");
  const implicitSurfaceRequest = !focusedPanel?.command && target.command && target.command !== "SECF"
    && !/\b(?:this|that|current|existing|window|panel|one)\b/.test(openingText)
    && !/\b(?:add|set|change|switch|make|run|clear|strikes?)\b/.test(openingText)
    && /\b(?:show|find|what|who|how|which|every|upcoming|top|estimates?|dividends?|tape|historical|indices|indexes|futures|commodities|forex|rates|most active|owners?|holdings|reports?|trending|quotes?|chain|calculator|calendar|patterns?|sentiment|help|shortcuts|release|simulator|settings|alerts?|entitlements?|brokerage|account|bug report|description|profile|graph|note)\b/.test(openingText);
  const explicitlyOpening = /\b(open|create|build|launch|new|display)\b|\bpull(?: up)?\b|\bbring up\b/.test(openingText)
    || (!focusedPanel?.command && /\b(?:show me|latest)\b/.test(openingText)) || implicitSurfaceRequest;
  // Session-qualified quote requests have a distinct native success surface:
  // Q updates Godel's timestamped header instead of opening a chart window.
  // Resolve it before the generic conversational stock-price chart route.
  if (target.command === "Q" && target.security) {
    return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: workflowLayout("focus"),
      steps: [commandStep("Q", target.security)]
    });
  }
  if (!explicitlyOpening && focusedPanel?.command) {
    const focusedCommand = String(focusedPanel.command).toUpperCase();
    const focusedSecurity = focusedPanel.security ? String(focusedPanel.security).toUpperCase() : null;
    if (target.command == null || (target.command === focusedCommand && !target.security)) {
      target = { mode: "focused", command: focusedCommand, security: target.security ?? focusedSecurity };
    }
  }

  // Plural geometry and close requests need exact panel identities. Reducing
  // “both charts” or “move them” to one focused/last panel is a silent partial
  // action, so keep those phrases off the deterministic executor.
  if ((/\b(?:close|dismiss|remove|maximize|maximise|restore|move|put|place|resize|make)\b/.test(text)
      && /\b(?:both|these two|those two|the two)\b/.test(text))
      || /\b(?:move|put|place|resize|make|maximize|maximise|restore)\s+them\b/.test(text)) return null;

  // Close every currently authenticated, non-consequential Godel panel when
  // the exact live context is available. Without that context, bulk language
  // still fails closed instead of degrading to a single arbitrary close.
  if (/\b(close|dismiss|remove)\b/.test(text)
      && (/\b(?:close|dismiss|remove)\s+(?:all|everything)\b/.test(text)
        || /\b(all|every|everything|entire|whole)\b.*\b(windows?|panels?|screens?)\b/.test(text)
        || /\b(?:these|those)\s+(?:windows?|panels?|screens?)\b/.test(text))) {
    const unsafe = new Set(["CHAT", "NOTE", "ACM", "BROK", "AL", "ENT"]);
    const panels = Array.isArray(context?.panels) ? context.panels.filter(panel =>
      panel?.connected !== false && typeof panel?.command === "string"
      && !unsafe.has(String(panel.command).toUpperCase())).slice(0, 12) : [];
    const continuation = /\b(?:and\s+then|then|and)\b[\s,:-]*(?=(?:open|show|pull(?: up)?|bring up|build|create|compare)\b)(.+)$/.exec(text)?.[1]?.trim() ?? "";
    const nextPlan = continuation && /\b(?:open|show|pull|bring|build|create|compare)\b/.test(continuation)
      ? parseControlFollowup(continuation, context) : null;
    if (continuation && !nextPlan) return null;
    // “Close everything, then open …” is still a complete request on an
    // already-clean Voice screen. Do not fall through to a model simply
    // because idempotent cleanup has no current targets.
    if (!panels.length) return nextPlan;
    const cleanupSteps = panels.map((panel, index) => ({
      id: `cleanup-${index + 1}`, kind: "control", operation: "close",
      target: { mode: "command", command: String(panel.command).toUpperCase(), security: panel.security ? String(panel.security).toUpperCase() : null },
      // The Voice-workspace transaction may have already removed this exact
      // panel before ordered steps begin. Treat an already-closed target as
      // idempotent cleanup, never as a reason to abort the requested open.
      value: null, required: false, failure_policy: "continue"
    }));
    if (nextPlan) {
      return validateWorkflowPlan({
        version: 2, failure_policy: nextPlan.failure_policy, layout: nextPlan.layout,
        steps: [...cleanupSteps, ...nextPlan.steps]
      });
    }
    return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_required", layout: null,
      steps: cleanupSteps
    });
  }

  const security = commonSecurities.find(([name]) => new RegExp(`\\b${name}\\b`).test(text))?.[1] ?? null;

  // Several account-adjacent surfaces are safe to open but contain buttons
  // that could mutate external state. Their zero-model lane is therefore
  // explicitly read-only: the utterance must prohibit the consequential
  // action, and the resulting workflow only opens the native panel.
  const readOnlyOpenGuards = {
    BROK: /\b(?:do not|don t|dont|without)\s+(?:connect|link|change)|\bread[ -]?only\b/,
    ACM: /\b(?:do not|don t|dont|without)\s+(?:change|edit|upgrade)|\bread[ -]?only\b/,
    PDF: /\b(?:do not|don t|dont|without)\s+(?:change|edit)|\bread[ -]?only\b/,
    AL: /\b(?:existing|current) alerts?\b.*\b(?:do not|don t|dont|without)\s+(?:create|add|change)|\bview (?:my )?(?:existing|current) alerts?\b/,
    ENT: /\b(?:do not|don t|dont|without)\s+(?:subscribe|buy|change)|\b(?:view|show) (?:my )?current data entitlements?\b/,
    ERR: /\b(?:do not|don t|dont|without)\s+(?:send|submit|post)|\bopen (?:the )?bug report form\b/,
    CHAT: /\b(?:do not|don t|dont|without)\s+(?:post|send|write)|\bjust read\b/,
    NOTE: /\b(?:do not|don t|dont|without)\s+(?:edit|change|write)|\bwithout editing\b/
  };
  if ((explicitlyOpening || /\b(?:open|show|view)\b/.test(text))
      && target.command && readOnlyOpenGuards[target.command]?.test(text)
      && (directGlobalOpen.has(target.command) || (directSecurityOpen.has(target.command) && security))) {
    return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: null,
      steps: [commandStep(target.command, directSecurityOpen.has(target.command) ? security : null)]
    });
  }

  if (/\bquick quote\b/.test(text) && security) {
    return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: workflowLayout("focus"),
      steps: [exactTerminalStep("G", `${security} US EQ G`, "command-1", "full")]
    });
  }
  if (target.command === "TREND" && /\b(?:what|which)\b.*\btrending\b/.test(text)) {
    return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: null,
      steps: [commandStep("TREND")]
    });
  }

  const deterministicDesk = compileDeterministicDesk({ transcript, text, security, explicitlyOpening });
  if (deterministicDesk) return validateWorkflowPlan(deterministicDesk);

  // Multi-quarter transcript research is a bounded, evidence-only TRAN
  // action. Keep the company in the native command identity and the research
  // request in one structured action so no clause is silently discarded.
  const tranContinuation = parseTRANResearchContinuation(context?.research_session, transcript);
  if (tranContinuation) {
    const sessionSecurity = String(context?.research_session?.security
      ?? context?.research_session?.target?.security
      ?? focusedPanel?.security ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9.-]{1,12}$/.test(sessionSecurity)) return null;
    return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: null,
      steps: [{
        id: "configure-1", kind: "configure",
        target: { mode: "command", command: "TRAN", security: sessionSecurity },
        actions: [tranContinuation], required: true
      }]
    });
  }
  const tranResearch = parseTRANResearchAction(transcript);
  if (tranResearch) {
    if (security) return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: workflowLayout("focus"),
      steps: [{ ...commandStep("TRAN", security), actions: [tranResearch], layout: { placement: "full" } }]
    });
    if (String(focusedPanel?.command ?? "").toUpperCase() === "TRAN") return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: null,
      steps: [{ id: "configure-1", kind: "configure", target: { mode: "focused", command: "TRAN", security: null }, actions: [tranResearch], required: true }]
    });
    return null;
  }

  // VoiceInk commonly separates the QQQ ticker into spoken letters and often
  // hears “Nasdaq” as “Nazak”. Treat those exact variants as the QQQ security,
  // never as Godel's unrelated Q (Quick Quote) command.
  const spokenQQQ = /\bq(?:\s+q(?:\s+q)?)?\b.*\b(?:nasdaq|nazak)\b|\bhow (?:is|are) the q\s+q(?:\s+q)?\b/.test(text);
  if (spokenQQQ) {
    return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: workflowLayout("focus"),
      steps: [exactTerminalStep("G", "QQQ US EQ G", "command-1", "full")]
    });
  }

  // “Macro monitor” is a human concept rather than one Godel mnemonic. Build
  // a useful three-panel macro desk from native surfaces and tile it.
  const macroRemainder = text.replace(/\bmacro (?:monitor|desk|dashboard|screen)\b/, "");
  const macroHasRequestedContents = /\bwith\b|\b(?:indices|indexes|world markets|global markets|futures|commodities|forex|fx|currencies|vix|volatility|heatmap|halts?|most active|market movers?)\b/.test(macroRemainder);
  if (explicitlyOpening && /\bmacro (?:monitor|desk|dashboard|screen)\b/.test(text) && !macroHasRequestedContents) {
    const macroLayout = workflowLayout("market");
    macroLayout.new_screen = asksForNewScreen(text);
    return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_required", layout: macroLayout,
      steps: [
        exactTerminalStep("WEI", "WEI", "command-1", "top-left"),
        exactTerminalStep("WEIF", "WEIF", "command-2", "top-right"),
        exactTerminalStep("G", "VIX CBOE IDX G", "command-3", "bottom")
      ]
    });
  }

  // Natural market-overview language should produce the actual desk the user
  // described: world indices, index futures and today's volatility chart.
  const asksIndices = /\b(?:indices|indexes|index markets?)\b/.test(text);
  const asksVolatility = /\b(?:volatility|vix)\b/.test(text);
  if ((explicitlyOpening || /\b(?:show|see|how)\b/.test(text)) && asksIndices && asksVolatility) {
    return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_required", layout: workflowLayout("market"),
      steps: [
        exactTerminalStep("WEI", "WEI", "command-1", "top-left"),
        exactTerminalStep("WEIF", "WEIF", "command-2", "top-right"),
        exactTerminalStep("G", "VIX CBOE IDX G", "command-3", "bottom")
      ]
    });
  }

  // Godel documents VIX as the CBOE index identity `VIX CBOE IDX`.
  // Route direct natural-language volatility-index requests to its native chart.
  const directVIX = /\b(?:vix|fear index|(?:cboe )?volatility index)\b/.test(text)
    || /\b(?:market )?volatility (?:chart|graph)\b/.test(text);
  if (directVIX && (explicitlyOpening || /\b(?:show|see|how|what)\b/.test(text))) {
    return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: workflowLayout("focus"),
      steps: [exactTerminalStep("G", "VIX CBOE IDX G", "command-1", "full")]
    });
  }

  // Ordinary stock-price questions open a chart because the user asked for a
  // durable visual surface. Session-qualified after-hours/premarket questions
  // have already routed to Q's authenticated timestamped header above.
  const asksPrice = /\b(?:what(?:'s| is)|tell me|give me|show me|how (?:is|are))\b.*\b(?:stock|share|price|trading|doing)\b|\b(?:stock|share) price\b/.test(text);
  if (security && asksPrice && !/\b(?:forward|target|fair)\b/.test(text) && !/\b(?:market\s+)?heat\s*map\b/.test(text)) {
    return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: workflowLayout("focus"),
      steps: [exactTerminalStep("G", `${security} US EQ G`, "command-1", "full")]
    });
  }
  const terseSecurityFollowup = security && /^(?:and\s+)?(?:(?:what|how)\s+about\s+)?(?:amazon|meta|facebook|microsoft|apple|nvidia|tesla|oracle)\s*$/.test(text);
  if (terseSecurityFollowup && ["G", "Q", "FOCUS", "QM"].includes(String(focusedPanel?.command ?? context?.last_panel?.command ?? "").toUpperCase())) {
    return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: workflowLayout("focus"),
      steps: [exactTerminalStep("G", `${security} US EQ G`, "command-1", "full")]
    });
  }
  const forwardPE = /\bforward\s+(?:p\s*\/?\s*e|p e|pe|pee|piece|p)(?:\s+(?:multiple|valuation|chart))?\b/.test(text);
  if (forwardPE && security) {
    return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: null,
      steps: [commandStep("EM", security)]
    });
  }

  const stockPriceChart = /\b(?:stock|share)?\s*price\s+chart\b|\bstock\s+chart\b/.test(text);
  const wantsHeatmap = /\b(?:market\s+)?heat\s*map\b/.test(text);
  if (explicitlyOpening && stockPriceChart && security && wantsHeatmap) {
    return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: workflowLayout("market"),
      steps: [
        { ...commandStep("HMAP", null, "command-1"), layout: { placement: "left" } },
        { ...commandStep("G", security, "command-2"), layout: { placement: "right" } }
      ]
    });
  }
  if (explicitlyOpening && stockPriceChart && security) {
    return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: null,
      steps: [commandStep("G", security)]
    });
  }

  // Two straightforward opens are also deterministic. Each clause must name
  // an exact supported surface and, for security-scoped commands, a known
  // company. Anything involving configuration remains on the strict path.
  const openClauses = text.split(/\b(?:and then|then|and)\b/).map(value => value.trim()).filter(Boolean);

  // Compose one complete open request with its trailing verified window
  // control. This lane runs before generic window handling so “open X and
  // maximize it” cannot turn into a maximize against a panel that was never
  // opened.
  const openControl = !/\b(?:close|dismiss|remove)\b/.test(text) ? trailingOpenControl(text) : null;
  if (explicitlyOpening && openControl) {
    const openingPlan = parseControlFollowup(openControl.core, context);
    if (!openingPlan?.steps?.some(step => step.kind === "command")) return null;
    return validateWorkflowPlan({
      version: 2, failure_policy: openingPlan.failure_policy, layout: openingPlan.layout,
      steps: [
        ...openingPlan.steps,
        {
          id: `control-${openingPlan.steps.length + 1}`, kind: "control",
          operation: openControl.operation, target: openControl.target,
          value: openControl.value, required: true
        }
      ]
    });
  }

  if (explicitlyOpening && openClauses.length === 2 && !directOpenModifier.test(text)) {
    const pair = openClauses.map((clause, index) => {
      const clauseTarget = targetFor(clause);
      const allowed = directGlobalOpen.has(clauseTarget.command)
        || (directSecurityOpen.has(clauseTarget.command) && clauseTarget.security);
      return allowed ? commandStep(clauseTarget.command, directSecurityOpen.has(clauseTarget.command) ? clauseTarget.security : null, `command-${index + 1}`) : null;
    });
    if (pair.every(Boolean)) return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: workflowLayout("grid"), steps: pair
    });
  }

  // A conversational close-and-open is one ordered replacement workflow.
  // The close is optional so a missing prior panel cannot prevent the newly
  // requested information from opening.
  if (/\b(close|dismiss|remove)\b/.test(text) && explicitlyOpening) {
    const opener = /\b(?:open|launch|create|build|display)\b|\bpull(?: up)?\b|\bbring up\b|\bshow\b/.exec(text);
    if (opener) {
      const openingPlan = parseControlFollowup(text.slice(opener.index), context);
      if (!openingPlan?.steps?.some(step => step.kind === "command")) return null;
      const closeClause = text.slice(0, opener.index);
      const namedClose = targetFor(closeClause);
      const contextual = context?.focused_panel?.command
        ? { mode: "focused", command: null, security: null }
        : { mode: "last", command: null, security: null };
      const closeTarget = namedClose.command
        ? { mode: "command", command: namedClose.command, security: namedClose.security }
        : contextual;
      const steps = [
        { id: "control-1", kind: "control", operation: "close", target: closeTarget, value: null, required: false },
        ...openingPlan.steps.map((step, index) => ({ ...step, id: `${step.kind}-${index + 2}` }))
      ];
      return validateWorkflowPlan({
        version: 2, failure_policy: "stop_on_required", layout: openingPlan.layout,
        steps
      });
    }
  }

  // Explicit index-map requests are fully deterministic and should never be
  // confused with either the world venue map or the separate market heatmap.
  if (target.command === "IMAP" && (explicitlyOpening || /\bshow\b/.test(text))) {
    const actions = [];
    if (/\b(dow|djia)\b/.test(text)) actions.push({ feature: "index", operation: "select", value: "DJIA" });
    else if (/\b(s p|sp|s and p)(?: 500)?\b/.test(text)) actions.push({ feature: "index", operation: "select", value: "S&P 500" });
    if (/\btable\b/.test(text)) actions.push({ feature: "view", operation: "select", value: "Table" });
    else if (/\bmap\b/.test(text)) actions.push({ feature: "view", operation: "select", value: "Map" });
    return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: null,
      steps: [{ id: "command-1", kind: "command", command: "IMAP", terminal_command: "IMAP", security_query: null,
        arguments: [], actions, required: true, layout: null }]
    });
  }

  // Plain "open X" requests should never pay an LLM round trip. Keep this
  // deliberately narrow: any requested filter, view, metric, comparison,
  // layout, export, or second operation falls through to the strict compiler.
  const describesOneSurface = (target.command === "SI" && /\bshort interest\b.*\bdays to cover\b/.test(text))
    || (target.command === "DVD" && /\bdividend\b.*\bpayment history\b/.test(text))
    || (target.command === "FX" && /\bforex\b.*\bcurrency converter\b/.test(text))
    || (target.command === "TAS" && /\b(?:live tape|time and sales)\b/.test(text))
    || (target.command === "HELP" && /\bhelp\b.*\bshortcuts\b/.test(text))
    || (target.command === "IPO" && /\bipo\b.*\b(?:calendar|recent performance)\b/.test(text))
    || (target.command === "MAP" && /\bworld (?:venue|exchange opening) map\b/.test(text))
    || (target.command === "ALLQ" && /\bevery (?:listing|venue)\b.*\bquote\b/.test(text));
  const activeIsSurfaceName = ["MOST", "MOSO"].includes(target.command) && /\bmost active\b/.test(text);
  const hasOpenModifier = (/\b(?:and|then)\b/.test(text) && !describesOneSurface)
    || (directOpenModifier.test(text) && !activeIsSurfaceName);
  if (explicitlyOpening && target.command === "EM" && security) {
    const emOpen = compileEMFollowup({ command: "EM", target }, transcript);
    if (emOpen?.ready_for_live_executor && emOpen.actions.length) {
      return validateWorkflowPlan({
        version: 2, failure_policy: "stop_on_any", layout: null,
        steps: [{ ...commandStep("EM", security), actions: emOpen.actions }]
      });
    }
  }
  if (explicitlyOpening && target.command === "GF" && security) {
    const mentionedSecurities = commonSecurities
      .filter(([name]) => new RegExp(`\\b${name}\\b`).test(text))
      .map(([, ticker]) => ticker);
    if (/\b(?:compare|comparing|versus|vs)\b/.test(text) && new Set(mentionedSecurities).size > 1) return null;
    const gfOpen = compileChartOptionsFollowup({ command: "GF", target }, transcript);
    if (gfOpen?.ready_for_live_executor && gfOpen.executable_actions.length) {
      const actions = gfOpen.executable_actions.map(({ feature, operation, value }) => ({ feature, operation, value }));
      const focusedMatches = String(focusedPanel?.command ?? "").toUpperCase() === "GF"
        && String(focusedPanel?.security ?? "").toUpperCase() === security;
      const matchingPanels = Array.isArray(context?.panels) ? context.panels.filter(panel =>
        panel?.connected !== false && String(panel?.command ?? "").toUpperCase() === "GF"
        && String(panel?.security ?? "").toUpperCase() === security) : [];
      if (focusedMatches || matchingPanels.length === 1) {
        return validateWorkflowPlan({
          version: 2, failure_policy: "stop_on_any", layout: null,
          steps: [{
            id: "configure-1", kind: "configure",
            target: focusedMatches
              ? { mode: "focused", command: "GF", security }
              : { mode: "command", command: "GF", security },
            actions, required: true
          }]
        });
      }
      if (matchingPanels.length > 1) return null;
      return validateWorkflowPlan({
        version: 2, failure_policy: "stop_on_any", layout: workflowLayout("focus"),
        steps: [{
          ...commandStep("GF", security),
          actions,
          layout: { placement: "full" }
        }]
      });
    }
  }
  if (explicitlyOpening && target.command === "EQS") {
    const eqsOpen = compileEQSFollowup({ command: "EQS", target }, transcript);
    if (eqsOpen?.ready_for_live_executor && eqsOpen.actions.length) {
      const actions = eqsOpen.actions.map(({ feature, operation, value }) => ({ feature, operation, value }));
      const focusedMatches = String(focusedPanel?.command ?? "").toUpperCase() === "EQS";
      const matchingPanels = Array.isArray(context?.panels) ? context.panels.filter(panel =>
        panel?.connected !== false && String(panel?.command ?? "").toUpperCase() === "EQS") : [];
      if (focusedMatches || matchingPanels.length === 1) {
        return validateWorkflowPlan({
          version: 2, failure_policy: "stop_on_any", layout: null,
          steps: [{
            id: "configure-1", kind: "configure",
            target: focusedMatches
              ? { mode: "focused", command: "EQS", security: null }
              : { mode: "command", command: "EQS", security: null },
            actions, required: true
          }]
        });
      }
      if (matchingPanels.length > 1) return null;
      return validateWorkflowPlan({
        version: 2, failure_policy: "stop_on_any", layout: workflowLayout("focus"),
        steps: [{ ...commandStep("EQS"), actions, layout: { placement: "full" } }]
      });
    }
  }
  if (explicitlyOpening && target.command === "HALT") {
    const haltTab = /\b(resumed|resume)\b/.test(text) ? "Resumed"
      : /\b(active|current)\b/.test(text) ? "Active"
        : /\b(all|everything|every)\b/.test(text) ? "All" : null;
    if (haltTab) return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: null,
      steps: [{ ...commandStep("HALT"), actions: [{ feature: "tab", operation: "select", value: haltTab }] }]
    });
  }
  if (explicitlyOpening && target.command === "HMAP") {
    const hmapOpen = compileHMAPFollowup({ command: "HMAP", target }, transcript);
    if (hmapOpen?.ready_for_live_executor && hmapOpen.actions.length) return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: null,
      steps: [{ ...commandStep("HMAP"), actions: hmapOpen.actions }]
    });
  }
  if (explicitlyOpening && target.command === "MOST") {
    const mostOpen = compileMOSTFollowup({ command: "MOST", target }, transcript);
    if (mostOpen?.ready_for_live_executor && mostOpen.actions.length) return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: null,
      steps: [{ ...commandStep("MOST"), actions: mostOpen.actions }]
    });
  }
  const canDirectOpen = explicitlyOpening && target.command && !hasOpenModifier
    && (directGlobalOpen.has(target.command) || (directSecurityOpen.has(target.command) && security));
  if (canDirectOpen) {
    return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: null,
      steps: [commandStep(target.command, directSecurityOpen.has(target.command) ? security : null)]
    });
  }

  // Window-management language takes precedence over nested labels. Without
  // this guard, "make the heatmap bigger" can look like a Map-view request,
  // and "close active halts" can look like an Active-tab request.
  const explicitWindowControl = /\b(close|dismiss|remove|maximize|maximise|full ?screen|restore|unmaximize|unmaximise|enlarge|shrink)\b/.test(text)
    || /\b(make|resize|grow)\b.*\b(bigger|larger|wider|taller|smaller|narrower|shorter)\b/.test(text)
    || /\b(move|put|place|send)\b.*\b(left|right|top|bottom|full)\b/.test(text)
    || /\b(focus|bring)\b.*\b(front|forward|focus)\b/.test(text)
    || (/\b(download|export)\b/.test(text) && /\b(this|it|current|data|window|panel)\b/.test(text));

  // A window export and a nested view change are two distinct operations.
  // The fast path must not silently discard the view half of the request.
  if (target.command === "HMAP" && /\b(?:download|export)\b/.test(text) && /\b(?:map|table)\b/.test(text)) return null;

  if (target.command === "GF" && !explicitlyOpening && !explicitWindowControl) {
    const candidate = compileChartOptionsFollowup({ command: "GF", target }, transcript);
    if (candidate?.ready_for_live_executor) {
      const actions = candidate.executable_actions.map(item => ({
        feature: item.feature,
        operation: item.operation,
        value: item.value
      }));
      return validateWorkflowPlan({
        version: 2, failure_policy: "stop_on_any", layout: null,
        steps: [{ id: "configure-1", kind: "configure", target, actions, required: true }]
      });
    }
  }

  if (target.command === "EM" && !explicitlyOpening && !explicitWindowControl) {
    const candidate = compileEMFollowup({ command: "EM", target }, transcript);
    if (candidate?.ready_for_live_executor) {
      return validateWorkflowPlan({
        version: 2, failure_policy: "stop_on_any", layout: null,
        steps: [{ id: "configure-1", kind: "configure", target, actions: candidate.actions, required: true }]
      });
    }
  }

  if (target.command === "G" && !explicitlyOpening && !explicitWindowControl) {
    const candidate = compileChartOptionsFollowup({ command: "G", target }, transcript);
    if (candidate?.ready_for_live_executor && candidate.executable_actions.length === 1) {
      const { feature, operation, value } = candidate.executable_actions[0];
      return validateWorkflowPlan({
        version: 2, failure_policy: "stop_on_any", layout: null,
        steps: [{ id: "configure-1", kind: "configure", target, actions: [{ feature, operation, value }], required: true }]
      });
    }
    if (candidate) return null;
  }

  if (target.command === "HMS" && !explicitlyOpening && !explicitWindowControl) {
    const candidate = compileHMSFollowup({
      ...context, command: "HMS", target,
      members: focusedPanel?.members ?? context?.members ?? []
    }, transcript);
    if (candidate?.ready_for_live_executor) return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: null,
      steps: [{ id: "configure-1", kind: "configure", target, actions: candidate.actions, required: true }]
    });
    if (candidate) return null;
  }

  // EQS range filters are structured payloads, not separate terminal
  // commands. Compile the whole spoken request into one ordered configure
  // step so a trailing "run it" is applied only after every bound is set.
  if ((target.command === "EQS" || target.command == null) && !explicitlyOpening && !explicitWindowControl) {
    const eqsTarget = target.command === "EQS" ? target : { mode: "focused", command: "EQS", security: null };
    const candidate = compileEQSFollowup({ command: "EQS", target: eqsTarget }, transcript);
    if (candidate?.ready_for_live_executor && candidate.actions.length) {
      const actions = candidate.actions.map(({ feature, operation, value }) => ({ feature, operation, value }));
      if (target.command == null && /\bscreen (?:companies|stocks|equities)\b/.test(text)) {
        return validateWorkflowPlan({
          version: 2, failure_policy: "stop_on_any", layout: null,
          steps: [{
            id: "command-1", kind: "command", command: "EQS", terminal_command: "EQS",
            security_query: null, arguments: [], actions, required: true, layout: null
          }]
        });
      }
      return validateWorkflowPlan({
        version: 2, failure_policy: "stop_on_any", layout: null,
        steps: [{
          id: "configure-1", kind: "configure", target: eqsTarget,
          actions,
          required: true
        }]
      });
    }
    if (candidate) return null;
  }

  // "OpenAI" is often transcribed as "open eye". Let the strict News-query
  // grammar decide this branch instead of treating that token as an opener.
  if (target.command === "N" && !explicitWindowControl) {
    const candidate = compileNewsFollowup(target, transcript);
    if (candidate) return candidate;
  }

  if (target.command === "SECF" && !explicitlyOpening && !explicitWindowControl) {
    const candidate = compileSECFFollowup({ command: "SECF", target }, transcript);
    if (candidate?.ready_for_live_executor && candidate.action) {
      const { feature, operation, value } = candidate.action;
      return validateWorkflowPlan({
        version: 2, failure_policy: "stop_on_any", layout: null,
        steps: [{ id: "configure-1", kind: "configure", target, actions: [{ feature, operation, value }], required: true }]
      });
    }
  }

  if (text.split(" ").length > 14) return null;

  if (target.command === "HALT" && !explicitWindowControl) {
    const value = /\b(resumed|resume)\b/.test(text) ? "Resumed"
      : /\b(active|current)\b/.test(text) ? "Active"
        : /\b(all|everything|every)\b/.test(text) ? "All" : null;
    if (value) return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: null,
      steps: [{ id: "configure-1", kind: "configure", target, actions: [{ feature: "tab", operation: "select", value }], required: true }]
    });
  }

  if (target.command === "HMAP" && !explicitWindowControl) {
    const candidate = compileHMAPFollowup({ command: "HMAP", target }, transcript);
    // Never execute only the verified subset of a compound request. If a
    // toolbar action is still unbound, decline the whole fast path so the user
    // receives an honest unsupported/clarification outcome upstream.
    if (candidate?.ready_for_live_executor && candidate.executable_actions.length === 1) return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: null,
      steps: [{ id: "configure-1", kind: "configure", target, actions: candidate.executable_actions, required: true }]
    });
    if (candidate) return null;
  }

  if (target.command === "HDS" && !explicitlyOpening && !explicitWindowControl
      && !/\b(?:show me|pull up|bring up)\b/.test(text)) {
    const value = /\bbubbles?\b/.test(text) ? "Bubble"
      : /\btreemap\b|\btree map\b/.test(text) ? "Treemap"
        : /\btable\b/.test(text) ? "Table" : null;
    if (value) return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: null,
      steps: [{ id: "configure-1", kind: "configure", target, actions: [{ feature: "view", operation: "select", value }], required: true }]
    });
  }

  if (target.command === "HDS" && target.security && /\b(?:open|show me|pull up|bring up)\b/.test(text) && !explicitWindowControl) {
    const value = /\bbubbles?\b/.test(text) ? "Bubble"
      : /\btreemap\b|\btree map\b/.test(text) ? "Treemap"
        : /\btable\b/.test(text) ? "Table" : null;
    if (value) return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: null,
      steps: [{
        id: "command-1", kind: "command", command: "HDS",
        terminal_command: `${target.security} US EQ HDS`, security_query: null,
        arguments: [], actions: [{ feature: "view", operation: "select", value }], required: true, layout: null
      }]
    });
  }

  if (target.command === "OMON" && !explicitlyOpening && !explicitWindowControl) {
    const candidate = compileChartOptionsFollowup({ command: "OMON", target }, transcript);
    if (candidate?.ready_for_live_executor) {
      return validateWorkflowPlan({
        version: 2, failure_policy: "stop_on_any", layout: null,
        steps: [{
          id: "configure-1", kind: "configure", target,
          actions: candidate.executable_actions.map(({ feature, operation, value }) => ({ feature, operation, value })),
          required: true
        }]
      });
    }
  }

  if (target.command === "EQS" && !explicitlyOpening && !explicitWindowControl) {
    const operation = /\bclear\b.*\b(?:filters?|screen|screener)\b|\breset\b.*\b(?:filters?|screen|screener)\b/.test(text) ? "clear"
      : /\b(?:run|apply|refresh)\b.*\b(?:screen|screener|query|results?)\b|^run (?:it|that)$/.test(text) ? "run" : null;
    if (operation) return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: null,
      steps: [{ id: "configure-1", kind: "configure", target, actions: [{ feature: "screen", operation, value: null }], required: true }]
    });
  }

  if (target.command === "EM" && !explicitWindowControl) {
    const metrics = [
      ["gross revenue", "Gross Revenue"], ["net revenue", "Net Revenue"],
      ["cash flow from operations", "Cash Flow From Operations"], ["c f o", "Cash Flow From Operations"],
      ["cash flow from investing", "Cash Flow From Investing"], ["c f i", "Cash Flow From Investing"],
      ["cash flow from financing", "Cash Flow From Financing"], ["c f f", "Cash Flow From Financing"],
      ["current liabilities", "Current Liabilities"], ["current assets", "Current Assets"],
      ["shareholder equity", "Shareholder Equity"], ["total assets", "Total Assets"],
      ["net income", "Net Income"], ["e bit duh", "EBITDA"], ["ebitda", "EBITDA"],
      ["e p s", "EPS (GAAP)"], ["eps", "EPS (GAAP)"], ["sales", "Sales"], ["revenue", "Sales"]
    ];
    const value = metrics.find(([phrase]) => new RegExp(`\\b${phrase.replace(/ /g, "\\s+")}\\b`).test(text))?.[1] ?? null;
    if (value) return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: null,
      steps: [{ id: "configure-1", kind: "configure", target, actions: [{ feature: "metric", operation: "select", value }], required: true }]
    });
  }

  if (target.command === "MOST" && !explicitWindowControl) {
    const candidate = compileMOSTFollowup({ command: "MOST", target }, transcript);
    if (candidate?.ready_for_live_executor) return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: null,
      steps: [{ id: "configure-1", kind: "configure", target, actions: candidate.actions, required: true }]
    });
    if (candidate) return null;
  }

  if (target.command === "GF" && !explicitWindowControl) {
    const range = ["1Y", "3Y", "5Y", "10Y", "Max"].find(value => {
      const words = { "1Y": "one year", "3Y": "three years", "5Y": "five years", "10Y": "ten years", Max: "max|maximum|all time" }[value];
      return new RegExp(`\\b(?:${value.toLowerCase()}|${words})\\b`).test(text);
    });
    if (range) return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: null,
      steps: [{ id: "configure-1", kind: "configure", target, actions: [{ feature: "range", operation: "select", value: range }], required: true }]
    });
  }

  let operation = null;
  let value = null;

  const sizeText = text.split(/\b(?:wait no|no wait|no sorry|scratch that|i mean|rather|correction)\b/).at(-1).trim();
  // VoiceInk often inserts “actually” as harmless connective speech in an
  // additive geometry request (“smaller, and actually to the right”). Do not
  // treat it as a correction boundary or the resize half disappears.
  const wantsLarger = /\b(make|resize|grow)\b.*\b(bigger|larger|wider|taller)\b|\b(enlarge|larger|bigger)\b/.test(sizeText);
  const wantsSmaller = /\b(make|resize|shrink)\b.*\b(smaller|narrower|shorter)\b|\b(shrink|smaller)\b/.test(sizeText);
  if (wantsLarger && wantsSmaller) return null;
  const compoundPlacement = ["top-left", "top-right", "bottom-left", "bottom-right", "left", "right", "top", "bottom", "full"]
    .find(place => new RegExp(`\\b${place.replace("-", "[ -]?")}\\b`).test(sizeText));
  if ((wantsLarger || wantsSmaller) && compoundPlacement && /\b(?:move|put|place|send|to|on)\b/.test(sizeText)) {
    const controlTarget = target.mode === "command" ? target : { mode: target.mode, command: null, security: null };
    return validateWorkflowPlan({
      version: 2, failure_policy: "stop_on_any", layout: null,
      steps: [
        { id: "control-1", kind: "control", operation: "resize", target: controlTarget, value: wantsLarger ? "larger" : "smaller", required: true },
        { id: "control-2", kind: "control", operation: "move", target: controlTarget, value: compoundPlacement, required: true }
      ]
    });
  }
  if (wantsLarger) {
    operation = "resize"; value = "larger";
  } else if (wantsSmaller) {
    operation = "resize"; value = "smaller";
  } else if (/\b(maximize|maximise|full ?screen)\b/.test(sizeText)) {
    operation = "maximize";
  } else if (/\b(restore|unmaximize|unmaximise)\b/.test(sizeText)) {
    operation = "restore";
  } else if (/\b(close|dismiss|remove)\b/.test(sizeText)) {
    operation = "close";
  } else if (/\b(focus|bring)\b.*\b(front|forward|focus)\b|^focus\b/.test(sizeText)) {
    operation = "focus";
  } else if (/\b(download|export)\b/.test(sizeText) && /\b(this|it|current|data|window|panel)\b/.test(sizeText)) {
    operation = "export";
  } else {
    const placement = ["top-left", "top-right", "bottom-left", "bottom-right", "left", "right", "top", "bottom", "full"]
      .find(place => new RegExp(`\\b${place.replace("-", "[ -]?")}\\b`).test(sizeText));
    if (placement && /\b(move|put|place|send)\b/.test(text)) {
      operation = "move"; value = placement;
    }
  }
  if (!operation) return null;
  const correctedTarget = targetFor(sizeText);
  const finalTarget = correctedTarget.command ? correctedTarget : target;
  const controlTarget = finalTarget.mode === "command" ? finalTarget : { mode: finalTarget.mode, command: null, security: null };
  return validateWorkflowPlan({
    version: 2,
    failure_policy: "stop_on_any",
    layout: null,
    steps: [{ id: "control-1", kind: "control", operation, target: controlTarget, value, required: true }]
  });
}

export function encodeControlFollowup(transcript, context = null) {
  const plan = parseControlFollowup(transcript, context);
  return plan ? encodeWorkflowPlan(plan) : null;
}
