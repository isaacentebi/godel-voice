import { compileChartOptionsFollowup } from "./commands/chart-options-followup.mjs";
import { compileHMSFollowup } from "./commands/q-hldr-hms-followup.mjs";

const SECURITIES = Object.freeze([
  ["amazon", "AMZN"], ["meta", "META"], ["facebook", "META"],
  ["microsoft", "MSFT"], ["apple", "AAPL"], ["nvidia", "NVDA"],
  ["tesla", "TSLA"], ["oracle", "ORCL"], ["alphabet", "GOOG"],
  ["google", "GOOG"], ["reddit", "RDDT"], ["netflix", "NFLX"],
  ["palantir", "PLTR"], ["service now", "NOW"], ["servicenow", "NOW"]
]);

function commandStep(command, terminalCommand, id, placement, actions = []) {
  return {
    id, kind: "command", command, terminal_command: terminalCommand,
    security_query: null, arguments: [], actions, required: true,
    layout: placement ? { placement } : null
  };
}

function layout(preset, newScreen = false) {
  return { mode: "tile", direction: "row", gap_px: 12, preset, preserve_existing: false, new_screen: newScreen };
}

function securitySteps(security, commands, preset) {
  const placements = commands.length === 3 ? ["top-left", "top-right", "bottom"]
    : commands.length === 4 ? ["top-left", "top-right", "bottom-left", "bottom-right"]
      : ["left", "right"];
  return {
    version: 2,
    failure_policy: "stop_on_any",
    layout: layout(preset),
    steps: commands.map((command, index) => commandStep(
      command,
      `${security} EQ ${command}`,
      `command-${index + 1}`,
      placements[index]
    ))
  };
}

function mentionedSecurities(text) {
  const found = [];
  for (const [name, ticker] of SECURITIES) {
    if (new RegExp(`\\b${name.replace(/ /g, "\\s+")}\\b`).test(text) && !found.some(item => item.ticker === ticker)) {
      found.push({ spoken_name: name, ticker, venue: "US", asset_class: "EQ" });
    }
  }
  return found;
}

function placementFrom(text) {
  for (const [pattern, placement] of [
    [/\b(?:upper|top)[ -]?left\b/, "top-left"], [/\b(?:upper|top)[ -]?right\b/, "top-right"],
    [/\b(?:lower|bottom)[ -]?left\b/, "bottom-left"], [/\b(?:lower|bottom)[ -]?right\b/, "bottom-right"],
    [/\b(?:underneath|under|below|beneath)\b/, "bottom"], [/\babove\b/, "top"],
    [/\bleft\b/, "left"], [/\bright\b/, "right"]
  ]) if (pattern.test(text)) return placement;
  return null;
}

function matchedSurfaces(text, definitions) {
  const matches = [];
  for (const [command, pattern, terminalCommand = null] of definitions) {
    const match = pattern.exec(text);
    if (match && !matches.some(item => item.command === command)) {
      matches.push({ command, index: match.index, end: match.index + match[0].length, terminalCommand });
    }
  }
  matches.sort((left, right) => left.index - right.index);
  return matches.map((item, index) => ({
    command: item.command,
    terminalCommand: item.terminalCommand,
    // Spoken placement may appear either directly after a surface ("heatmap
    // on the left") or immediately before it ("on the left put heatmap").
    // Split inter-surface text at conjunctions so a placement introducing the
    // next panel is never attached to the preceding panel.
    placement: placementFrom(
      text.slice(item.end, matches[index + 1]?.index ?? text.length).split(/\b(?:and then|then|and)\b|,/)[0]
    ) ?? placementFrom(
      text.slice(matches[index - 1]?.end ?? 0, item.index).split(/\b(?:and then|then|and)\b|,/).at(-1)
    )
  }));
}

function requestedResearchSurfaces(text) {
  const surfaces = [
    ["DES", /\b(?:company |business )?(?:description|overview|profile)\b/],
    ["FA", /\b(?:financial |three )?statements?\b|\bfinancials\b/],
    ["EM", /\b(?:earnings )?(?:matrix|matt? tricks)\b/],
    ["ERN", /\b(?:analyst |earnings )?estimates?\b/],
    ["CF", /\b(?:sec )?(?:filings?|fill ins)\b/],
    ["TRAN", /\b(?:earnings )?(?:transcripts?|calls?)\b/],
    ["ANR", /\b(?:analyst |broker )?ratings?\b/],
    ["HDS", /\b(?:institutional )?(?:holders?|owners?|ownership)\b/],
    ["RES", /\b(?:research|sell side) reports?\b/],
    ["N", /\b(?:company )?news\b/],
    ["G", /\b(?:price |stock )?chart\b/]
  ];
  return matchedSurfaces(text, surfaces);
}

function requestedMarketSurfaces(text) {
  return matchedSurfaces(text, [
    ["WEI", /\b(?:world|global) (?:equity |stock )?(?:indices|indexes|markets)\b/],
    ["WEIF", /\b(?:index|indices|indexes|equity) futures\b|\bfutures indices\b|(?<!commodity )(?<!commodities )\bfutures\b/],
    ["GLCO", /\b(?:global )?commodit(?:y|ies)\b/],
    ["FX", /\b(?:forex|fx|currencies|currency converter|cross rates?)\b/],
    ["G", /\b(?:vix|fear index|(?:cboe )?volatility index)\b/, "VIX CBOE IDX G"],
    ["HMAP", /\b(?:market )?heat\s*map\b/],
    ["IMAP", /\b(?:intraday|impact|index|sector) (?:market )?(?:map|wheel)\b/],
    ["MAP", /\b(?:world )?(?:exchange|venue) (?:opening |open )?map\b/],
    ["HALT", /\b(?:market |trading )?halts?\b/],
    ["MOST", /\bmost active (?:stocks?|equities|shares)\b/],
    ["MOSO", /\bmost active options?\b/],
    ["TOP", /\btop reuters(?: (?:stories|headlines|news))?\b|\breuters (?:stories|headlines|news)\b|\btop news\b/],
    ["TREND", /\btrending (?:tickers?|securities|stocks?)\b/],
    ["IPO", /\bipo (?:calendar|list)\b/]
  ]);
}

function dynamicCommandSteps(surfaces, security = null) {
  return surfaces.map(({ command, placement, terminalCommand }, index) => commandStep(
    command,
    terminalCommand ?? (security ? `${security} EQ ${command}` : command),
    `command-${index + 1}`,
    placement
  ));
}

/**
 * Compile bounded multi-panel workspaces from native Godel commands and the
 * small set of nested actions already verified by the live adapter. This
 * module never invents a click path or enables an export.
 */
export function compileDeterministicDesk({ transcript, text, security, explicitlyOpening }) {
  if (!text || text.split(" ").length > 80) return null;
  if (/\b(?:close|dismiss|remove)\b/.test(text)) return null;
  const deskNoun = /\b(?:desk|dashboard|workspace|setup)\b|\b(?:research|earnings|options?|company|market|macro) screen\b/.test(text);
  const researchSurfaces = requestedResearchSurfaces(text);
  const marketSurfaces = requestedMarketSurfaces(text);
  const researchDesk = /\b(?:company|equity|stock|investment|research)\s+(?:desk|dashboard|workspace|screen)\b|\bresearch desk\b/.test(text);
  const marketDesk = /\b(?:market|macro)\s+(?:desk|dashboard|workspace|screen|monitor|strip)\b/.test(text)
    || /\b(?:new|fresh|clean) market screen\b/.test(text);
  const asksNewScreen = /\b(?:on |in )?(?:a )?(?:new|second) (?:screen|tab)\b|\b(?:new|fresh|clean|blank) (?:market |research |company |macro )?screen\b/.test(text);
  const mixedMarketFundamentals = security
    && researchSurfaces.length === 1 && researchSurfaces[0].command === "G"
    && marketSurfaces.some(item => item.command === "HMAP")
    && /\b(?:operating|gross|net) margins?\b|\brevenues?\b|\breturn on equity\b/.test(text);

  // Large mixed workspaces are where model latency and omission risk hurt the
  // most. When the user names every native panel explicitly, compose the
  // market strip first and the company research strip second, preserving the
  // spoken order between those two clauses. Only live-verified nested actions
  // are attached; a trailing maximize is a separate exact control step.
  const explicitMixedWorkspace = security
    && (asksNewScreen || explicitlyOpening)
    && marketSurfaces.length >= 2
    && researchSurfaces.length >= 2
    && /\b(?:then|and then)\b/.test(text);
  if (explicitMixedWorkspace) {
    const combined = [
      ...dynamicCommandSteps(marketSurfaces),
      ...dynamicCommandSteps(researchSurfaces, security)
    ].map((step, index) => ({ ...step, id: `command-${index + 1}` }));
    for (const step of combined) {
      if (step.command === "HALT") {
        const value = /\b(?:active|current) halts?\b/.test(text) ? "Active"
          : /\bresumed (?:trading )?halts?\b/.test(text) ? "Resumed"
            : /\ball halts?\b/.test(text) ? "All" : null;
        if (value) step.actions.push({ feature: "tab", operation: "select", value });
      }
      if (step.command === "HMAP" && /\b(?:heat\s*map|hmap)\b[^.]{0,40}\btable(?: view)?\b/.test(text)) {
        step.actions.push({ feature: "view", operation: "select", value: "Table" });
      }
    }
    if (/\b(?:finally\s+)?maximi[sz]e (?:the )?(?:earnings )?matrix\b/.test(text)) {
      combined.push({
        id: `control-${combined.length + 1}`, kind: "control", operation: "maximize",
        target: { mode: "command", command: "EM", security }, value: null, required: true
      });
    }
    return {
      version: 2, failure_policy: "stop_on_any",
      layout: layout("market", asksNewScreen), steps: combined
    };
  }

  // Mixed market and company research requests need clause-level placement
  // and must stay on the strict planner; never execute only one half.
  if (researchSurfaces.length && marketSurfaces.length && !mixedMarketFundamentals) return null;

  // A user may name the exact research panels instead of relying on the
  // default desk. Every item here is a native read-only terminal open. Nested
  // statement configuration and optional-step semantics remain strict-only.
  const unsupportedResearchModifier = /\b(?:annual|yearly|quarterly|cash flow|income statement|balance sheet|optionally|if available|if possible)\b/.test(text);
  if (security && researchDesk && unsupportedResearchModifier) return null;
  if (security && !unsupportedResearchModifier
      && (researchDesk || (deskNoun && /\bearnings\b/.test(text)) || (explicitlyOpening && researchSurfaces.length >= 3))
      && researchSurfaces.length >= 2) {
    return {
      version: 2, failure_policy: "stop_on_any", layout: layout("research", asksNewScreen),
      steps: dynamicCommandSteps(researchSurfaces, security)
    };
  }

  // Market strips are similarly composed from native global commands. Only
  // the already-verified HALT tab and HMAP/IMAP view selectors are attached.
  const unsupportedMarketModifier = /\b(?:market movers?|yield curve|rates? monitor|sector filters?|(?:s\s*(?:and\s*)?p|sp|dow)(?: 500)? chart)\b/.test(text);
  if (!security && marketDesk && unsupportedMarketModifier) return null;
  if (!security && (marketDesk || asksNewScreen || (explicitlyOpening && marketSurfaces.length >= 2))
      && marketSurfaces.length >= (marketDesk ? 1 : 2)) {
    const steps = dynamicCommandSteps(marketSurfaces);
    for (const step of steps) {
      if (step.command === "HALT") {
        const value = /\b(?:active|current) halts?\b/.test(text) ? "Active"
          : /\bresumed (?:trading )?halts?\b/.test(text) ? "Resumed"
            : /\ball halts?\b/.test(text) ? "All" : null;
        if (value) step.actions.push({ feature: "tab", operation: "select", value });
      }
      if (step.command === "HMAP" && /\b(?:heat\s*map|hmap)\b[^.]{0,40}\btable(?: view)?\b/.test(text)) {
        step.actions.push({ feature: "view", operation: "select", value: "Table" });
      }
      if (step.command === "IMAP" && /\b(?:intraday|impact|index|sector)[^.]{0,40}\btable(?: view)?\b/.test(text)) {
        step.actions.push({ feature: "view", operation: "select", value: "Table" });
      }
    }
    return {
      version: 2, failure_policy: "stop_on_any", layout: layout("market", asksNewScreen), steps
    };
  }

  if (explicitlyOpening && security && deskNoun && /\b(?:earnings|results)\b/.test(text)) {
    return securitySteps(security, ["EM", "ERN", "TRAN", "CF"], "research");
  }

  if (explicitlyOpening && security && deskNoun && /\b(?:company|equity|stock|investment|research)\b/.test(text)) {
    return securitySteps(security, ["DES", "EM", "TRAN", "CF"], "research");
  }

  if (explicitlyOpening && security && deskNoun && /\boptions?\b/.test(text)) {
    const omon = compileChartOptionsFollowup({
      command: "OMON",
      target: { mode: "command", command: "OMON", security }
    }, transcript);
    if (omon && !omon.ready_for_live_executor) return null;
    const actions = omon?.executable_actions?.map(({ feature, operation, value }) => ({ feature, operation, value })) ?? [];
    return {
      version: 2, failure_policy: "stop_on_any", layout: layout("options"),
      steps: [
        commandStep("G", `${security} EQ G`, "command-1", "top-left"),
        commandStep("OMON", `${security} EQ OMON`, "command-2", "top-right", actions),
        commandStep("OVME", `${security} EQ OVME`, "command-3", "bottom")
      ]
    };
  }

  const heatmap = /\b(?:market\s+)?heat\s*map\b/.test(text);
  const gfMetric = /\b(?:operating|gross|net) margins?\b|\brevenues?\b|\breturn on equity\b/.test(text);
  if (explicitlyOpening && security && heatmap && gfMetric && /\b(?:chart|graph|fundamentals?)\b/.test(text)) {
    const gf = compileChartOptionsFollowup({
      command: "GF",
      target: { mode: "command", command: "GF", security }
    }, transcript);
    if (!gf?.ready_for_live_executor || !gf.executable_actions.length) return null;
    const actions = gf.executable_actions.map(({ feature, operation, value }) => ({ feature, operation, value }));
    return {
      version: 2, failure_policy: "stop_on_any", layout: layout("market"),
      steps: [
        commandStep("HMAP", "HMAP", "command-1", "left"),
        commandStep("GF", `${security} EQ GF`, "command-2", "right", actions)
      ]
    };
  }

  const companies = mentionedSecurities(text);
  // “Comparing” is the natural form after “open a chart”, and VoiceInk may
  // split or soften the word. Keep this bounded by the requirement for at
  // least two exact known companies below.
  const comparisonIntent = /\b(?:compare|compared|comparing|compairing|comparison|versus|verses|vs|against)\b|\bcom pairing\b/.test(text);
  const fundamentalMetric = /\b(?:revenues?|sales|ebitda|ebit|nopat|margins?|operation margins?|p\s*\/?\s*e|valuation|fundamental)\b/.test(text);
  const unsupportedGFMetric = /\b(?:operating income|operating profit|nopat|ebitda|ebit)\b/.test(text);
  if (companies.length >= 2 && comparisonIntent && unsupportedGFMetric) return null;
  if (companies.length >= 2 && comparisonIntent && fundamentalMetric && !heatmap) {
    const [base, ...peers] = companies;
    const gf = compileChartOptionsFollowup({
      command: "GF",
      target: { mode: "command", command: "GF", security: base.ticker }
    }, transcript);
    if (!gf?.ready_for_live_executor || !gf.executable_actions.length) return null;
    const executableActions = gf.executable_actions
      .map(({ feature, operation, value }) => ({ feature, operation, value }));
    const metricActions = executableActions.filter(item =>
      ["add metric", "margin metric", "ratio metric"].includes(item.feature));
    if (!metricActions.length) return null;
    const controlActions = executableActions.filter(item => !metricActions.includes(item));
    const companyActions = peers.map(item => ({ feature: "add company", operation: "add", value: item.ticker }));
    return {
      version: 2, failure_policy: "stop_on_any", layout: layout("comparison"),
      steps: [commandStep("GF", `${base.ticker} EQ GF`, "command-1", "full", [...controlActions, ...companyActions, ...metricActions])]
    };
  }
  // Do not extract the comparison half from a compound request that also
  // names another workspace. Atomicity is more important than a partial open.
  if (companies.length >= 2 && comparisonIntent && !fundamentalMetric && !heatmap) {
    const [base, ...peers] = companies;
    const candidate = compileHMSFollowup({
      command: "HMS",
      target: { mode: "command", command: "HMS", security: base.ticker },
      members: [base.ticker],
      resolved_entities: companies
    }, `compare ${peers.map(item => item.spoken_name).join(" and ")} ${transcript}`);
    if (!candidate?.ready_for_live_executor) return null;
    return {
      version: 2, failure_policy: "stop_on_any", layout: layout("comparison"),
      steps: [commandStep("HMS", `${base.ticker} EQ HMS`, "command-1", "full", candidate.actions)]
    };
  }

  return null;
}
