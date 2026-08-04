import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const capability = JSON.parse(fs.readFileSync(new URL("../data/contracts/window-control-capability-v1.json", import.meta.url), "utf8"));
const bridge = fs.readFileSync(new URL("../extension/main-world.js", import.meta.url), "utf8");
const executor = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");

test("window-control inventory is unique and uses recognized evidence states", () => {
  const ids = capability.controls.map(control => control.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const control of capability.controls) {
    assert.ok(["live-verified", "source-verified", "partial", "unsupported"].includes(control.status), control.id);
    assert.ok(control.voice_examples.length > 0, control.id);
    assert.ok(control.evidence.length > 0, control.id);
  }
});

test("every supported panel control has a native binding and completion assertion", () => {
  for (const control of capability.controls.filter(control => !["unsupported"].includes(control.status))) {
    assert.ok(control.native_binding, control.id);
    assert.ok(control.completion, control.id);
  }
});

test("window geometry is bounded and verified through Godel state", () => {
  assert.match(bridge, /updateWindowPosition\(id, \{ \.\.\.current, \.\.\.rect \}\)/);
  assert.match(bridge, /rect\.width < 280 \|\| rect\.height < 190/);
  assert.match(bridge, /\["x", "y", "width", "height"\]\.every\(key => Math\.abs\(Number\(actual\[key\]\) - rect\[key\]\) < 1\)/);
  assert.match(bridge, /native window geometry`, 800/);
  assert.doesNotMatch(bridge, /style\.(?:left|top|width|height)\s*=/);
});

test("maximize, restore, focus, and close prove native postconditions", () => {
  assert.match(bridge, /manager\.fullScreen\(id, commandTypeFor\(windowRoot\)\)/);
  assert.match(bridge, /Boolean\(currentPosition\(manager, id\)\?\.previous\) === \(action === "maximize"\)/);
  assert.match(bridge, /workspace\.setActiveWindowId\(id\)/);
  assert.match(bridge, /String\(screen\?\.activeWindowId\) === String\(id\)/);
  assert.match(bridge, /!windowRoot\.isConnected/);
});

test("close is exact, panel-scoped, and rejects consequential families", () => {
  assert.match(bridge, /querySelectorAll\('\[data-cy-close-window="true"\]'\)/);
  assert.match(bridge, /controls\.length !== 1/);
  assert.match(bridge, /CHAT\|NOTE\|ACCOUNT\|BROK\|ORDER\|TRADE\|MESSAGE\|ALERT/);
  assert.match(executor, /panelForControl\(step\.target, await activeScreenRoots\(\)\)/);
  assert.doesNotMatch(executor, /window\.close\s*\(/);
});

test("cross-screen transfer and screen close remain explicitly unsupported", () => {
  assert.equal(capability.controls.find(control => control.id === "window.move_between_screens").status, "unsupported");
  assert.equal(capability.controls.find(control => control.id === "screen.close").status, "unsupported");
  assert.doesNotMatch(bridge, /moveWindowToScreen/);
});
