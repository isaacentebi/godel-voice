import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ElevenLabsCompletionVoice, completionVoiceFromEnvironment, normalizeFinancialSpeech, sanitizeCompletionMessage } from "../src/completion-voice.mjs";

test("completion messages are single-line and bounded", () => {
  const message = sanitizeCompletionMessage(`  Done.\n\n${"Meta ".repeat(80)} `);
  assert.equal(message.includes("\n"), false);
  assert.equal(message.length, 240);
});

test("financial facts are normalized for low-latency speech", () => {
  assert.equal(
    normalizeFinancialSpeech("Amazon's Next 4Q P/E is 30.0x, up 6.55% at $593.20."),
    "Amazon's next four quarters P E is 30 point 0 times, up 6 point 5 5 percent at 593 point 2 0 dollars."
  );
  assert.equal(normalizeFinancialSpeech("Backlog reached $496 billion."), "Backlog reached 496 billion dollars.");
  assert.equal(normalizeFinancialSpeech("Revenue was $200.6 billion."), "Revenue was 200 point 6 billion dollars.");
});

test("premium voice is opt-in and validates its local credentials", () => {
  assert.equal(completionVoiceFromEnvironment({}), null);
  assert.throws(
    () => completionVoiceFromEnvironment({ GODEL_VOICE_TTS_PROVIDER: "elevenlabs" }),
    /ELEVENLABS_API_KEY/
  );
  const voice = completionVoiceFromEnvironment({
    GODEL_VOICE_TTS_PROVIDER: "elevenlabs",
    ELEVENLABS_API_KEY: "test-key",
    ELEVENLABS_VOICE_ID: "test-voice"
  });
  assert.equal(voice.modelId, "eleven_flash_v2_5");
});

test("premium voice caches identical short responses without storing credentials", async () => {
  const cacheDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "godel-voice-cache-test-"));
  let requests = 0;
  let plays = 0;
  const voice = new ElevenLabsCompletionVoice({
    apiKey: "private-test-key",
    voiceId: "jarvis-test",
    cacheDirectory,
    streamPlayer: null,
    fetchImpl: async () => {
      requests += 1;
      return { ok: true, arrayBuffer: async () => Buffer.from("audio") };
    },
    spawnProcess: () => {
      plays += 1;
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("exit", 0));
      return child;
    }
  });
  try {
    await voice.speak("Ready.", "one");
    await voice.speak("Ready.", "two");
    assert.equal(requests, 1);
    assert.equal(plays, 2);
    const names = fs.readdirSync(cacheDirectory);
    assert.equal(names.length, 1);
    assert.match(names[0], /^[a-f0-9]{64}\.mp3$/);
    assert.equal(names[0].includes("private-test-key"), false);
  } finally {
    fs.rmSync(cacheDirectory, { recursive: true, force: true });
  }
});
