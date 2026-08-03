import { renderTerminalCommand, validateIntent } from "./compiler.mjs";

export const PLAN_PREFIX = "GV1:";
export const AUTOMATED_COMMANDS = new Set(["HMS", "GR", "GF"]);

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
  const actions = checked.intent.post_open_actions ?? [];
  if (actions.length && !AUTOMATED_COMMANDS.has(checked.intent.command)) {
    throw new Error(`UI automation is not allowlisted for ${checked.intent.command}`);
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
