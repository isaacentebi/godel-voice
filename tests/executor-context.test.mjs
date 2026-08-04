import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readRecentExecutorContext } from "../src/executor-context.mjs";

test("reads fresh portable executor context", t => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "godel-context-"));
  t.after(() => fs.rmSync(projectDir, { recursive: true, force: true }));
  const now = 10_000;
  const expected = { updated_at: now - 100, last_command: "HMAP" };
  fs.writeFileSync(path.join(projectDir, ".godel-voice-queue.json"), JSON.stringify({ context: expected }));

  assert.deepEqual(readRecentExecutorContext({ projectDir, platform: "linux", now }), expected);
});

test("ignores stale or malformed executor context", t => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "godel-context-"));
  t.after(() => fs.rmSync(projectDir, { recursive: true, force: true }));
  const statePath = path.join(projectDir, ".godel-voice-queue.json");
  fs.writeFileSync(statePath, JSON.stringify({ context: { updated_at: 1, last_command: "EM" } }));

  assert.equal(readRecentExecutorContext({ projectDir, platform: "linux", now: 30_000, maxAgeMs: 1_000 }), null);
  fs.writeFileSync(statePath, "not json");
  assert.equal(readRecentExecutorContext({ projectDir, platform: "linux", now: 30_000 }), null);
});
