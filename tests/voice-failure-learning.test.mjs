import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("failed phrase learning is opt-in, bounded, private, and redacts keys", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "godel-voice-failure-test-"));
  const destination = path.join(directory, "failures.jsonl");
  try {
    const disabled = spawnSync(process.execPath, ["src/record-voice-failure.mjs"], {
      cwd: path.resolve(import.meta.dirname, ".."), input: "open something", encoding: "utf8",
      env: { ...process.env, GODEL_VOICE_FAILURE_PATH: destination, GODEL_VOICE_LEARN_FAILURES: "false" }
    });
    assert.equal(disabled.status, 0);
    assert.equal(fs.existsSync(destination), false);

    const fakeKey = ["sk", "or", "v1", "abcdefghijklmnop"].join("-");
    const enabled = spawnSync(process.execPath, ["src/record-voice-failure.mjs"], {
      cwd: path.resolve(import.meta.dirname, ".."), input: `open thing with ${fakeKey}`, encoding: "utf8",
      env: { ...process.env, GODEL_VOICE_FAILURE_PATH: destination, GODEL_VOICE_LEARN_FAILURES: "true" }
    });
    assert.equal(enabled.status, 0);
    const stored = fs.readFileSync(destination, "utf8");
    assert.match(stored, /\[redacted-key\]/);
    assert.doesNotMatch(stored, /abcdefghijklmnop/);
    assert.equal(fs.statSync(destination).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
