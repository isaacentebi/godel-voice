(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GodelVoiceCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PREFIX = "GV1:";
  const COMMANDS = new Set("DES FA ERN EM SI GR ANR DVD QM FOCUS TAS HCP WEI WEIF IMAP HMAP GLCO FX MOST HDS N TOP TREND HALT ALLQ SECF WJI EQS OMON OVME CALC BROK AUM G HMS HP CF IPO TRAN HELP CHAT ACM PDF AL NOTE ENT CHANGE Q RES MAP CITADEL PAT PRT HLDR MOSO GF KELLY NI ERR".split(" "));
  const AUTOMATED = new Set(["HMS", "GR", "GF"]);
  const FEATURES = {
    HMS: new Set(["add/remove securities", "timeframe", "metric", "normalize/overlay/side-by-side"]),
    GR: new Set(["buy leg", "sell leg", "period", "correlation toggle", "correlation window", "regression toggle", "full/filtered data"]),
    GF: new Set(["periodicity", "range", "display currency", "include consensus estimates", "layout", "add company", "add metric", "ratio metric", "margin metric", "style", "axis", "scale", "transform"])
  };

  function parseMarker(text) {
    const value = String(text ?? "").trim();
    if (!value.startsWith(PREFIX)) return null;
    const plan = JSON.parse(value.slice(PREFIX.length));
    return validatePlan(plan);
  }

  function validatePlan(plan) {
    if (!plan || plan.version !== 1) throw new Error("Unsupported Godel voice plan version");
    if (!COMMANDS.has(plan.command)) throw new Error(`Unknown Godel command: ${plan.command}`);
    const terminalCommand = typeof plan.terminal_command === "string" ? plan.terminal_command.trim() : null;
    const securityQuery = typeof plan.security_query === "string" ? plan.security_query.trim() : null;
    if (!terminalCommand && !securityQuery) throw new Error("Missing terminal command or security query");
    if (terminalCommand && /[\r\n]/.test(terminalCommand)) throw new Error("Invalid terminal command");
    if (securityQuery && (securityQuery.length > 120 || /[\r\n]/.test(securityQuery))) throw new Error("Invalid security query");
    if (!Array.isArray(plan.arguments ?? []) || (plan.arguments ?? []).length > 8 || (plan.arguments ?? []).some(value => typeof value !== "string")) {
      throw new Error("Invalid command arguments");
    }
    if (!Array.isArray(plan.actions) || plan.actions.length > 12) throw new Error("Invalid action list");
    if (plan.actions.length && !AUTOMATED.has(plan.command)) throw new Error(`Automation is not enabled for ${plan.command}`);

    const allowed = FEATURES[plan.command] ?? new Set();
    for (const action of plan.actions) {
      const feature = String(action?.feature ?? "").toLowerCase();
      if (!allowed.has(feature)) throw new Error(`Unsupported ${plan.command} feature: ${feature}`);
      if (!String(action?.operation ?? "").trim()) throw new Error(`Missing operation for ${feature}`);
      if (!["string", "number", "boolean"].includes(typeof action.value) && action.value !== null) {
        throw new Error(`Invalid value for ${feature}`);
      }
    }
    return {
      version: 1,
      command: plan.command,
      terminal_command: terminalCommand,
      security_query: securityQuery,
      arguments: plan.arguments ?? [],
      actions: plan.actions.map(action => ({
        feature: String(action.feature).toLowerCase(),
        operation: String(action.operation).toLowerCase(),
        value: action.value
      }))
    };
  }

  function canonicalSecurityPrefix(value) {
    const tokens = String(value ?? "").trim().toUpperCase().split(/\s+/).filter(Boolean);
    if (tokens.length < 3) throw new Error("Godel did not return a complete security identifier");
    const assetAliases = { EQUITY: "EQ", STOCK: "EQ", EQUITIES: "EQ", STOCKS: "EQ" };
    const assetClass = assetAliases[tokens.at(-1)] ?? tokens.at(-1);
    const venue = tokens.at(-2);
    const identifier = tokens.slice(0, -2).join(" ");
    if (!/^[A-Z0-9][A-Z0-9.\-/ ]{0,48}$/.test(identifier)) throw new Error("Godel returned an invalid security identifier");
    if (!/^[A-Z0-9]{1,10}$/.test(venue)) throw new Error("Godel returned an invalid venue");
    if (!/^[A-Z]{2,8}$/.test(assetClass)) throw new Error("Godel returned an invalid asset class");
    return `${identifier} ${venue} ${assetClass}`;
  }

  return { PREFIX, parseMarker, validatePlan, canonicalSecurityPrefix };
});
