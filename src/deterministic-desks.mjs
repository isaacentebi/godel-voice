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

function layout(preset) {
  return { mode: "tile", direction: "row", gap_px: 12, preset, preserve_existing: false, new_screen: false };
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
      `${security} US EQ ${command}`,
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

/**
 * Compile bounded multi-panel workspaces from native Godel commands and the
 * small set of nested actions already verified by the live adapter. This
 * module never invents a click path or enables an export.
 */
export function compileDeterministicDesk({ transcript, text, security, explicitlyOpening }) {
  if (!text || text.split(" ").length > 80) return null;
  const deskNoun = /\b(?:desk|dashboard|workspace|setup|screen)\b/.test(text);

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
        commandStep("G", `${security} US EQ G`, "command-1", "top-left"),
        commandStep("OMON", `${security} US EQ OMON`, "command-2", "top-right", actions),
        commandStep("OVME", `${security} US EQ OVME`, "command-3", "bottom")
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
        commandStep("GF", `${security} US EQ GF`, "command-2", "right", actions)
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
      steps: [commandStep("GF", `${base.ticker} US EQ GF`, "command-1", "full", [...controlActions, ...companyActions, ...metricActions])]
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
      steps: [commandStep("HMS", `${base.ticker} US EQ HMS`, "command-1", "full", candidate.actions)]
    };
  }

  return null;
}
