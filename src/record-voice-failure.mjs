import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const enabled = String(process.env.GODEL_VOICE_LEARN_FAILURES ?? "").toLowerCase() === "true";
if (enabled) {
  const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const destination = process.env.GODEL_VOICE_FAILURE_PATH || path.join(projectDir, ".godel-voice-failures.jsonl");
  const input = fs.readFileSync(0, "utf8")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500)
    .replace(/\bsk-(?:or-v1-)?[A-Za-z0-9_-]{12,}\b/g, "[redacted-key]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[redacted-number]");
  if (input) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    let lines = [];
    try { lines = fs.readFileSync(destination, "utf8").split("\n").filter(Boolean).slice(-199); } catch {}
    lines.push(JSON.stringify({ at: new Date().toISOString(), transcript: input, resolved: false }));
    fs.writeFileSync(destination, `${lines.join("\n")}\n`, { mode: 0o600 });
    fs.chmodSync(destination, 0o600);
  }
}
