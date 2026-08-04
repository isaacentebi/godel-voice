import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export function sanitizeCompletionMessage(value) {
  return String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function spokenDecimal(value) {
  const [whole, fraction] = String(value).replaceAll(",", "").split(".");
  return fraction ? `${whole} point ${fraction.split("").join(" ")}` : whole;
}

export function normalizeFinancialSpeech(value) {
  return sanitizeCompletionMessage(value)
    .replace(/\bNext 4Q\b/gi, "next four quarters")
    .replace(/\bP\s*\/\s*E\b/gi, "P E")
    .replace(/\$([0-9][0-9,]*(?:\.[0-9]+)?)\s*(thousand|million|billion|trillion)?/gi,
      (_, number, scale) => `${spokenDecimal(number)}${scale ? ` ${scale.toLowerCase()}` : ""} dollars`)
    .replace(/([0-9][0-9,]*(?:\.[0-9]+)?)%/g, (_, number) => `${spokenDecimal(number)} percent`)
    .replace(/([0-9][0-9,]*(?:\.[0-9]+)?)\s*[x×]\b/gi, (_, number) => `${spokenDecimal(number)} times`);
}

function playFile(file, spawnProcess = spawn) {
  return new Promise((resolve, reject) => {
    const player = spawnProcess("/usr/bin/afplay", [file], { stdio: "ignore" });
    player.once("error", reject);
    player.once("exit", code => code === 0 ? resolve() : reject(new Error(`afplay exited with ${code}`)));
  });
}

function defaultStreamPlayer() {
  if (process.platform !== "darwin") return null;
  for (const candidate of ["/opt/homebrew/bin/mpg123", "/usr/local/bin/mpg123"]) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {}
  }
  return null;
}

function waitForExit(child, label) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`${label} exited with ${code}`)));
  });
}

async function writeChunk(stream, chunk) {
  if (stream.write(chunk)) return;
  await new Promise((resolve, reject) => {
    stream.once("drain", resolve);
    stream.once("error", reject);
  });
}

function defaultCacheDirectory() {
  return process.platform === "darwin"
    ? path.join(os.homedir(), "Library", "Caches", "GodelVoice", "tts")
    : path.join(os.tmpdir(), "godel-voice-tts-cache");
}

export class ElevenLabsCompletionVoice {
  constructor({
    apiKey,
    voiceId,
    modelId = "eleven_flash_v2_5",
    outputFormat = "mp3_44100_128",
    fetchImpl = fetch,
    spawnProcess = spawn,
    cacheDirectory = defaultCacheDirectory(),
    maxCacheEntries = 96,
    streamPlayer = defaultStreamPlayer()
  } = {}) {
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY is required");
    if (!voiceId) throw new Error("ELEVENLABS_VOICE_ID is required");
    this.apiKey = apiKey;
    this.voiceId = voiceId;
    this.modelId = modelId;
    this.outputFormat = outputFormat;
    this.fetchImpl = fetchImpl;
    this.spawnProcess = spawnProcess;
    this.cacheDirectory = cacheDirectory;
    this.maxCacheEntries = Math.max(8, Number(maxCacheEntries) || 96);
    this.streamPlayer = streamPlayer;
    this.queue = Promise.resolve();
  }

  speak(message, workflowId = crypto.randomUUID()) {
    const text = normalizeFinancialSpeech(message);
    if (!text) return Promise.resolve();
    const task = this.queue.then(() => this.generateAndPlay(text, workflowId));
    this.queue = task.catch(() => {});
    return task;
  }

  async generateAndPlay(text, workflowId) {
    const cacheKey = crypto.createHash("sha256")
      .update(JSON.stringify([this.voiceId, this.modelId, this.outputFormat, text]))
      .digest("hex");
    fs.mkdirSync(this.cacheDirectory, { recursive: true, mode: 0o700 });
    const cachedFile = path.join(this.cacheDirectory, `${cacheKey}.mp3`);
    try {
      if (fs.statSync(cachedFile).size > 0) {
        const now = new Date();
        fs.utimesSync(cachedFile, now, now);
        return await playFile(cachedFile, this.spawnProcess);
      }
    } catch {}

    const response = await this.fetchImpl(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(this.voiceId)}/stream?output_format=${encodeURIComponent(this.outputFormat)}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg"
        },
        body: JSON.stringify({ text, model_id: this.modelId, apply_text_normalization: "auto" }),
        signal: AbortSignal.timeout(12_000)
      }
    );
    if (!response.ok) throw new Error(`ElevenLabs returned ${response.status}`);
    let audio;
    let playback = null;
    if (this.streamPlayer && response.body) {
      const player = this.spawnProcess(this.streamPlayer, ["-q", "-"], {
        stdio: ["pipe", "ignore", "ignore"]
      });
      playback = waitForExit(player, "stream player");
      const chunks = [];
      for await (const value of response.body) {
        const chunk = Buffer.from(value);
        if (!chunk.length) continue;
        chunks.push(chunk);
        await writeChunk(player.stdin, chunk);
      }
      player.stdin.end();
      audio = Buffer.concat(chunks);
    } else {
      audio = Buffer.from(await response.arrayBuffer());
    }
    if (!audio.length) throw new Error("ElevenLabs returned empty audio");
    const safeId = String(workflowId).replace(/[^a-z0-9_-]/gi, "").slice(0, 64) || crypto.randomUUID();
    const temporaryFile = path.join(this.cacheDirectory, `.${safeId}.tmp`);
    fs.writeFileSync(temporaryFile, audio, { mode: 0o600 });
    fs.renameSync(temporaryFile, cachedFile);
    fs.chmodSync(cachedFile, 0o600);
    this.pruneCache();
    if (playback) await playback;
    else await playFile(cachedFile, this.spawnProcess);
  }

  pruneCache() {
    let files = [];
    try {
      files = fs.readdirSync(this.cacheDirectory)
        .filter(name => /^[a-f0-9]{64}\.mp3$/.test(name))
        .map(name => {
          const file = path.join(this.cacheDirectory, name);
          return { file, modified: fs.statSync(file).mtimeMs };
        })
        .sort((a, b) => b.modified - a.modified);
    } catch { return; }
    for (const item of files.slice(this.maxCacheEntries)) {
      try { fs.unlinkSync(item.file); } catch {}
    }
  }
}

export function completionVoiceFromEnvironment(environment = process.env) {
  if (String(environment.GODEL_VOICE_TTS_PROVIDER ?? "").toLowerCase() !== "elevenlabs") return null;
  return new ElevenLabsCompletionVoice({
    apiKey: environment.ELEVENLABS_API_KEY,
    voiceId: environment.ELEVENLABS_VOICE_ID,
    modelId: environment.ELEVENLABS_MODEL_ID || "eleven_flash_v2_5",
    outputFormat: environment.ELEVENLABS_OUTPUT_FORMAT || "mp3_22050_32",
    cacheDirectory: environment.GODEL_VOICE_TTS_CACHE_DIR || defaultCacheDirectory(),
    maxCacheEntries: environment.GODEL_VOICE_TTS_CACHE_ENTRIES || 96
  });
}
