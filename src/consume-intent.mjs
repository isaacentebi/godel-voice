import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { renderTerminalCommand, validateIntent } from "./compiler.mjs";
import { encodeAutomationMarker } from "./automation-plan.mjs";

export function parseEnhancedIntent(text) {
  const trimmed = String(text).trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const intent = JSON.parse(unfenced);
  const checked = validateIntent(intent);
  if (!checked.ok) throw new Error(checked.errors.join("; "));
  return checked.intent;
}

export function consumeEnhancedIntent(text) {
  const intent = parseEnhancedIntent(text);
  return { intent, terminalCommand: renderTerminalCommand(intent) };
}

function main() {
  const markerMode = process.argv.includes("--marker");
  const args = process.argv.slice(2).filter(value => value !== "--marker");
  const input = args.join(" ") || fs.readFileSync(0, "utf8");
  const result = consumeEnhancedIntent(input);
  process.stdout.write(markerMode
    ? encodeAutomationMarker(result.intent)
    : JSON.stringify(result, null, 2) + "\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
