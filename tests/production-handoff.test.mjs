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

test("executor queue polling is low-latency, overlap-safe, and still leases only after eligibility", () => {
  const content = read("extension/content.js");
  assert.match(content, /let polling = false/);
  assert.match(content, /if \(running \|\| polling\) return/);
  assert.match(content, /polling = true/);
  assert.match(content, /if \(!\(await eligibleExecutor\(\)\.catch\(\(\) => false\)\)\) return/);
  assert.match(content, /finally \{ polling = false; \}/);
  assert.match(content, /setInterval\(poll, 100\)/);
});

test("command and nested-action execution use rendered postconditions instead of fixed settling sleeps", () => {
  const content = read("extension/content.js");
  assert.match(content, /Godel command bar value \$\{terminalCommand\}/);
  assert.match(content, /String\(currentInput\.value \?\? ""\)\.trim\(\) === terminalCommand/);
  assert.doesNotMatch(content, /pause\((?:120|180|220)\)/);
  assert.match(content, /new \$\{plan\.command\} panel`, 9000/);
  assert.match(content, /panelInternalAction\(panel, "GF", "addCompany"/);
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
  assert.match(content, /Godel \$\{openedPanel\.step\.command\} live window is unavailable for layout/);
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
  assert.match(content, /workspaceInternalAction\("setWindowGeometry"/);
  assert.match(content, /const root = windowRoots\(\)\[0\] \?\? document\.documentElement/);
  assert.match(mainWorld, /action === "setWindowGeometry"/);
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

test("service manager is persistent on macOS and only replaces this checkout's exact server", () => {
  const service = read("bin/godel-voice-service");
  const delivery = read("bin/voiceink-deliver");
  assert.match(service, /<key>RunAtLoad<\/key><true\/>/);
  assert.match(service, /<key>KeepAlive<\/key><true\/>/);
  assert.match(service, /Application Support\/GodelVoice/);
  assert.match(service, /src\/"\*\.mjs/);
  assert.match(service, /data\/commands\.json/);
  assert.match(service, /intent\.schema\.json/);
  assert.match(service, /workflow\.schema\.json/);
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
