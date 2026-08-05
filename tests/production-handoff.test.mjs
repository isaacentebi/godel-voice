import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { HandoffStore } from "../src/handoff-server.mjs";

const project = path.resolve(import.meta.dirname, "..");
const read = file => fs.readFileSync(path.join(project, file), "utf8");

test("executor leases are gated to the focused active Godel tab and renewed during work", () => {
  const content = read("extension/content.js");
  const background = read("extension/background.js");
  assert.match(content, /document\.visibilityState !== "visible"/);
  assert.match(content, /godel-voice:executor-eligibility/);
  assert.match(background, /chrome\.windows\.getLastFocused/);
  assert.match(background, /tab\.active === true && focusedWindow\?\.id === tab\.windowId/);
  assert.match(content, /\/heartbeat/);
  assert.match(content, /client_id: clientId/);
  assert.match(content, /clearInterval\(heartbeatTimer\)/);
});

test("an affined live Jarvis session keeps its deterministic executor and context alive in the background", () => {
  const content = read("extension/content.js");
  assert.match(content, /let jarvisRealtimeActive = false/);
  assert.match(content, /document\.visibilityState !== "visible"[\s\S]{0,180}jarvisRealtimeActive/);
  assert.match(content, /if \(\(!jarvisRealtimeActive && document\.visibilityState !== "visible"\)/);
  assert.match(content, /jarvisRealtimeActive = true/);
  assert.match(content, /jarvisRealtimeActive = false/);
});

test("executor queue delivery uses one bounded cancellable long-poll after eligibility", () => {
  const content = read("extension/content.js");
  assert.match(content, /let polling = false/);
  assert.match(content, /if \(running \|\| polling \|\| nextLoopStopped\) return "busy"/);
  assert.match(content, /polling = true/);
  assert.match(content, /if \(!\(await eligibleExecutor\(\)\.catch\(\(\) => false\)\)\) return "ineligible"/);
  assert.match(content, /finally \{ nextRequestController = null; polling = false; \}/);
  assert.match(content, /wait_ms=\$\{NEXT_WAIT_MS\}/);
  assert.match(content, /signal: controller\.signal/);
  assert.match(content, /async function runNextLoop\(\)/);
  assert.match(content, /nextRequestController\?\.abort\(\)/);
  assert.doesNotMatch(content, /setInterval\(poll, 100\)/);
});

test("command and nested-action execution use rendered postconditions instead of fixed settling sleeps", () => {
  const content = read("extension/content.js");
  assert.match(content, /const observer = new MutationObserver\(check\)/);
  assert.match(content, /elapsed < 250 \? 16 : elapsed < 1000 \? 32 : 75/);
  assert.match(content, /async function waitUntilAsync/);
  assert.match(content, /Godel command bar value \$\{terminalCommand\}/);
  assert.match(content, /String\(currentInput\.value \?\? ""\)\.trim\(\) === terminalCommand/);
  assert.doesNotMatch(content, /pause\((?:120|180|220)\)/);
  assert.match(content, /new \$\{plan\.command\} panel`, 9000/);
  assert.match(content, /async function committedPanelIdentity\(panel, command\)/);
  assert.match(content, /owners\.length !== 1/);
  assert.match(content, /waitUntilAsync\(\(\) => committedPanelIdentity\(panel, plan\.command\)/);
  assert.match(content, /markPhase\("panel_commit_ms"/);
  assert.match(content, /this is observation-only and never retries Enter after mutation/);
  assert.match(content, /measuredGFAction\(panel, "addCompany"/);
});

test("opening a fresh command palette never emits Godel's double-Escape close gesture", () => {
  const content = read("extension/content.js");
  assert.match(content, /let closedMountedPalette = false/);
  assert.match(content, /if \(!closedMountedPalette\) await press\("Escape"\)/);
});

test("an exact rendered panel survives a missing private workspace receipt", () => {
  const content = read("extension/content.js");
  assert.match(content, /const exactRenderedPanel = panel\?\.isConnected/);
  assert.match(content, /workspace_commit_pending = 1/);
  assert.match(content, /godelVoiceWorkspaceCommitted !== "false"/);
});

test("panel identity uses exact native types or exact rendered titles", () => {
  const content = read("extension/content.js");
  assert.match(content, /ANR: \["ANALYST RATINGS"\]/);
  assert.match(content, /GLCO: \["GLOBAL COMMODITY FUTURES", "GLCO"\]/);
  assert.match(content, /FX: \["FOREX PAIRS", "FX"\]/);
  assert.match(content, /MOSO: \["MOST ACTIVE OPTIONS", "MOSO"\]/);
  assert.match(content, /TOP: \["TOP NEWS", "TOP"\]/);
  assert.match(content, /TREND: \["TRENDING ON GODEL", "TREND"\]/);
  assert.match(content, /IPO: \["INITIAL PUBLIC OFFERINGS", "IPO"\]/);
  assert.match(content, /MAP: \["WORLD VENUE MAP", "MAP"\]/);
  assert.match(content, /ANR: "ANALYST_RATINGS"/);
  assert.match(content, /panelTitleNodes\(command\)\.some/);
  assert.match(content, /panelMatchesTerminalIdentity\(root, identity\)/);
  assert.match(content, /activeReused && panelMatchesTerminalIdentity\(activeReused, identity\)/);
  assert.match(content, /const exactSingleton = windowRoots\(\)\.filter\(root => panelMatchesCommand\(root, plan\.command\)\)/);
  assert.match(content, /if \(exactSingleton\.length === 1\) return exactSingleton\[0\]/);
  assert.doesNotMatch(content, /titles\.some\(title => text\.includes\(title\)\)/);
});

test("page-world panel actions synchronize their exact DOM target across isolated worlds", () => {
  const content = read("extension/content.js");
  const mainWorld = read("extension/main-world.js");
  assert.match(content, /panel\.dataset\.godelVoicePanel = id/);
  assert.match(content, /requestAnimationFrame\(\(\) => \{/);
  assert.match(content, /window\.dispatchEvent\(new CustomEvent\("godel-voice:panel-action"/);
  assert.match(content, /function nativeWindowRoot\(panel\)/);
  assert.match(content, /const nativeRoot = nativeWindowRoot\(panel\)/);
  assert.match(content, /target_id: \(nativeRoot \?\? panel\)\.id \|\| null/);
  assert.match(content, /Godel native window target is unavailable or ambiguous/);
  assert.match(content, /!panel\.isConnected/);
  assert.match(content, /Godel \$\{openedPanel\.step\.command\} exact receipted window is unavailable for layout/);
  assert.match(mainWorld, /document\.getElementById\(targetId\)/);
  assert.match(mainWorld, /stableRoot \?\? targeted/);
  assert.match(mainWorld, /document\.querySelector\(selector\)/);
});

test("configured equity screeners reuse Godel's singleton panel", () => {
  const content = read("extension/content.js");
  assert.match(content, /plan\.command === "EQS" && \(plan\.actions \?\? \[\]\)\.length/);
  assert.match(content, /existingEQS\.length === 1/);
  assert.match(content, /for \(const action of plan\.actions\) await executeEQS\(panel, action\)/);
  assert.match(content, /Expected at most one existing EQS panel/);
});

test("workflow layout failures retain completed step timings and an exact layout failure", () => {
  const content = read("extension/content.js");
  const mainWorld = read("extension/main-world.js");
  assert.match(content, /step_id: "workflow-layout"/);
  assert.match(content, /operation: "layout"/);
  assert.match(content, /status: "skipped"/);
  assert.match(content, /I couldn't finish the requested placement/);
  assert.match(content, /panelInternalAction\(directWindow, "LAYOUT", "setGeometry"/);
  assert.match(content, /document\.getElementById\("godel-voice-workspace-anchor"\)/);
  assert.match(content, /panelInternalAction\(root, "WORKSPACE", action, payload\)/);
  assert.match(mainWorld, /action === "setWindowGeometry"/);
});

test("workflow layout binds geometry to the exact workspace window returned by each command", () => {
  const content = read("extension/content.js");
  assert.match(content, /opened\.push\(\{ step, panel, workspaceWindowId, workspaceWindowError \}\)/);
  assert.match(content, /workspaceInternalAction\("activeWindowIds"\)/);
  assert.doesNotMatch(content, /windowId: activeIds\[0\]/);
  assert.doesNotMatch(content, /\?\? activeIds\[0\]/);
  assert.match(content, /const exactWindow = openedPanel\.workspaceWindowId/);
  assert.match(content, /panelById\(openedPanel\.workspaceWindowId\)/);
  assert.match(content, /const capturedWindow = nativeWindowRoot\(openedPanel\.panel\)/);
  assert.match(content, /const directWindow = exactWindow \?\? capturedWindow/);
  assert.match(content, /panelInternalAction\(directWindow, "LAYOUT", "setGeometry", placement\.rect\)/);
  assert.match(content, /workspaceInternalAction\("setWindowGeometry"/);
  assert.doesNotMatch(content, /let livePanel = candidates\[0\] \?\? null/);
  assert.match(content, /exact receipted window is unavailable for layout/);
});
test("workflow lease suppresses the browser start voice when premium speech is available", () => {
  const content = read("extension/content.js");
  assert.match(content, /toast\("Godel Voice: On it"\)/);
  assert.match(content, /new SpeechSynthesisUtterance\("On it\."\)/);
  assert.match(content, /startSpeechTimer = setTimeout/);
  assert.match(content, /clearStartAcknowledgement\(true\)/);
  assert.match(content, /emitStartAcknowledgement\(payload\.premium_voice === true\)/);
  assert.match(content, /if \(premiumVoice \|\| config\.spokenFeedback === false/);
  assert.doesNotMatch(content, /await emitStartAcknowledgement/);
});

test("loopback credentials and plan bodies are not placed in process arguments or request URLs", () => {
  const delivery = read("bin/voiceink-deliver");
  const content = read("extension/content.js");
  assert.match(delivery, /godel-voice-curl\.XXXXXX/);
  assert.match(delivery, /--data-binary @-/);
  assert.doesNotMatch(delivery, /health\?token=/);
  assert.doesNotMatch(delivery, /--data-binary "\$marker"/);
  assert.doesNotMatch(content, /token=\$\{encodeURIComponent\(config\.secret\)\}/);
});

test("VoiceInk timing telemetry does not launch clock subprocesses on the request path", () => {
  const delivery = read("bin/voiceink-deliver");
  assert.match(delivery, /zmodload zsh\/datetime/);
  assert.match(delivery, /EPOCHREALTIME \* 1000/);
  assert.doesNotMatch(delivery, /node -e ['"]process\.stdout\.write\(String\(Date\.now\(\)\)\)/);
});

test("executor reports bounded workflow phases separately from command timings", () => {
  const content = read("extension/content.js");
  assert.match(content, /lifecycle_barrier_ms: lifecycleBarrierMs/);
  assert.match(content, /phases\.workspace_prepare_ms/);
  assert.match(content, /phases\.layout_ms/);
  assert.match(content, /phases\.reconcile_ms/);
  assert.match(content, /result\.phases\.completion_fact_ms/);
  assert.match(content, /error\.workflowPhases/);
  assert.match(content, /error: error\?\.message \?\? "", message, steps, phases/);
});

test("service manager is persistent on macOS and only replaces this checkout's exact server", () => {
  const service = read("bin/godel-voice-service");
  const delivery = read("bin/voiceink-deliver");
  assert.match(service, /<key>RunAtLoad<\/key><true\/>/);
  assert.match(service, /<key>KeepAlive<\/key><true\/>/);
  assert.match(service, /Application Support\/GodelVoice/);
  assert.match(service, /cp -R "\$project_dir\/src\/\." "\$runtime_src\/"/);
  assert.match(service, /walk\("src"\)\.sort/);
  assert.match(service, /catalog\/commands\.json/);
  assert.match(service, /catalog\/schemas\/"\*\.json/);
  assert.match(service, /exact_server_pid/);
  assert.match(service, /Refusing to replace unrelated process/);
  assert.match(service, /head -1 \|\| true/);
  assert.match(delivery, /\$project_dir\/src\/handoff-server\.mjs/);
  assert.match(delivery, /instance_id/);
  assert.match(delivery, /build_id/);
});

test("event diagnostics rotate and never contain a queued plan body", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "godel-log-"));
  const logPath = path.join(directory, "events.jsonl");
  const store = new HandoffStore({ logPath, maxLogBytes: 80 });
  store.enqueue(`GV1:${JSON.stringify({ version: 1, command: "HMAP", arguments: [], actions: [] })}`);
  for (let index = 0; index < 8; index += 1) store.event("probe", { index });
  assert.equal(fs.existsSync(`${logPath}.1`), true);
  const combined = `${fs.readFileSync(logPath, "utf8")}\n${fs.readFileSync(`${logPath}.1`, "utf8")}`;
  assert.doesNotMatch(combined, /GV1:/);
  assert.doesNotMatch(combined, /HMAP/);
});

test("doctor covers protocol identity, private secrets, queue health and service registration", () => {
  const doctor = read("bin/doctor");
  assert.match(doctor, /protocol_version===4/);
  assert.match(doctor, /instance_id/);
  assert.match(doctor, /secret permissions are private/);
  assert.match(doctor, /persistent workflow queue is readable/);
  assert.match(doctor, /godel-voice-service.*status/);
  assert.match(doctor, /installed service secret is current and private/);
});
