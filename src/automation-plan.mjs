import { renderTerminalCommand, validateIntent } from "./compiler.mjs";

export const PLAN_PREFIX = "GV1:";
export const AUTOMATED_COMMANDS = new Set(["HMS", "GR", "GF"]);

export function buildAutomationPlan(intent) {
  const checked = validateIntent(structuredClone(intent));
  if (!checked.ok) throw new Error(checked.errors.join("; "));
  if (checked.intent.kind !== "execute") throw new Error(`Cannot execute intent kind: ${checked.intent.kind}`);

  const terminalCommand = renderTerminalCommand(checked.intent);
  if (!terminalCommand) throw new Error("Intent cannot be rendered yet");
  const actions = checked.intent.post_open_actions ?? [];
  if (actions.length && !AUTOMATED_COMMANDS.has(checked.intent.command)) {
    throw new Error(`UI automation is not allowlisted for ${checked.intent.command}`);
  }

  return {
    version: 1,
    command: checked.intent.command,
    terminal_command: terminalCommand,
    actions
  };
}

export function encodeAutomationMarker(intent) {
  return PLAN_PREFIX + JSON.stringify(buildAutomationPlan(intent));
}
