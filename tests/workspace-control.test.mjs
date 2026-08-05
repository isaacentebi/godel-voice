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
  const completionBlock = content.slice(content.indexOf("const result = await executePlan(payload.marker, payload.id)"),
    content.indexOf("finally { clearInterval(heartbeatTimer)", content.indexOf("const result = await executePlan(payload.marker, payload.id)")));
  assert.ok(completionBlock.indexOf("await acknowledgeCompletedWithReconciliation(payload.id")
    < completionBlock.lastIndexOf("emitCompletion({"),
  "success must not be emitted before the server accepts the terminal acknowledgement");
  assert.match(content, /async function acknowledgeCompletedWithReconciliation/);
  assert.match(content, /observed\?\.status === "completed"/);
  assert.match(content, /if \(error instanceof CancelledError\) throw error/);
  assert.match(completionBlock, /Godel action finished, but its result could not be verified/);
});

test("completion acknowledgement reconciles lost responses without replaying DOM work or speech", () => {
  const helper = content.slice(content.indexOf("async function acknowledgeCompletedWithReconciliation"),
    content.indexOf("async function releaseForRetry"));
  assert.match(helper, /attempt < 3/);
  assert.match(helper, /await workflowStatus\(id\)/);
  assert.match(helper, /observed\?\.status === "completed"/);
  assert.match(helper, /acknowledgement_reconciled: true/);
  assert.match(helper, /observed\?\.status !== "inflight" \|\| observed\?\.lease_owned !== true/);
  assert.match(helper, /await heartbeat\(id\)/);
  assert.doesNotMatch(helper, /executePlan|emitCompletion|speechSynthesis/);
  assert.ok(helper.indexOf('observed?.status === "cancelled"')
    < helper.indexOf('observed?.status === "completed"'),
  "terminal cancellation must win over a recovered success");
  const poll = content.slice(content.indexOf("async function poll()"), content.indexOf("async function runNextLoop()"));
  assert.equal((poll.match(/executePlan\(payload\.marker, payload\.id\)/g) ?? []).length, 1);
  assert.equal((poll.match(/status: "completed", message: result\.message/g) ?? []).length, 1);
  assert.match(poll, /acknowledgement\?\.acknowledgement_reconciled === true/);
});

test("Jarvis replaces safe windows only inside its dedicated Voice screen", () => {
  assert.match(content, /godel-voice-managed-window-ids-v1/);
  assert.match(content, /if \(replacesVoiceWorkspace\)/);
  assert.match(content, /await workspaceInternalAction\("createOwnedScreen", \{ name: "Voice" \}\)/);
  assert.match(content, /async function ensureVoiceScreen/);
  assert.match(content, /godel-voice-owned-screen-v1/);
  assert.match(content, /await closeVoiceScreenPanels\(\{ replaceAllSafe: true \}\)/);
  assert.match(content, /await workspaceInternalAction\("nameActiveScreen", \{ name: "Voice" \}\)/);
  assert.match(content, /activeScreenInfo/);
  assert.match(content, /dedicated Voice screen/);
  assert.match(content, /const managedWindowReceipts = new Map/);
  assert.match(content, /if \(createdByWorkflow\) rememberManagedPanel\(panel, \{ requestId: stepReceiptId, command: step\.command \}\)/);
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

test("manual Jarvis shutdown empties the owned Voice workspace and preserves session-start followups", () => {
  const realtime = fs.readFileSync(new URL("../extension/realtime.js", import.meta.url), "utf8");
  assert.match(realtime, /godel-voice:session-started/);
  assert.match(realtime, /!preserveIntent && reason !== "pagehide"/);
  assert.match(realtime, /godel-voice:cleanup-request/);
  assert.match(realtime, /explicit: reason === "manual_toggle"/);
  assert.match(content, /queueVoiceCleanup\(jarvisSessionEpoch\)/);
  assert.match(content, /if \(event\.detail\?\.explicit === true\) \{[\s\S]{0,360}queueVoiceCleanup\(jarvisSessionEpoch/);
  assert.match(content, /Starting or reconnecting Jarvis must preserve the visible panels/);
  assert.match(content, /if \(!closeAll && requestedEpoch !== jarvisSessionEpoch\) return/);
  assert.match(content, /await lifecycleCleanup/);
  assert.match(content, /const payload = await response\.json\(\);[\s\S]{0,520}await lifecycleCleanup;[\s\S]{0,180}running = true/);
  assert.match(content, /while \(running\) await pause\(100\)/);
  assert.match(content, /createdBefore: event\.detail\?\.stopped_at/);
  assert.match(content, /requestId: event\.detail\?\.workflow_id/);
  assert.match(content, /await executeDurableWorkspaceReset\(\{ requestId, createdBefore \}\)/);
});

test("manual shutdown keeps exact same-document receipts for layout-store orphan panels", () => {
  assert.match(content, /const managedDomReceipts = new Map\(\)/);
  assert.match(content, /function titleReceiptRoot\(command\)/);
  assert.match(content, /const root = nativeRoot \?\? titleReceiptRoot\(canonicalCommand\) \?\? panel/);
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

test("an orphan receipt follows only its stable native id across a React remount", () => {
  assert.match(content, /function panelForDomReceipt\(original, receipt\)/);
  assert.match(content, /original instanceof HTMLElement && original\.isConnected/);
  assert.match(content, /panelMatchesCommand\(original, receipt\.command\)/);
  assert.match(content, /if \(!receipt\.id\) return null/);
  assert.match(content, /const candidate = panelById\(String\(receipt\.id\)\)/);
  assert.match(content, /bare[\s\S]{0,160}command\/security match is not ownership proof/);
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
  assert.match(content, /closeVoiceScreenPanels\(\{ onlyIds: transactionWindowIds, requestId \}\)/);
  assert.match(content, /if \(plan\.layout\.preserve_existing === false\) await closeVoiceScreenPanels\(\{ replaceAllSafe: true \}\)/);
  assert.match(content, /const ownedIds = new Set\(\[\.\.\.requestedIds\]\.filter\(id => managedWindowReceipts\.has\(id\)\)\)/);
});

test("new panels are receipted before nested actions and optional failures roll back their exact request", () => {
  assert.match(content, /onPanelReady = null, onCommandSubmitted = null/);
  assert.match(content, /await onPanelReady\(panel, \{ terminalCommand, workspaceCommitted, phases \}\)/);
  assert.match(content, /requestId: stepReceiptId, command: step\.command/);
  assert.match(content, /const stepNewIds = new Set/);
  assert.match(content, /closeVoiceScreenPanels\(\{ onlyIds: stepNewIds, requestId: stepReceiptId \}\)/);
  assert.match(content, /receipt\.request_id === requestedReceipt \|\| receipt\.request_id\?\.startsWith/);
  assert.match(content, /const beforeInventory = await workspaceInternalAction\("workspaceInventory"\)/);
  assert.doesNotMatch(content, /const beforeInventory = await workspaceInternalAction\("workspaceInventory"\)\.catch/);
  assert.match(content, /failure preceded onPanelReady/);
  assert.match(content, /const afterWorkspaceIds = new Set/);
  assert.match(content, /if \(recoveryCandidates\.size === 1\)/);
  assert.match(content, /submittedTerminalIdentity = terminalPanelIdentity\(terminalCommand\)/);
  assert.match(content, /Could not establish ownership of the new/);
  assert.match(content, /Run legacy single-command markers through the same transactional engine/);
  assert.match(content, /const workflow = plan\.version === 2 \? plan/);
});

test("completion narration names only completed panels and admits skipped commands", () => {
  assert.match(content, /function completionMessage\(plan, openedPanels = \[\], timings = \[\]\)/);
  assert.match(content, /timing\.status === "completed"/);
  assert.match(content, /timing\.status === "failed" \|\| timing\.status === "skipped"/);
  assert.match(content, /function failedStepSubject\(step\)/);
  assert.match(content, /const failedSteps = plan\.steps\.filter/);
  assert.match(content, /I couldn't complete/);
  assert.match(content, /export: "Export menu opened\."/);
  assert.doesNotMatch(content, /export: "Export ready\."/);
  assert.match(content, /completionMessage\(workflow, result\.grounded, result\.timings\)/);
});

test("Voice workspace cleanup atomically prunes stale Jarvis layout records", () => {
  assert.match(bridge, /action === "clearVoiceScreen"/);
  assert.match(bridge, /Voice cleanup requires explicit Jarvis ownership receipts/);
  assert.match(bridge, /const replaceAllSafe = payload\.replace_all_safe === true/);
  assert.match(bridge, /replaceAllSafe \|\| onlyIds\.has\(id\)/);
  assert.match(bridge, /The owned Voice screen no longer exists/);
  assert.match(bridge, /The owned screen is no longer named Voice/);
  assert.match(bridge, /Voice cleanup requires an exact workspace snapshot/);
  assert.match(bridge, /const windows = \{ \.\.\.layout\.windows \}/);
  assert.match(bridge, /delete windows\[id\]/);
  assert.match(bridge, /consequentialWindowType/);
  assert.match(content, /workspaceInternalAction\("clearVoiceScreen"/);
  assert.match(content, /preserve_ids: \[\.\.\.borrowedWindowReceipts\.keys\(\)\]/);
  assert.match(content, /only_ids: \[\.\.\.\(snapshotIds \?\? ownedIds\)\]/);
  assert.match(content, /function pendingCleanupReceipts\(requestId = null, createdBefore = null\)/);
  assert.match(content, /attempt < 5/);
  assert.match(content, /await pause\(100 \* \(2 \*\* attempt\)\)/);
});

test("an explicit workspace reset clears hidden Voice records and remembered follow-up targets", () => {
  assert.match(content, /if \(step\.operation === "reset_workspace"\)/);
  assert.match(content, /await executeDurableWorkspaceReset\(\{ recoveryAdoptionAuthorized: true \}\)/);
  assert.match(content, /commandWindows\.clear\(\)/);
  assert.match(content, /commandPanels\.clear\(\)/);
  assert.match(content, /replace_all_safe: replaceAllSafe/);
});

test("workspace reset is a crash-safe write-ahead transaction", () => {
  assert.match(content, /godel-voice-pending-reset-v1/);
  assert.match(content, /async function beginPendingWorkspaceReset/);
  assert.match(content, /async function executeDurableWorkspaceReset/);
  assert.match(content, /version: 2/);
  assert.match(content, /target_window_ids:/);
  assert.match(content, /workspaceSnapshotIds: reset\.target_window_ids/);
  const begin = content.slice(content.indexOf("async function beginPendingWorkspaceReset"),
    content.indexOf("async function verifyPendingWorkspaceReset"));
  const persisted = begin.indexOf("persistPendingWorkspaceReset();");
  assert.ok(persisted >= 0, "reset marker must be persisted");
  assert.ok(persisted < begin.indexOf("persistVoiceScreenReceipt();"),
    "reset marker must precede recovery ownership mutation");
  const execute = content.slice(content.indexOf("async function executeDurableWorkspaceReset"),
    content.indexOf("function rememberVoiceWindowId"));
  assert.ok(execute.indexOf("beginPendingWorkspaceReset(options)")
    < execute.indexOf('workspaceInternalAction("focusScreen"'),
  "write-ahead setup must precede Godel focus mutation");
  assert.match(content, /if \(pendingWorkspaceReset\) queueVoiceCleanup\(jarvisSessionEpoch, \{ closeAll: true \}\)/);
});

test("pending reset clears only after exact authoritative inventory verification", () => {
  assert.match(content, /async function verifyPendingWorkspaceReset\(reset, cleanup\)/);
  assert.match(content, /String\(item\.id\) === String\(reset\.screen_id\)/);
  assert.match(content, /const remainingOnScreen = new Set\(screen\.window_ids\.map\(String\)\)/);
  assert.match(content, /inventory\?\.layout_window_ids/);
  assert.match(content, /inventory\?\.orphan_window_record_ids/);
  assert.match(content, /const blocked = new Set\(\(cleanup\?\.blocked_ids \?\? \[\]\)\.map\(String\)\)/);
  assert.match(content, /reset\.target_window_ids\.every\(id => absent\(id\) \|\| blocked\.has\(String\(id\)\)\)/);
  assert.match(content, /\[\.\.\.removed\]\.every\(absent\)/);
  assert.match(content, /reset\.known_orphan_record_ids\.every/);
  assert.match(content, /if \(!\(await verifyPendingWorkspaceReset\(reset, cleanup\)\)\)/);
  assert.match(content, /pendingWorkspaceReset = null;\s*persistPendingWorkspaceReset\(\)/);
});

test("workspace reset preserves explicitly blocked user windows without becoming unverifiable", () => {
  const verify = content.slice(content.indexOf("async function verifyPendingWorkspaceReset"),
    content.indexOf("async function executeDurableWorkspaceReset"));
  assert.match(verify, /cleanup\?\.blocked_ids/);
  assert.match(verify, /absent\(id\) \|\| blocked\.has\(String\(id\)\)/);
  assert.doesNotMatch(verify, /target_window_ids\.every\(id => !remainingOnScreen/);
});

test("an explicit reset drains an inherited snapshot before capturing current Voice state", () => {
  assert.match(content, /const inheritedSnapshot = pendingWorkspaceReset\?\.version === 2/);
  assert.match(content, /options\.recoveryAdoptionAuthorized === true && inheritedSnapshot/);
  assert.match(content, /await executeDurableWorkspaceReset\(\{ \.\.\.options, recoveryAdoptionAuthorized: true \}\)/);
});

test("automatic recovery never adopts a nonempty unowned Voice screen", () => {
  assert.match(content, /Owned Voice workspace is unavailable; cleanup was not verified/);
  assert.match(content, /if \(!reset\.recovery_adoption_authorized\) \{\s*throw new Error\("Automatic Voice recovery cannot adopt an unowned screen"\)/);
  assert.match(content, /An unowned nonempty Voice screen already exists; refusing to create a duplicate/);
  assert.match(content, /existingVoice\.window_ids\.length === 0/);
  assert.match(content, /reset_workspace[\s\S]{0,180}recoveryAdoptionAuthorized: true/);
  assert.match(content, /executeDurableWorkspaceReset\(\{ requestId, createdBefore \}\)/);
  assert.doesNotMatch(content, /executeDurableWorkspaceReset\(\{ requestId, createdBefore, recoveryAdoptionAuthorized: true/);
});

test("ordinary workflow recovery never abandons managed panels when Voice was renamed or removed", () => {
  assert.match(content, /Owned Voice workspace is unavailable; refusing to abandon managed panels/);
  assert.match(content, /managedWindowReceipts\.size \|\| managedDomReceipts\.size \|\| borrowedWindowReceipts\.size/);
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
  assert.match(content, /receipt\.document_generation === generation/);
  assert.match(content, /document_generation: documentGeneration/);
});

test("id-less Godel panels keep an exact title-toolbar receipt for later cleanup", () => {
  assert.match(content, /function titleReceiptRootForNode\(title\)/);
  assert.match(content, /function isExplicitCloseControl\(element\)/);
  assert.match(content, /function titleReceiptRoot\(command\)/);
  assert.match(content, /buttons\.filter\(isExplicitCloseControl\)\.length === 1/);
  assert.match(content, /const root = nativeRoot \?\? titleReceiptRoot\(canonicalCommand\) \?\? panel/);
});

test("replacement cleanup stays within native Voice membership and exact DOM receipts", () => {
  assert.match(content, /closeVoiceScreenPanels\(\{ replaceAllSafe: true \}\)/);
  assert.match(content, /workspaceInternalAction\("clearVoiceScreen"/);
  assert.match(content, /for \(const \[panel, receipt\] of ownedDom\)/);
  assert.doesNotMatch(content, /async function closeAllSafePanelsOnVoice/);
  assert.doesNotMatch(content, /for \(const command of Object\.keys\(PANEL_TITLES\)\)[\s\S]{0,800}panelInternalAction\(candidate\.native, "LAYOUT", "close"\)/);
  assert.match(content, /const belongsOnlyToVoice = id =>/);
  assert.match(content, /if \(receipt\.id && !belongsOnlyToVoice\(receipt\.id\)\)/);
  assert.match(content, /receipt\.document_generation !== documentGeneration/);
  assert.match(content, /verified_safe_ids: verifiedSafeIds/);
  assert.match(bridge, /else if \(!verifiedSafeIds\.has\(rawId\)\) blockedIds\.add\(rawId\)/);
  assert.match(bridge, /knownIds\]\.filter\(id => verifiedSafeIds\.has\(id\)/);
});

test("retained cleanup receipts become a terminal visible failure after bounded retries", () => {
  assert.match(content, /const incomplete = pendingWorkspaceReset/);
  assert.match(content, /Retained Jarvis panel receipts remain after cleanup retries/);
  assert.match(content, /Godel Voice cleanup incomplete:/);
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
  assert.match(content, /borrowedWindowReceipts\.set\(nativeId, \{/);
  assert.match(content, /transactionBorrowedIds\.add\(nativeId\)/);
  assert.match(content, /await restoreBorrowedWindows\(\{ onlyIds: transactionBorrowedIds \}\)/);
});

test("borrowed receipts are document-bound and restore only exact identity and membership", () => {
  assert.match(content, /document_generation: documentGeneration,[\s\S]{0,120}command: step\.command,[\s\S]{0,80}security: borrowedSecurity/);
  const restore = content.slice(content.indexOf("async function restoreBorrowedWindows"),
    content.indexOf("function managedWindowId"));
  assert.match(restore, /receipt\.document_generation !== generation/);
  assert.match(restore, /belongs to an older Godel document/);
  assert.ok(restore.indexOf("receipt.document_generation !== generation")
    < restore.indexOf('workspaceInternalAction("restoreWindowLocation", receipt)'),
  "a stale-generation receipt must be rejected before any restore mutation");
  assert.match(restore, /owners\.length !== 1/);
  assert.match(restore, /String\(owners\[0\]\.id\) !== receipt\.target_screen_id/);
  assert.match(restore, /String\(restoredOwners\[0\]\.id\) !== receipt\.source_screen_id/);
  assert.match(restore, /panelMatchesCommand\(panel, receipt\.command\)/);
  assert.match(restore, /panelMatchesReceiptSecurity\(panel, receipt\.command, receipt\.security\)/);
  assert.match(restore, /panelMatchesReceiptSecurity\(restoredPanel, receipt\.command, receipt\.security\)/);
  assert.match(restore, /could not safely restore borrowed/);
  const staleBranch = restore.slice(restore.indexOf("receipt.document_generation !== generation"),
    restore.indexOf("if (!receipt.command"));
  assert.doesNotMatch(staleBranch, /borrowedWindowReceipts\.delete|restoreWindowLocation/);
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
  assert.match(content, /const createdByWorkflow = !borrowed && \(provisionalOwnership\s*\n\s*\? provisionalOwnership\.createdByWorkflow/);
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
  assert.match(content, /workspaceInternalAction\("workspaceInventory"\)/);
  assert.match(content, /workspaceWindowId/);
  assert.match(content, /beforeWindowIds/);
  assert.match(content, /activeIds\.find\(id => !beforeWindowIds\.includes\(id\)\)/);
  assert.doesNotMatch(content, /\?\? activeIds\[0\]/);
  assert.match(content, /attempt < 20/);
  assert.match(content, /await pause\(25\)/);
  assert.match(content, /workspaceInternalAction\("setWindowGeometry"/);
  assert.match(content, /document\.getElementById\("godel-voice-workspace-anchor"\)/);
  assert.match(content, /panelForControl\(step\.target, activeScreen\.roots, activeScreen\.activeWindowId\)/);
  assert.match(content, /uniqueVisiblePanelForControl\(step\.target\)/);
  assert.match(content, /titles\.length !== 1/);
  assert.match(content, /panelExposureScore\(native\) < 1/);
  assert.match(content, /panelContainsSecurity\(shell, target\.security\)/);
  assert.match(content, /roots\.filter\(root => panelMatchesCommand\(root, target\.command\)\)/);
  assert.match(bridge, /screen\.activeWindowId == null/);
  assert.match(content, /activeScreen\.window_ids\s*\n\s*\.map\(id => roots\.find\(root => windowId\(root\) === String\(id\)\)\)/);
  assert.match(content, /panelExposureScore\(b\) - panelExposureScore\(a\)/);
  assert.match(content, /document\.elementFromPoint/);
  assert.match(content, /openExport/);
});

test("contextual controls fail closed outside authoritative active-screen identity", () => {
  assert.match(content, /async function activeScreenState\(\)/);
  assert.match(content, /workspaceInternalAction\("workspaceInventory"\)/);
  assert.match(content, /return \{ roots: \[\], activeWindowId: null \}/);
  assert.match(content, /activeWindowId && searchRoots\.find\(root => windowId\(root\) === String\(activeWindowId\)\)/);
  assert.doesNotMatch(content, /return \[\.\.\.searchRoots\]\.sort\(\(a, b\) => \(Number\.parseInt\(getComputedStyle\(b\)\.zIndex/);
  assert.match(content, /candidates\.length === 1 \? candidates\[0\] : null/);
});

test("closing a contextual panel clears every remembered target for that exact panel", () => {
  assert.match(content, /for \(const \[command, id\] of \[\.\.\.commandWindows\]\)/);
  assert.match(content, /commandWindows\.delete\(command\)/);
  assert.match(content, /for \(const \[command, remembered\] of \[\.\.\.commandPanels\]\)/);
  assert.match(content, /commandPanels\.delete\(command\)/);
});

test("explicit post-open geometry is never undone by automatic layout", () => {
  assert.match(content, /const hasExplicitGeometryControl = plan\.steps\.some/);
  assert.match(content, /\["maximize", "restore", "move", "resize"\]\.includes\(step\.operation\)/);
  assert.match(content, /if \(!hasExplicitGeometryControl\) await arrangeWorkflow\(plan, opened\)/);
});

test("a workflow cannot report success when every requested action failed", () => {
  assert.match(content, /completedRequestedActions = timings\.filter/);
  assert.match(content, /if \(failures\.length && completedRequestedActions\.length === 0\)/);
  assert.match(content, /None of the .* requested Godel action/);
});

test("layout warnings become failures when the opened panel is not actually visible", () => {
  assert.match(content, /function panelUsablyVisible\(panel\)/);
  assert.match(content, /intersectionWidth >= 160 && intersectionHeight >= 90/);
  assert.match(content, /opened\.some\(item => !panelUsablyVisible\(item\.panel\)\)/);
  assert.match(content, /an opened Godel panel is outside the usable Voice workspace/);
});
