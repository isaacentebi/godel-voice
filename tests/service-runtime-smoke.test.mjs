import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("service packaging resolves the installed dependency graph before restart", () => {
  const service = read("bin/godel-voice-service");
  assert.match(service, /Packaged Godel Voice runtime is incomplete/);
  assert.match(service, /pathToFileURL\(process\.argv\[2\]\)/);
  assert.match(service, /godel-voice-import-smoke/);
  assert.ok(service.indexOf("Packaged Godel Voice runtime is incomplete") < service.indexOf("touch \"$runtime_logs/server.stdout.log\""));
});

test("doctor verifies the installed graph and points to the live telemetry", () => {
  const doctor = read("bin/doctor");
  assert.match(doctor, /installed runtime dependency graph loads cleanly/);
  assert.match(doctor, /installed runtime is incomplete/);
  assert.match(doctor, /live telemetry:/);
  assert.match(doctor, /Application Support\/GodelVoice/);
});
