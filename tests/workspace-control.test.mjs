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
  assert.match(content, /const managedWindowReceipts = new Map/);
  assert.match(content, /if \(createdByWorkflow\) rememberManagedPanel\(panel, \{ requestId, command: step\.command \}\)/);
  assert.match(content, /managedWindowReceipts\.has\(id\)/);
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

test("manual Jarvis shutdown cleans only receipted Voice-screen windows and preserves session-start followups", () => {
  const realtime = fs.readFileSync(new URL("../extension/realtime.js", import.meta.url), "utf8");
  assert.match(realtime, /godel-voice:session-started/);
  assert.match(realtime, /!preserveIntent && reason !== "pagehide"/);
  assert.match(realtime, /godel-voice:cleanup-request/);
  assert.match(realtime, /explicit: reason === "manual_toggle"/);
  assert.match(content, /queueVoiceCleanup\(jarvisSessionEpoch\)/);
  assert.match(content, /if \(event\.detail\?\.explicit === true\) queueVoiceCleanup\(jarvisSessionEpoch, \{ closeAll: true \}\)/);
  assert.match(content, /Starting or reconnecting Jarvis must preserve the visible panels/);
  assert.match(content, /requestedEpoch !== jarvisSessionEpoch \|\| running/);
  assert.match(content, /await lifecycleCleanup/);
  assert.match(content, /const payload = await response\.json\(\);[\s\S]{0,320}await lifecycleCleanup;[\s\S]{0,80}running = true/);
  assert.match(content, /for \(let attempt = 0; attempt < 700 && running/);
  assert.match(content, /await closeVoiceScreenPanels\(\)/);
});

test("manual shutdown keeps exact same-document receipts for layout-store orphan panels", () => {
  assert.match(content, /const managedDomReceipts = new Map\(\)/);
  assert.match(content, /const root = nativeRoot \?\? \(titleShells\.length === 1 \? titleShells\[0\] : panel\)/);
  assert.match(content, /managedDomReceipts\.set\(root, receipt\)/);
  assert.match(content, /for \(const \[panel, receipt\] of ownedDom\)/);
  assert.match(content, /panelForDomReceipt\(panel, receipt\)/);
  assert.match(content, /await closeOwnedDomPanel\(currentPanel, receipt\.command, receipt\.id\)/);
  assert.match(content, /element\.getAttribute\("data-cy-close-window"\) === "true"/);
  assert.match(content, /element\.getAttribute\("aria-label"\), element\.title, element\.textContent/);
  assert.match(content, /element\.querySelectorAll\('\[aria-label\],\[alt\],\[title\],\[data-icon\],\[data-testid\]'\)/);
  assert.match(content, /descendantLabels\.some/);
  assert.match(content, /const candidate = buttons\.at\(-1\) \?\? null/);
  assert.match(content, /buttonRect\.left < titleRect\.right/);
  assert.match(content, /await waitUntil\(\(\) => !panel\.isConnected \|\| !visible\(panel\)/);
});

test("an orphan receipt can follow one exact command-and-security React remount", () => {
  assert.match(content, /function panelForDomReceipt\(original, receipt\)/);
  assert.match(content, /original instanceof HTMLElement && original\.isConnected/);
  assert.match(content, /panelMatchesCommand\(original, receipt\.command\)/);
  assert.match(content, /windowRoots\(\)\.filter\(root => panelMatchesCommand\(root, receipt\.command\)\)/);
  assert.match(content, /panelTitleNodes\(receipt\.command\)\.map\(rootForTitle\)/);
  assert.match(content, /panelMatchesReceiptSecurity\(candidate, receipt\.command, receipt\.security\)/);
  assert.match(content, /return candidates\.length === 1 \? candidates\[0\] : null/);
  assert.match(content, /managedDomReceipts\.set\(currentPanel, receipt\)/);
  assert.match(content, /Reconciliation is observation-only for same-document receipts/);
  assert.doesNotMatch(content, /if \(!activeVoiceScreen \|\| !currentPanel\) \{\s*managedDomReceipts\.delete\(panel\)/);
});

test("orphan security identity can bridge one tightly aligned sibling React input", () => {
  assert.match(content, /function panelMatchesReceiptSecurity\(panel, command, security\)/);
  assert.match(content, /String\(input\.value \?\? ""\)\.trim\(\)\.toUpperCase\(\) !== wanted/);
  assert.match(content, /horizontalGap <= 520 && verticalGap <= 80/);
  assert.match(content, /return aligned\.length === 1/);
});

test("failed workflows roll back only newly opened safe Voice windows", () => {
  assert.match(content, /const transactionWindowIds = new Set\(\)/);
  assert.match(content, /beforeRenderedIds = new Set/);
  assert.match(content, /transactionWindowIds\.add/);
  assert.match(content, /closeVoiceScreenPanels\(\{ onlyIds: transactionWindowIds \}\)/);
  assert.match(content, /if \(plan\.layout\.preserve_existing === false\) await closeVoiceScreenPanels\(\)/);
  assert.match(content, /const ownedIds = new Set\(\[\.\.\.requestedIds\]\.filter\(id => managedWindowReceipts\.has\(id\)\)\)/);
});

test("Voice workspace cleanup atomically prunes stale Jarvis layout records", () => {
  assert.match(bridge, /action === "clearVoiceScreen"/);
  assert.match(bridge, /Voice cleanup requires explicit Jarvis ownership receipts/);
  assert.match(bridge, /Expected one dedicated Voice screen/);
  assert.match(bridge, /const windows = \{ \.\.\.layout\.windows \}/);
  assert.match(bridge, /delete windows\[id\]/);
  assert.match(bridge, /consequentialWindowType/);
  assert.match(content, /workspaceInternalAction\("clearVoiceScreen"/);
  assert.match(content, /preserve_ids: \[\.\.\.borrowedWindowReceipts\.keys\(\)\]/);
  assert.match(content, /only_ids: \[\.\.\.ownedIds\]/);
});

test("successful requests reconcile orphaned receipts and enforce a bounded managed-window cap", () => {
  assert.match(content, /async function reconcileManagedWindows/);
  assert.match(content, /maximum = 12/);
  assert.match(content, /owners\.length === 1 && owners\[0\] === voiceScreenId/);
  assert.match(content, /managedWindowReceipts\.size - maximum/);
  assert.match(content, /if \(lastWindowId\) preserved\.add\(String\(lastWindowId\)\)/);
  assert.match(content, /const currentRequestWindowIds = new Set\(transactionWindowIds\)/);
  assert.match(content, /currentRequestWindowIds\.add\(String\(item\.workspaceWindowId\)\)/);
  assert.match(content, /await reconcileManagedWindows\(\{ preserveIds: currentRequestWindowIds \}\)\.catch/);
  assert.match(content, /!preserved\.has\(receipt\.id\) && !borrowedWindowReceipts\.has\(receipt\.id\)/);
  assert.match(content, /managedWindowReceipts\.delete\(nativeId\)/);
});

test("a receipted connected panel survives a missing Godel layout-store id for manual cleanup", () => {
  assert.match(content, /const renderedOnActiveVoiceScreen = owners\.length === 0/);
  assert.match(content, /const renderedCommand = contextPanel\(renderedPanel\)\?\.command \?\? null/);
  assert.match(content, /!receipt\.command \|\| renderedCommand === receipt\.command/);
  assert.match(content, /if \(renderedOnActiveVoiceScreen && !borrowedWindowReceipts\.has\(id\)\) continue/);
});

test("managed receipts retain Godel's alphanumeric native ids across a content-script restart", () => {
  assert.ok(content.includes("receipt && /^[A-Za-z0-9_-]{1,120}$/.test(String(receipt.id"));
});

test("a title-authenticated native panel can be receipted when Godel omits its command-type attribute", () => {
  assert.match(content, /root\?\.getAttribute\("data-cy-command-type"\)\s*\n\s*\?\? contextPanel\(root\)\?\.command/);
  assert.match(content, /if \(!id \|\| !type \|\| \/CHAT\|NOTE\|ACCOUNT\|BROK\|ORDER\|TRADE\|MESSAGE\|ALERT\//);
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
  assert.match(content, /function elementExposed\(element\)/);
  assert.match(content, /document\.elementFromPoint\(x, y\)/);
  assert.match(content, /visible\(element\) && elementExposed\(element\)/);
  assert.match(content, /const input = topCommandInput\(\);[\s\S]*if \(!input\) return false/);
  assert.match(content, /element\.textContent\.trim\(\)\.toUpperCase\(\) === "COMMANDS"/);
  assert.match(content, /if \(commandMenuOpen\(\)\)/);
  assert.match(content, /const staleInput = topCommandInput\(\);[\s\S]*await click\(staleInput\)/);
  assert.match(content, /await press\("Escape"\);[\s\S]*await waitUntil\(\(\) => !commandMenuOpen\(\), "closed Godel command bar", 600\)/);
  assert.match(content, /catch \{[\s\S]*await press\("Backquote"\);[\s\S]*"closed Godel command bar", 1000/);
  assert.match(content, /await waitUntil\(commandMenuOpen, "open Godel command menu", 3000\)/);
  assert.match(content, /plan\.steps\[index \+ 1\]\?\.kind === "command"/);
  assert.match(content, /await pause\(250\)/);
  assert.match(content, /did not settle before the next command/);
});

test("creation ownership uses exact element identity when Godel exposes no layout id", () => {
  assert.match(content, /beforeRenderedRoots = new Set\(windowRoots\(\)\)/);
  assert.match(content, /beforeCommandPanels = new Set\(\[/);
  assert.match(content, /const creationRoot = native \?\? panel/);
  assert.match(content, /const createdByWorkflow = !borrowed && creationRoot/);
  assert.match(content, /!beforeCommandPanels\.has\(creationRoot\)/);
  assert.match(content, /ownershipPhases\.ownership_dom_receipt = managedDomReceipts\.has\(creationRoot\) \? 1 : 0/);
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
  assert.doesNotMatch(content, /\?\? activeIds\[0\]/);
  assert.match(content, /attempt < 20/);
  assert.match(content, /await pause\(25\)/);
  assert.match(content, /workspaceInternalAction\("setWindowGeometry"/);
  assert.match(content, /document\.getElementById\("godel-voice-workspace-anchor"\)/);
  assert.match(content, /panelForControl\(step\.target, await activeScreenRoots\(\)\)/);
  assert.match(content, /uniqueVisiblePanelForControl\(step\.target\)/);
  assert.match(content, /titles\.length !== 1/);
  assert.match(content, /panelExposureScore\(native\) < 1/);
  assert.match(content, /panelContainsSecurity\(shell, target\.security\)/);
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
