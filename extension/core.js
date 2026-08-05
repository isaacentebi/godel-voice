(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GodelVoiceCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PREFIX = "GV1:";
  const WORKFLOW_PREFIX = "GV2:";
  const COMMANDS = new Set("DES FA ERN EM SI GR ANR DVD QM FOCUS TAS HCP WEI WEIF IMAP HMAP GLCO FX MOST HDS N TOP TREND HALT ALLQ SECF WJI EQS OMON OVME CALC BROK AUM G HMS HP CF IPO TRAN HELP CHAT ACM PDF AL NOTE ENT CHANGE Q RES MAP CITADEL PAT PRT HLDR MOSO GF KELLY NI ERR".split(" "));
  const AUTOMATED = new Set(["G", "HMS", "GR", "GF", "HALT", "HMAP", "IMAP", "EM", "MOST", "HDS", "EQS", "SECF", "OMON", "N", "TRAN"]);
  const CONTROL_OPERATIONS = new Set(["move", "resize", "maximize", "restore", "focus", "close", "export"]);
  const CONTROL_TARGET_MODES = new Set(["last", "focused", "command"]);
  const PLACEMENTS = new Set(["full", "left", "right", "top", "bottom", "top-left", "top-right", "bottom-left", "bottom-right"]);
  const EQS_RANGE_FIELDS = Object.freeze([
    "Market Cap (USD)", "P/E (Fwd)", "P/E (TTM)", "P/S (Fwd)", "P/S (TTM)",
    "P/B (Fwd)", "P/B (TTM)", "P/CF (Fwd)", "P/CF (TTM)", "EPS (Fwd 12mo)",
    "Rev. (TTM, USD)", "Rev. (Fwd 12mo, USD)",
    "Net Inc. (TTM, USD)", "Net Inc. (Fwd 12mo, USD)"
  ]);
  const EQS_LIVE_LIST_VALUES = Object.freeze({
    Currency: Object.freeze(["USD"]),
    "HQ Country": Object.freeze(["United States"]),
    Sector: Object.freeze(["Technology"])
  });
  const EM_VALUATION_ROWS = new Set(["P/E", "P/B", "P/S", "P/CF", "EV/EBITDA", "EV/Sales", "EV/CF", "EV/FCF", "Dividend Yield"]);
  const FEATURES = {
    G: new Set(["resolution"]),
    HMS: new Set(["add/remove securities", "timeframe", "metric", "normalize/overlay/side-by-side"]),
    GR: new Set(["buy leg", "sell leg", "period", "correlation toggle", "correlation window", "regression toggle", "full/filtered data"]),
    GF: new Set(["periodicity", "range", "display currency", "include consensus estimates", "layout", "add company", "add metric", "ratio metric", "margin metric", "style", "axis", "scale", "transform"]),
    HALT: new Set(["tab"]),
    HMAP: new Set(["universe", "view"]),
    IMAP: new Set(["index", "view"]),
    EM: new Set(["metric", "valuation"]),
    MOST: new Set(["results"]),
    HDS: new Set(["view"]),
    EQS: new Set(["screen", "range_filter", "list_filter"]),
    SECF: new Set(["search"]),
    OMON: new Set(["strike depth"]),
    N: new Set(["query"]),
    TRAN: new Set(["research"])
  };

  function normalizeTRANResearchValue(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("TRAN research value must be an object");
    const keys = Object.keys(raw);
    if (keys.length !== 3 || keys.some(key => !["periods", "topics", "question"].includes(key))) {
      throw new Error("TRAN research value requires exactly periods, topics and question");
    }
    if (!Number.isInteger(raw.periods) || raw.periods < 1 || raw.periods > 8) {
      throw new Error("TRAN research periods must be an integer from 1 to 8");
    }
    if (!Array.isArray(raw.topics) || raw.topics.length < 1 || raw.topics.length > 5) {
      throw new Error("TRAN research requires 1 to 5 topics");
    }
    const topics = raw.topics.map(topic => typeof topic === "string" ? topic.replace(/\s+/g, " ").trim() : "");
    if (topics.some(topic => !topic || topic.length > 80 || /[\r\n\u0000-\u001f\u007f]/.test(topic))) {
      throw new Error("TRAN research topics must be 1 to 80 printable characters");
    }
    if (new Set(topics.map(topic => topic.toLowerCase())).size !== topics.length || topics.join(" ").length > 240) {
      throw new Error("TRAN research topics must be unique and bounded");
    }
    const question = typeof raw.question === "string" ? raw.question.replace(/\s+/g, " ").trim() : "";
    if (!question || question.length > 300 || /[\r\n\u0000-\u001f\u007f]/.test(question)) {
      throw new Error("TRAN research question must be 1 to 300 printable characters");
    }
    return { periods: raw.periods, topics, question };
  }

  function normalizeEQSRangeValue(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("EQS range value must be an object");
    const keys = Object.keys(raw);
    if (keys.some(key => !["field", "minimum", "maximum"].includes(key)) || !["field", "minimum", "maximum"].every(key => keys.includes(key))) {
      throw new Error("EQS range value requires exactly field, minimum and maximum");
    }
    const field = EQS_RANGE_FIELDS.find(candidate => candidate.toLowerCase() === String(raw.field ?? "").trim().toLowerCase());
    if (!field) throw new Error("Unsupported EQS range field");
    const minimum = raw.minimum;
    const maximum = raw.maximum;
    for (const [name, bound] of [["minimum", minimum], ["maximum", maximum]]) {
      if (bound !== null && (typeof bound !== "number" || !Number.isFinite(bound))) throw new Error(`EQS range ${name} must be a finite number or null`);
    }
    if (minimum === null && maximum === null) throw new Error("EQS range requires a minimum or maximum");
    if (minimum !== null && maximum !== null && minimum > maximum) throw new Error("EQS range minimum cannot exceed maximum");
    return { field, minimum, maximum };
  }

  function normalizeEQSLiveListValue(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("EQS list value must be an object");
    const keys = Object.keys(raw);
    if (keys.some(key => !["field", "items"].includes(key)) || !["field", "items"].every(key => keys.includes(key))) {
      throw new Error("EQS list value requires exactly field and items");
    }
    const field = Object.keys(EQS_LIVE_LIST_VALUES).find(candidate => candidate.toLowerCase() === String(raw.field ?? "").trim().toLowerCase());
    if (!field || !Array.isArray(raw.items) || raw.items.length !== 1 || typeof raw.items[0] !== "string") {
      throw new Error("Unsupported EQS live list value");
    }
    const item = EQS_LIVE_LIST_VALUES[field].find(candidate => candidate.toLowerCase() === raw.items[0].trim().toLowerCase());
    if (!item) throw new Error("Unsupported EQS live list value");
    return { field, items: [item] };
  }

  function normalizeSECFLiveValue(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("SECF value must be an object");
    const keys = Object.keys(raw);
    const allowed = ["query", "tab", "max", "venues", "countries", "hide_no_trade"];
    if (keys.some(key => !allowed.includes(key)) || !allowed.every(key => keys.includes(key))) throw new Error("Invalid SECF value shape");
    const query = typeof raw.query === "string" ? raw.query.replace(/\s+/g, " ").trim() : null;
    if (query == null || query.length > 200 || /[\r\n\u0000-\u001f\u007f]/.test(query)) throw new Error("Invalid SECF query");
    if (String(raw.tab).trim().toLowerCase() !== "people") throw new Error("Only the live-proven SECF People tab is enabled");
    const max = Number(raw.max);
    if (![50, 100, 250, 500].includes(max)) throw new Error("Unsupported SECF max");
    if (!Array.isArray(raw.venues) || raw.venues.length || !Array.isArray(raw.countries) || raw.countries.length || raw.hide_no_trade !== false) {
      throw new Error("SECF People does not support venue, country, or no-trade filters");
    }
    return { query, tab: "People", max, venues: [], countries: [], hide_no_trade: false };
  }

  function normalizeEMValuationValue(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("EM valuation value must be an object");
    const keys = Object.keys(raw);
    if (keys.length !== 3 || keys.some(key => !["row", "section", "semantic_unit"].includes(key))) {
      throw new Error("EM valuation value requires exactly row, section and semantic_unit");
    }
    const row = [...EM_VALUATION_ROWS].find(candidate => candidate.toLowerCase() === String(raw.row ?? "").trim().toLowerCase());
    if (!row || raw.section !== "Multiples") throw new Error("Unsupported EM valuation row or section");
    const expectedUnit = row === "Dividend Yield" ? "Percent" : "Multiple";
    if (raw.semantic_unit !== expectedUnit) throw new Error(`EM ${row} must use ${expectedUnit} semantics`);
    return { row, section: "Multiples", semantic_unit: expectedUnit };
  }

  function parseMarker(text) {
    const value = String(text ?? "").trim();
    if (value.startsWith(PREFIX)) return validatePlan(JSON.parse(value.slice(PREFIX.length)));
    if (value.startsWith(WORKFLOW_PREFIX)) return validateWorkflowPlan(JSON.parse(value.slice(WORKFLOW_PREFIX.length)));
    return null;
  }

  function validateWorkflowPlan(plan) {
    if (!plan || plan.version !== 2) throw new Error("Unsupported Godel workflow plan version");
    if (!["stop_on_any", "stop_on_required", "continue"].includes(plan.failure_policy)) throw new Error("Invalid workflow failure policy");
    if (!Array.isArray(plan.steps) || plan.steps.length < 1 || plan.steps.length > 16) throw new Error("Invalid workflow steps");
    const layout = plan.layout ?? {};
    const preset = String(layout.preset ?? "grid").toLowerCase();
    if (!["research", "market", "comparison", "options", "grid", "focus"].includes(preset)) throw new Error("Invalid workflow layout preset");
    if (layout.preserve_existing != null && typeof layout.preserve_existing !== "boolean") throw new Error("Invalid preserve_existing");
    if (layout.new_screen != null && typeof layout.new_screen !== "boolean") throw new Error("Invalid new_screen");
    const ids = new Set();
    const steps = plan.steps.map((step, index) => {
      const id = String(step?.id ?? "").trim();
      if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id) || ids.has(id)) throw new Error(`Invalid workflow step id at ${index + 1}`);
      ids.add(id);
      const kind = step.kind ?? "command";
      if (kind === "configure") {
        const mode = String(step.target?.mode ?? "last").toLowerCase();
        if (!CONTROL_TARGET_MODES.has(mode)) throw new Error(`Invalid configure target for ${id}`);
        const targetCommand = String(step.target?.command ?? "").toUpperCase();
        const targetSecurity = step.target?.security == null ? null : String(step.target.security).toUpperCase();
        if (!AUTOMATED.has(targetCommand)) throw new Error(`Automation is not enabled for ${targetCommand || "configure target"}`);
        if (targetSecurity != null && !/^[A-Z0-9][A-Z0-9.-]{0,23}$/.test(targetSecurity)) throw new Error(`Invalid configure security for ${id}`);
        const validated = validatePlan({
          version: 1, command: targetCommand,
          terminal_command: `${targetSecurity ?? "CONTEXT"} EQ ${targetCommand}`,
          security_query: null, arguments: [], actions: step.actions
        });
        const required = step.required !== false;
        const failurePolicy = String(step.failure_policy ?? (required ? "stop" : "continue"));
        if (!new Set(["stop", "continue"]).has(failurePolicy)) throw new Error(`Invalid failure policy for ${id}`);
        return {
          id, kind: "configure", target: { mode, command: targetCommand, security: targetSecurity },
          actions: validated.actions, required, failure_policy: failurePolicy
        };
      }
      if (kind === "control") {
        const operation = String(step.operation ?? "").toLowerCase();
        if (!CONTROL_OPERATIONS.has(operation)) throw new Error(`Unsupported control operation for ${id}`);
        const mode = String(step.target?.mode ?? "last").toLowerCase();
        if (!CONTROL_TARGET_MODES.has(mode)) throw new Error(`Invalid control target for ${id}`);
        const targetCommand = step.target?.command == null ? null : String(step.target.command).toUpperCase();
        const targetSecurity = step.target?.security == null ? null : String(step.target.security).toUpperCase();
        if (mode === "command" && (!targetCommand || !COMMANDS.has(targetCommand))) throw new Error(`Control ${id} requires a known command`);
        if (mode !== "command" && targetCommand != null) throw new Error(`Control ${id} has an unexpected command target`);
        if (mode !== "command" && targetSecurity != null) throw new Error(`Control ${id} has an unexpected security target`);
        if (targetSecurity != null && !/^[A-Z0-9][A-Z0-9.-]{0,23}$/.test(targetSecurity)) throw new Error(`Invalid control security for ${id}`);
        const value = step.value ?? null;
        if (!['string', 'number', 'boolean'].includes(typeof value) && value !== null) throw new Error(`Invalid control value for ${id}`);
        if (operation === "move" && !PLACEMENTS.has(String(value).toLowerCase())) throw new Error(`Invalid move value for ${id}`);
        if (operation === "resize" && !["larger", "smaller"].includes(String(value).toLowerCase())) throw new Error(`Invalid resize value for ${id}`);
        if (!["move", "resize"].includes(operation) && value !== null) throw new Error(`Control ${id} does not use a value`);
        const required = step.required !== false;
        const failurePolicy = String(step.failure_policy ?? (required ? "stop" : "continue"));
        if (!new Set(["stop", "continue"]).has(failurePolicy)) throw new Error(`Invalid failure policy for ${id}`);
        return {
          id, kind: "control", operation,
          target: { mode, command: targetCommand, security: targetSecurity },
          value: typeof value === "string" ? value.toLowerCase() : value,
          required, failure_policy: failurePolicy
        };
      }
      if (kind !== "command") throw new Error(`Unsupported workflow step kind for ${id}`);
      const command = validatePlan({
        version: 1,
        command: step.command,
        terminal_command: step.terminal_command,
        security_query: step.security_query,
        arguments: step.arguments,
        actions: step.actions
      });
      const required = step.required !== false;
      const failurePolicy = String(step.failure_policy ?? (required ? "stop" : "continue"));
      if (!new Set(["stop", "continue"]).has(failurePolicy)) throw new Error(`Invalid failure policy for ${id}`);
      const placement = step.layout?.placement == null ? null : String(step.layout.placement).toLowerCase();
      if (placement && !PLACEMENTS.has(placement)) {
        throw new Error(`Invalid placement for ${id}`);
      }
      return { ...command, id, kind: "command", required, failure_policy: failurePolicy, layout: { placement } };
    });
    return {
      version: 2,
      failure_policy: plan.failure_policy,
      layout: {
        preset,
        preserve_existing: layout.preserve_existing === true,
        new_screen: layout.new_screen === true,
        gap_px: Number.isInteger(layout.gap_px) ? layout.gap_px : 12
      },
      steps
    };
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
      const operation = String(action?.operation ?? "").trim().toLowerCase();
      if (!operation) throw new Error(`Missing operation for ${feature}`);
      const eqsRangeFeature = plan.command === "EQS" && feature === "range_filter";
      const eqsListFeature = plan.command === "EQS" && feature === "list_filter";
      const secfFeature = plan.command === "SECF" && feature === "search";
      const gFeature = plan.command === "G" && feature === "resolution";
      const emValuationFeature = plan.command === "EM" && feature === "valuation";
      const tranResearchFeature = plan.command === "TRAN" && feature === "research";
      if (eqsRangeFeature && operation !== "add") throw new Error("EQS range filters require add");
      const eqsRange = eqsRangeFeature && operation === "add";
      if (!eqsRange && !eqsListFeature && !secfFeature && !emValuationFeature && !tranResearchFeature && !["string", "number", "boolean"].includes(typeof action.value) && action.value !== null) {
        throw new Error(`Invalid value for ${feature}`);
      }
      if (gFeature) {
        if (operation !== "select" || String(action.value).trim().toLowerCase() !== "1h") {
          throw new Error("G live executor permits only the independently proven 1h contextual resolution");
        }
      } else if (plan.command === "HALT") {
        if (feature !== "tab" || operation !== "select") throw new Error("HALT only supports selecting a tab");
        if (!["all", "active", "resumed"].includes(String(action.value).trim().toLowerCase())) throw new Error("Unsupported HALT tab");
      } else if (plan.command === "HMAP") {
        if (!["universe", "view"].includes(feature) || operation !== "select") throw new Error("HMAP currently supports only selecting an index universe or Map/Table view");
        const allowed = feature === "universe" ? ["s&p 500", "djia"] : ["map", "table"];
        if (!allowed.includes(String(action.value).trim().toLowerCase())) throw new Error(`Unsupported HMAP ${feature}`);
      } else if (plan.command === "IMAP") {
        if (operation !== "select" || !["index", "view"].includes(feature)) throw new Error("Unsupported IMAP action");
        const allowed = feature === "index" ? ["s&p 500", "djia"] : ["map", "table"];
        if (!allowed.includes(String(action.value).trim().toLowerCase())) throw new Error(`Unsupported IMAP ${feature}`);
      } else if (plan.command === "EM") {
        if (feature === "valuation") {
          if (operation !== "read") throw new Error("EM valuation requires read");
          normalizeEMValuationValue(action.value);
        } else if (feature !== "metric" || operation !== "select" || typeof action.value !== "string") {
          throw new Error("Unsupported EM action");
        }
      } else if (plan.command === "HDS") {
        if (feature !== "view" || operation !== "select") throw new Error("HDS only supports selecting a view");
        if (!["table", "treemap", "bubble"].includes(String(action.value).trim().toLowerCase())) throw new Error("Unsupported HDS view");
      } else if (plan.command === "EQS") {
        if (feature === "range_filter") {
          if (operation !== "add") throw new Error("EQS range filters require add");
          normalizeEQSRangeValue(action.value);
        } else if (feature === "list_filter") {
          if (operation !== "add") throw new Error("EQS list filters require add");
          normalizeEQSLiveListValue(action.value);
        } else if (feature !== "screen" || !["run", "clear"].includes(operation) || action.value != null) {
          throw new Error("Unsupported EQS action");
        }
      } else if (plan.command === "SECF") {
        if (feature !== "search" || operation !== "configure") throw new Error("Unsupported SECF action");
        normalizeSECFLiveValue(action.value);
      } else if (plan.command === "OMON") {
        if (feature !== "strike depth" || operation !== "set"
            || !Number.isInteger(Number(action.value)) || Number(action.value) < 1 || Number(action.value) > 100) {
          throw new Error("Unsupported OMON action");
        }
      } else if (plan.command === "N") {
        const query = String(action.value ?? "").replace(/\s+/g, " ").trim();
        if (feature !== "query" || operation !== "set" || !query || query.length > 200 || /[\r\n]/.test(query)) {
          throw new Error("News currently supports only setting a 1-200 character exact per-window query");
        }
      } else if (plan.command === "TRAN") {
        if (feature !== "research" || operation !== "summarize") throw new Error("TRAN supports only bounded read-only research");
        normalizeTRANResearchValue(action.value);
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
        value: plan.command === "G"
          ? "1h"
          : plan.command === "HALT"
          ? ({ all: "All", active: "Active", resumed: "Resumed" }[String(action.value).trim().toLowerCase()])
          : plan.command === "HMAP"
            ? (String(action.feature).toLowerCase() === "universe"
              ? ({ "s&p 500": "S&P 500", djia: "DJIA" }[String(action.value).trim().toLowerCase()])
              : ({ map: "Map", table: "Table" }[String(action.value).trim().toLowerCase()]))
            : plan.command === "IMAP" && String(action.feature).toLowerCase() === "index"
              ? ({ "s&p 500": "S&P 500", djia: "DJIA" }[String(action.value).trim().toLowerCase()])
            : plan.command === "IMAP" && String(action.feature).toLowerCase() === "view"
              ? ({ map: "Map", table: "Table" }[String(action.value).trim().toLowerCase()])
            : plan.command === "HDS"
              ? ({ table: "Table", treemap: "Treemap", bubble: "Bubble" }[String(action.value).trim().toLowerCase()])
            : plan.command === "EQS" && String(action.feature).toLowerCase() === "range_filter"
              ? normalizeEQSRangeValue(action.value)
            : plan.command === "EQS" && String(action.feature).toLowerCase() === "list_filter"
              ? normalizeEQSLiveListValue(action.value)
            : plan.command === "SECF"
              ? normalizeSECFLiveValue(action.value)
            : plan.command === "EM" && String(action.feature).toLowerCase() === "valuation"
              ? normalizeEMValuationValue(action.value)
            : plan.command === "OMON"
              ? Number(action.value)
            : plan.command === "TRAN"
              ? normalizeTRANResearchValue(action.value)
            : action.value
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

  return { PREFIX, WORKFLOW_PREFIX, parseMarker, validatePlan, validateWorkflowPlan, canonicalSecurityPrefix };
});
