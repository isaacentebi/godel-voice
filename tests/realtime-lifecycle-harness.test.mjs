import assert from "node:assert/strict";
import test from "node:test";
import { runRealtimeLifecycleHarness } from "../evals/realtime-lifecycle-harness.mjs";

test("synthetic Realtime lifecycle reaches one grounded spoken completion", async () => {
  const report = await runRealtimeLifecycleHarness({
    transcript: "open the market heatmap",
    executionMs: 10,
    transcriptionMs: 10,
    synthesisMs: 5
  });

  assert.equal(report.pass, true);
  assert.deepEqual(report.workflow.commands, ["HMAP"]);
  assert.equal(report.spoken_completion, "HMAP completed.");
  assert.equal(report.event_counts.spoken_responses, 1);
  assert.equal(report.coverage.browser_realtime_state_machine, true);
  assert.equal(report.coverage.provider_speech_recognition, false);
  assert.ok(report.latency_ms.transcript_to_response_create < 2_000);
  assert.ok(report.render_states.includes("working"));
  assert.ok(report.render_states.includes("speaking"));
});
