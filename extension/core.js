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
    if (typeof plan.terminal_command !== "string" || !plan.terminal_command.trim()) throw new Error("Missing terminal command");
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
      terminal_command: plan.terminal_command.trim(),
      actions: plan.actions.map(action => ({
        feature: String(action.feature).toLowerCase(),
        operation: String(action.operation).toLowerCase(),
        value: action.value
      }))
    };
  }

  return { PREFIX, parseMarker, validatePlan };
});
