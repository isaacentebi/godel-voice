import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeControlFollowup } from "./control-followup.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function recentExecutorContext(maxAgeMs = 15_000) {
  const candidates = [path.join(projectDir, ".godel-voice-queue.json")];
  if (process.platform === "darwin") candidates.unshift(path.join(os.homedir(), "Library", "Application Support", "GodelVoice", ".godel-voice-queue.json"));
  for (const candidate of candidates) {
    try {
      const state = JSON.parse(fs.readFileSync(candidate, "utf8"));
      const context = state?.context;
      if (context && Number.isFinite(context.updated_at) && Date.now() - context.updated_at <= maxAgeMs) return context;
    } catch { /* Try the portable project-local state next. */ }
  }
  return null;
}

const transcript = fs.readFileSync(0, "utf8").trim();
const marker = encodeControlFollowup(transcript, recentExecutorContext());
if (!marker) process.exitCode = 1;
else process.stdout.write(marker);
