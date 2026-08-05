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
  assert.match(bridge, /screen\.title\.toLowerCase\(\) === title\.toLowerCase\(\)/);
  assert.match(bridge, /screen\.windowIds\.length === 0 && screen\.title\.toLowerCase\(\) === "blank"/);
  assert.match(bridge, /action === "activeScreenInfo"/);
  assert.match(bridge, /action === "nameActiveScreen"/);
  assert.match(bridge, /eight-screen limit/);
  assert.match(bridge, /context\.exportScreen/);
  assert.match(bridge, /context\.exportLayout/);
  assert.match(bridge, /workspace layout shape changed/);
  assert.match(bridge, /const tabButtons = \[\.\.\.document\.querySelectorAll/);
  assert.match(bridge, /workspaceContextFor\(contextRoot \?\? root\)/);
  assert.match(bridge, /String\(screen\.id\) !== String\(screenId\)/);
  assert.match(bridge, /screen\.windowIds\.length > 0 && !\("activeWindowId" in screen\)/);
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

test("Jarvis replaces safe windows only inside its dedicated Voice screen", () => {
  assert.match(content, /godel-voice-managed-window-ids-v1/);
  assert.match(content, /if \(opensNewPanels && plan\.layout\.preserve_existing === false\)/);
  assert.match(content, /await workspaceInternalAction\("createScreen", \{ name: "Voice" \}\)/);
  assert.match(content, /await closeVoiceScreenPanels\(\)/);
  assert.match(content, /await workspaceInternalAction\("nameActiveScreen", \{ name: "Voice" \}\)/);
  assert.match(content, /activeScreenInfo/);
  assert.match(content, /dedicated Voice screen/);
  assert.match(content, /rememberManagedPanel\(panel\)/);
  assert.match(content, /CHAT\|NOTE\|ACCOUNT\|BROK\|ORDER\|TRADE\|MESSAGE\|ALERT/);
  assert.match(content, /destructive or blocking failure/);
  assert.doesNotMatch(content, /localStorage\.clear|sessionStorage\.clear/);
});

test("manual Jarvis shutdown cleans only its Voice-screen windows and aborts across a new session", () => {
  const realtime = fs.readFileSync(new URL("../extension/realtime.js", import.meta.url), "utf8");
  assert.match(realtime, /godel-voice:session-started/);
  assert.match(realtime, /reason === "manual_toggle"[\s\S]{0,180}godel-voice:cleanup-request/);
  assert.match(content, /const requestedEpoch = jarvisSessionEpoch/);
  assert.match(content, /requestedEpoch !== jarvisSessionEpoch \|\| running/);
  assert.match(content, /await closeVoiceScreenPanels\(\)/);
});

test("Q authenticates the strict quote signature across changing Godel header component boundaries", () => {
  assert.match(content, /typeof panelInsights\.extractQuickQuote === "function"/);
  assert.match(content, /quickQuoteFacts\(document\.body\?\.innerText, expectedSecurity\)/);
  assert.match(content, /Arc can keep the previous/);
  assert.match(content, /return header;/);
  assert.doesNotMatch(content, /rememberManagedPanel\(header\)/);
});

test("empty-screen recovery never renames a named user screen", () => {
  assert.match(bridge, /tabs\.items\.find\(item => item\.title\.toLowerCase\(\) === title\.toLowerCase\(\)\)/);
  assert.match(bridge, /tabs\.items\.find\(item => item\.title\.toLowerCase\(\) === "blank"\)/);
  assert.match(bridge, /Create an empty Blank screen once so Jarvis can claim/);
  assert.doesNotMatch(bridge, /const active = tabs\.items\.find[\s\S]{0,300}tabs\.onEdit\(String\(active\.id\), title\)/);
  assert.match(bridge, /screens: \{ \.\.\.layout\.screens, \[screenId\]: \{ \.\.\.screen, title \} \}/);
});

test("contextual controls target last, focused, or remembered command windows", () => {
  assert.match(content, /target\.mode === "last"/);
  assert.match(content, /target\.mode === "focused"/);
  assert.match(content, /commandWindows\.get\(target\.command\)/);
  assert.match(content, /workspaceInternalAction\("activeWindowIds"\)/);
  assert.match(content, /workspaceWindowId/);
  assert.match(content, /beforeWindowIds/);
  assert.match(content, /activeIds\.find\(id => !beforeWindowIds\.includes\(id\)\)/);
  assert.match(content, /attempt < 20/);
  assert.match(content, /await pause\(25\)/);
  assert.match(content, /workspaceInternalAction\("setWindowGeometry"/);
  assert.match(content, /document\.querySelector\('\[id\$="-window"\]'\)/);
  assert.match(content, /panelForControl\(step\.target, await activeScreenRoots\(\)\)/);
  assert.match(content, /roots\.filter\(root => panelMatchesCommand\(root, target\.command\)\)/);
  assert.match(bridge, /screen\.activeWindowId == null/);
  assert.match(content, /ids\.map\(id => roots\.find\(root => windowId\(root\) === String\(id\)\)\)/);
  assert.match(content, /panelExposureScore\(b\) - panelExposureScore\(a\)/);
  assert.match(content, /document\.elementFromPoint/);
  assert.match(content, /openExport/);
});
