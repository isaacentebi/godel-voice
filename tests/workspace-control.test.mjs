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
  assert.match(bridge, /const contextRoot = root\.matches\?\.\('\[id\$="-window"\]'\) \? root : null/);
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
  assert.match(content, /if \(replacesVoiceWorkspace\)/);
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

test("top-level quote requests also clear stale Jarvis panels", () => {
  assert.match(content, /const replacesVoiceWorkspace = plan\.layout\.preserve_existing === false/);
  assert.match(content, /plan\.steps\.some\(step => step\.kind === "command"\)/);
  assert.match(content, /if \(replacesVoiceWorkspace\)/);
  assert.match(content, /const opensNewPanels = plan\.steps\.some\(step => step\.kind === "command" && step\.command !== "Q"\)/);
});

test("manual Jarvis shutdown cleans only its Voice-screen windows and aborts across a new session", () => {
  const realtime = fs.readFileSync(new URL("../extension/realtime.js", import.meta.url), "utf8");
  assert.match(realtime, /godel-voice:session-started/);
  assert.match(realtime, /!preserveIntent && reason !== "pagehide"/);
  assert.match(realtime, /godel-voice:cleanup-request/);
  assert.match(content, /queueVoiceCleanup\(jarvisSessionEpoch\)/);
  assert.match(content, /requestedEpoch !== jarvisSessionEpoch \|\| running/);
  assert.match(content, /await lifecycleCleanup/);
  assert.match(content, /const payload = await response\.json\(\);[\s\S]{0,320}await lifecycleCleanup;[\s\S]{0,80}running = true/);
  assert.match(content, /for \(let attempt = 0; attempt < 700 && running/);
  assert.match(content, /await closeVoiceScreenPanels\(\)/);
});

test("failed workflows roll back only newly opened safe Voice windows", () => {
  assert.match(content, /const transactionWindowIds = new Set\(\)/);
  assert.match(content, /beforeRenderedIds = new Set/);
  assert.match(content, /transactionWindowIds\.add/);
  assert.match(content, /closeVoiceScreenPanels\(\{ onlyIds: transactionWindowIds \}\)/);
  assert.match(content, /if \(plan\.layout\.preserve_existing === false\) await closeVoiceScreenPanels\(\)/);
  assert.match(content, /const allowedIds = onlyIds \? new Set/);
});

test("Voice workspace cleanup atomically prunes stale Jarvis layout records", () => {
  assert.match(bridge, /action === "clearVoiceScreen"/);
  assert.match(bridge, /Expected one dedicated Voice screen/);
  assert.match(bridge, /const windows = \{ \.\.\.layout\.windows \}/);
  assert.match(bridge, /delete windows\[id\]/);
  assert.match(bridge, /consequentialWindowType/);
  assert.match(content, /workspaceInternalAction\("clearVoiceScreen"/);
  assert.match(content, /preserve_ids: \[\.\.\.borrowedWindowReceipts\.keys\(\)\]/);
});

test("workspace inventory exposes bounded state needed for recovery diagnostics", () => {
  assert.match(bridge, /action === "workspaceInventory"/);
  assert.match(bridge, /total_windows:/);
  assert.match(bridge, /window_ids: current\.screens\[id\]\.windowIds\.map\(String\)/);
});

test("global workspace actions never inherit a stale panel screen provider", () => {
  assert.match(content, /document\.getElementById\("godel-voice-workspace-anchor"\)/);
  assert.match(content, /root\.id = "godel-voice-workspace-anchor"/);
  assert.match(content, /root\.hidden = true/);
  assert.match(content, /document\.documentElement\.append\(root\)/);
  assert.match(content, /panelInternalAction\(root, "WORKSPACE", action, payload\)/);
  assert.doesNotMatch(content, /const root = windowRoots\(\)\[0\][\s\S]{0,180}panelInternalAction\(root, "WORKSPACE"/);
});

test("singleton panels borrowed from another screen are restored instead of closed", () => {
  assert.match(bridge, /action === "moveWindowToScreen"/);
  assert.match(bridge, /sources\.length !== 1/);
  assert.match(bridge, /position\.previous != null/);
  assert.match(bridge, /activeScreenId: targetScreenId/);
  assert.match(bridge, /action === "restoreWindowLocation"/);
  assert.match(bridge, /restoredSourceIds\.splice\(sourceIndex, 0, nativeId\)/);
  assert.match(bridge, /manager\.updateWindowPosition\(nativeId, \{ \.\.\.existing, \.\.\.rect \}\)/);
  assert.match(content, /const transactionBorrowedIds = new Set\(\)/);
  assert.match(content, /borrowedWindowReceipts\.set\(nativeId, receipt\)/);
  assert.match(content, /transactionBorrowedIds\.add\(nativeId\)/);
  assert.match(content, /await restoreBorrowedWindows\(\{ onlyIds: transactionBorrowedIds \}\)/);
});

test("fresh rendered windows wait for Godel's layout store before transfer", () => {
  assert.match(content, /async function moveWindowToWorkflowScreen\(id, targetScreenId\)/);
  assert.match(content, /attempt < 20/);
  assert.match(content, /Expected one Godel screen for window/);
  assert.match(content, /found 0/);
  assert.match(content, /await pause\(25\)/);
  assert.match(content, /await moveWindowToWorkflowScreen\(nativeId, workflowScreenId\)/);
});

test("compound commands wait for Godel's bounded layout commit before opening another panel", () => {
  assert.match(content, /element\.textContent\.trim\(\)\.toUpperCase\(\) === "COMMANDS"/);
  assert.match(content, /if \(commandMenuOpen\(\)\)/);
  assert.match(content, /await press\("Escape"\);[\s\S]*await waitUntil\(\(\) => !commandMenuOpen\(\), "closed Godel command bar", 600\)/);
  assert.match(content, /catch \{[\s\S]*await press\("Backquote"\);[\s\S]*"closed Godel command bar", 1000/);
  assert.match(content, /await waitUntil\(commandMenuOpen, "open Godel command menu", 3000\)/);
  assert.match(content, /plan\.steps\[index \+ 1\]\?\.kind === "command"/);
  assert.match(content, /await pause\(250\)/);
  assert.match(content, /did not settle before the next command/);
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
  assert.match(content, /document\.getElementById\("godel-voice-workspace-anchor"\)/);
  assert.match(content, /panelForControl\(step\.target, await activeScreenRoots\(\)\)/);
  assert.match(content, /roots\.filter\(root => panelMatchesCommand\(root, target\.command\)\)/);
  assert.match(bridge, /screen\.activeWindowId == null/);
  assert.match(content, /ids\.map\(id => roots\.find\(root => windowId\(root\) === String\(id\)\)\)/);
  assert.match(content, /panelExposureScore\(b\) - panelExposureScore\(a\)/);
  assert.match(content, /document\.elementFromPoint/);
  assert.match(content, /openExport/);
});

test("explicit post-open geometry is never undone by automatic layout", () => {
  assert.match(content, /const hasExplicitGeometryControl = plan\.steps\.some/);
  assert.match(content, /\["maximize", "restore", "move", "resize"\]\.includes\(step\.operation\)/);
  assert.match(content, /if \(!hasExplicitGeometryControl\) await arrangeWorkflow\(plan, opened\)/);
});
