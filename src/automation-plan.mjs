import { renderTerminalCommand, validateIntent } from "./compiler.mjs";
import { encodeWorkflowPlan, normalizeEQSRangeValue, validateWorkflowPlan } from "./workflow-plan.mjs";
import { assertMOSTUnboundActionDisabled, MOST_UNBOUND_FEATURES } from "./most-actions.mjs";
import { EQS_UNBOUND_FEATURES, normalizeEQSLiveDynamicAction } from "./eqs-actions.mjs";

export {
  WORKFLOW_PLAN_PREFIX,
  WORKFLOW_PLAN_VERSION,
  canonicalStringify,
  encodeWorkflowPlan,
  parseWorkflowMarker,
  validateWorkflowPlan
} from "./workflow-plan.mjs";

export const PLAN_PREFIX = "GV1:";
export const AUTOMATED_COMMANDS = new Set(["HMS", "GR", "GF", "HALT", "HMAP", "IMAP", "EM", "MOST", "HDS", "EQS", "N"]);

export function buildAutomationPlan(intent) {
  const checked = validateIntent(structuredClone(intent));
  if (!checked.ok) throw new Error(checked.errors.join("; "));
  if (checked.intent.kind !== "execute") throw new Error(`Cannot execute intent kind: ${checked.intent.kind}`);

  let terminalCommand = null;
  let securityQuery = null;
  try {
    terminalCommand = renderTerminalCommand(checked.intent);
  } catch (error) {
    const security = checked.intent.security;
    if (!security?.needs_resolution || !String(security.spoken_name ?? "").trim()) throw error;
    securityQuery = String(security.spoken_name).trim();
  }
  if (!terminalCommand && !securityQuery) throw new Error("Intent cannot be rendered or resolved");
  let actions = checked.intent.post_open_actions ?? [];
  if (actions.length && !AUTOMATED_COMMANDS.has(checked.intent.command)) {
    throw new Error(`UI automation is not allowlisted for ${checked.intent.command}`);
  }
  if (checked.intent.command === "HALT") {
    actions = actions.map(action => {
      if (String(action.feature).toLowerCase() !== "tab" || String(action.operation).toLowerCase() !== "select") {
        throw new Error("HALT only supports selecting a tab");
      }
      const canonical = { all: "All", active: "Active", resumed: "Resumed" }[String(action.value).trim().toLowerCase()];
      if (!canonical) throw new Error("Unsupported HALT tab");
      return { feature: "tab", operation: "select", value: canonical };
    });
  } else if (checked.intent.command === "HMAP") {
    actions = actions.map(action => {
      const feature = String(action.feature).toLowerCase();
      if (!["universe", "view"].includes(feature) || String(action.operation).toLowerCase() !== "select") {
        throw new Error("HMAP currently supports only selecting an index universe or Map/Table view");
      }
      const canonical = feature === "universe"
        ? { "s&p 500": "S&P 500", "sp 500": "S&P 500", "s p 500": "S&P 500", djia: "DJIA", dow: "DJIA" }[String(action.value).trim().toLowerCase()]
        : { map: "Map", table: "Table" }[String(action.value).trim().toLowerCase()];
      if (!canonical) throw new Error(`Unsupported HMAP ${feature}`);
      return { feature, operation: "select", value: canonical };
    });
  } else if (checked.intent.command === "IMAP") {
    actions = actions.map(action => {
      const feature = String(action.feature).toLowerCase();
      if (String(action.operation).toLowerCase() !== "select" || !["index", "view"].includes(feature)) {
        throw new Error("IMAP currently supports only selecting the index or Map/Table view");
      }
      const values = feature === "index"
        ? { "s&p 500": "S&P 500", "sp 500": "S&P 500", "s p 500": "S&P 500", djia: "DJIA", dow: "DJIA" }
        : { map: "Map", table: "Table" };
      const canonical = values[String(action.value).trim().toLowerCase()];
      if (!canonical) throw new Error(`Unsupported IMAP ${feature}`);
      return { feature, operation: "select", value: canonical };
    });
  } else if (checked.intent.command === "EM") {
    actions = actions.map(action => {
      if (String(action.feature).toLowerCase() !== "metric" || String(action.operation).toLowerCase() !== "select") {
        throw new Error("EM currently supports only selecting a metric");
      }
      const aliases = {
        sales: "Sales", revenue: "Sales", ebitda: "EBITDA", "net income": "Net Income",
        "net income (bfng)": "Net Income", eps: "EPS (GAAP)", "eps (gaap)": "EPS (GAAP)",
        "total assets": "Total Assets", "current assets": "Current Assets",
        "current liabilities": "Current Liabilities", "shareholder equity": "Shareholder Equity",
        cfo: "Cash Flow From Operations", "cash flow from operations": "Cash Flow From Operations",
        cfi: "Cash Flow From Investing", "cash flow from investing": "Cash Flow From Investing",
        cff: "Cash Flow From Financing", "cash flow from financing": "Cash Flow From Financing",
        "net revenue": "Net Revenue", "gross revenue": "Gross Revenue"
      };
      const canonical = aliases[String(action.value).trim().toLowerCase()];
      if (!canonical) throw new Error("Unsupported EM metric");
      return { feature: "metric", operation: "select", value: canonical };
    });
  } else if (checked.intent.command === "MOST") {
    actions = actions.map(action => {
      const feature = String(action.feature).toLowerCase().replace(/[ .-]+/g, "_");
      if (MOST_UNBOUND_FEATURES.includes(feature)) {
        return assertMOSTUnboundActionDisabled({ feature, operation: action.operation, value: action.value });
      }
      if (feature !== "results" || String(action.operation).toLowerCase() !== "select") {
        throw new Error("MOST currently supports only selecting result count");
      }
      const count = Number(action.value);
      if (![10, 25, 50, 100].includes(count)) throw new Error("Unsupported MOST result count");
      return { feature: "results", operation: "select", value: count };
    });
  } else if (checked.intent.command === "HDS") {
    actions = actions.map(action => {
      if (String(action.feature).toLowerCase() !== "view" || String(action.operation).toLowerCase() !== "select") {
        throw new Error("HDS currently supports only selecting Table, Treemap or Bubble view");
      }
      const canonical = { table: "Table", treemap: "Treemap", bubble: "Bubble" }[String(action.value).trim().toLowerCase()];
      if (!canonical) throw new Error("Unsupported HDS view");
      return { feature: "view", operation: "select", value: canonical };
    });
  } else if (checked.intent.command === "EQS") {
    actions = actions.map(action => {
      const feature = String(action.feature).trim().toLowerCase().replace(/[ .-]+/g, "_");
      const operation = String(action.operation).trim().toLowerCase();
      if (EQS_UNBOUND_FEATURES.includes(feature)) {
        return normalizeEQSLiveDynamicAction({ feature, operation, value: action.value });
      }
      if (feature === "range_filter") {
        if (operation !== "add") throw new Error("EQS range filters require add");
        return { feature, operation, value: normalizeEQSRangeValue(action.value) };
      }
      if (feature !== "screen" || !["run", "clear"].includes(operation) || action.value != null) {
        throw new Error("EQS supports only structured range_filter.add or Run/Clear screen actions");
      }
      return { feature: "screen", operation, value: null };
    });
  } else if (checked.intent.command === "N") {
    actions = actions.map(action => {
      const feature = String(action.feature ?? "").trim().toLowerCase();
      const operation = String(action.operation ?? "").trim().toLowerCase();
      const query = String(action.value ?? "").replace(/\s+/g, " ").trim();
      if (feature !== "query" || operation !== "set" || !query || query.length > 200 || /[\r\n]/.test(query)) {
        throw new Error("News currently supports only setting a 1-200 character exact per-window query");
      }
      return { feature, operation, value: query };
    });
  }

  return {
    version: 1,
    command: checked.intent.command,
    terminal_command: terminalCommand,
    security_query: securityQuery,
    arguments: checked.intent.arguments ?? [],
    actions
  };
}

export function encodeAutomationMarker(intent) {
  return PLAN_PREFIX + JSON.stringify(buildAutomationPlan(intent));
}

function workflowRequest(request) {
  if (request?.intent) return request;
  return { intent: request };
}

/**
 * Compile one or more existing voice intents into an ordered GV2 workflow.
 * A request may be an intent or { intent, required, failure_policy, layout }.
 * GV1 compilation remains the authority for each individual command step.
 */
export function buildWorkflowPlan(requests, options = {}) {
  const source = Array.isArray(requests) ? requests : [requests];
  if (!source.length) throw new Error("Workflow requires at least one intent");
  const failurePolicy = options.failure_policy ?? "stop_on_required";
  const steps = source.map((item, index) => {
    if (item?.kind === "configure") {
      return {
        id: item.id ?? `configure-${index + 1}`,
        kind: "configure",
        target: item.target,
        actions: item.actions,
        required: item.required ?? true,
        failure_policy: item.failure_policy
      };
    }
    if (item?.kind === "control") {
      return {
        id: item.id ?? `control-${index + 1}`,
        kind: "control",
        operation: item.operation,
        target: item.target,
        value: item.value ?? null,
        required: item.required ?? true,
        failure_policy: item.failure_policy
      };
    }
    const request = workflowRequest(item);
    const v1 = buildAutomationPlan(request.intent);
    return {
      id: request.id ?? `step-${index + 1}`,
      kind: "command",
      command: v1.command,
      terminal_command: v1.terminal_command,
      security_query: v1.security_query,
      arguments: v1.arguments,
      actions: v1.actions,
      required: request.required ?? true,
      failure_policy: request.failure_policy,
      layout: request.layout ?? null
    };
  });
  return validateWorkflowPlan({
    version: 2,
    failure_policy: failurePolicy,
    layout: options.layout ?? null,
    steps
  });
}

export function encodeWorkflowMarker(requests, options = {}) {
  return encodeWorkflowPlan(buildWorkflowPlan(requests, options));
}
