import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const bridge = fs.readFileSync(new URL("../extension/main-world.js", import.meta.url), "utf8");
const content = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");

test("native workspace bridge uses exact Godel lifecycle contracts", () => {
  assert.match(bridge, /setActiveWindowId/);
  assert.match(bridge, /screen\?\.activeWindowId/);
  assert.match(bridge, /manager\.fullScreen/);
  assert.match(bridge, /data-cy-close-window/);
  assert.match(bridge, /candidates\.length === 1/);
  assert.match(bridge, /candidates\.length > 1\) break/);
  assert.match(bridge, /layout\.screens\[layout\.activeScreenId\]\?\.activeWindowId/);
  assert.match(bridge, /document\.getElementById\(`\$\{activeId\}-window`\)/);
  assert.match(bridge, /setLayout\(layoutValue =>/);
  assert.match(bridge, /tabs\.onSelect/);
  assert.match(bridge, /tabs\.onEdit/);
  assert.match(bridge, /screen\.windowIds\.length === 0/);
  assert.match(bridge, /eight-screen limit/);
  assert.match(bridge, /context\.exportScreen/);
  assert.match(bridge, /context\.exportLayout/);
  assert.match(bridge, /workspace layout shape changed/);
  assert.doesNotMatch(bridge, /style\.(left|top|width|height)\s*=/);
});

test("content executor acknowledges leased work and checks cancellation between steps", () => {
  assert.match(content, /\/next\?client=/);
  assert.match(content, /\/status\?id=/);
  assert.match(content, /fetch\(`\$\{config\.handoffUrl\}\/ack`/);
  assert.match(content, /Authorization: `Bearer \$\{config\.secret\}`/);
  assert.match(content, /await ensureNotCancelled\(requestId\)/);
  assert.match(content, /godel-voice:completion/);
  assert.match(content, /config\.spokenFeedback === false/);
  assert.match(content, /extension context invalidated/i);
  assert.match(content, /fetch\(`\$\{config\.handoffUrl\}\/retry`/);
  assert.match(content, /\/heartbeat/);
  assert.match(content, /publishExecutorContext/);
  assert.match(content, /\/context`/);
});

test("contextual controls target last, focused, or remembered command windows", () => {
  assert.match(content, /target\.mode === "last"/);
  assert.match(content, /target\.mode === "focused"/);
  assert.match(content, /commandWindows\.get\(target\.command\)/);
  assert.match(content, /workspaceInternalAction\("activeWindowIds"\)/);
  assert.match(content, /panelForControl\(step\.target, await activeScreenRoots\(\)\)/);
  assert.match(content, /roots\.filter\(root => panelMatchesCommand\(root, target\.command\)\)/);
  assert.match(bridge, /screen\.activeWindowId == null/);
  assert.match(content, /ids\.map\(id => roots\.find\(root => windowId\(root\) === String\(id\)\)\)/);
  assert.match(content, /panelExposureScore\(b\) - panelExposureScore\(a\)/);
  assert.match(content, /document\.elementFromPoint/);
  assert.match(content, /openExport/);
});
