import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultProjectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function readRecentExecutorContext({
  maxAgeMs = 15_000,
  projectDir = defaultProjectDir,
  platform = process.platform,
  homeDir = os.homedir(),
  now = Date.now()
} = {}) {
  const candidates = [path.join(projectDir, ".godel-voice-queue.json")];
  if (platform === "darwin") {
    candidates.unshift(path.join(homeDir, "Library", "Application Support", "GodelVoice", ".godel-voice-queue.json"));
  }

  for (const candidate of candidates) {
    try {
      const state = JSON.parse(fs.readFileSync(candidate, "utf8"));
      const context = state?.context;
      if (context && Number.isFinite(context.updated_at) && now - context.updated_at <= maxAgeMs) return context;
    } catch {
      // Missing or malformed state is ignored so the portable fallback can be tried.
    }
  }

  return null;
}
