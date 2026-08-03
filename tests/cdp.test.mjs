import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

await import("../extension/cdp.js");
const cdp = globalThis.GodelVoiceCDP;

test("CDP clicks the center of a Godel control", () => {
  const commands = cdp.clickCommands({ x: 10, y: 20, width: 100, height: 40 });
  assert.equal(commands.length, 3);
  assert.deepEqual(commands[1][1], {
    type: "mousePressed", x: 60, y: 40, button: "left", buttons: 1, clickCount: 1
  });
});

test("CDP text replacement selects, clears and inserts without OS keystrokes", () => {
  const commands = cdp.replaceTextCommands({ x: 0, y: 0, width: 20, height: 20 }, "AAPL US EQ GF");
  assert(commands.some(([method, params]) => method === "Input.dispatchKeyEvent" && params.commands?.includes("selectAll")));
  assert(commands.some(([method, params]) => method === "Input.insertText" && params.text === "AAPL US EQ GF"));
});

test("VoiceInk delivery contains no AppleScript or System Events automation", () => {
  const script = fs.readFileSync(new URL("../bin/voiceink-deliver", import.meta.url), "utf8");
  assert.doesNotMatch(script, /osascript|System Events|keystroke|key code/i);
  assert.match(script, /127\.0\.0\.1:17841/);
});
