import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compileMarkerRequest, writeVoiceInkCompileTelemetry } from "../src/compile-marker.mjs";
import { compileStructuredWorkflow, resolveProviderResponseMode } from "../src/compiler.mjs";
import { voiceWorkflowSchema } from "../src/prompt.mjs";
import { parseWorkflowMarker } from "../src/workflow-plan.mjs";

function collectSchemaKeywords(value, keywords, path = "#", found = []) {
  if (!value || typeof value !== "object") return found;
  for (const [key, child] of Object.entries(value)) {
    if (keywords.has(key)) found.push(`${path}/${key}`);
    collectSchemaKeywords(child, keywords, `${path}/${key}`, found);
  }
  return found;
}

test("workflow inference schema avoids conditional constructs rejected by fast providers", () => {
  assert.deepEqual(collectSchemaKeywords(
    voiceWorkflowSchema,
    new Set(["allOf", "if", "then", "else", "not", "uniqueItems"])
  ), []);
});

test("OpenRouter pins with limited schema support use JSON mode plus local validation", () => {
  for (const providerOnly of ["groq", "cerebras", "Groq,Cerebras"]) {
    assert.deepEqual(resolveProviderResponseMode({
      baseUrl: "https://openrouter.ai/api/v1",
      requestedMode: "json_schema",
      providerOnly
    }), {
      requested: "json_schema",
      effective: "json_object",
      compatibilityFallback: true
    });
  }
  assert.equal(resolveProviderResponseMode({
    baseUrl: "https://openrouter.ai/api/v1",
    requestedMode: "json_schema",
    providerOnly: "openai"
  }).effective, "json_schema");
  assert.equal(resolveProviderResponseMode({
    baseUrl: "https://api.openai.com/v1",
    requestedMode: "json_schema",
    providerOnly: "groq"
  }).effective, "json_schema");
});

test("JSON compatibility mode cannot bypass deterministic action validation", () => {
  const invalid = {
    kind: "execute", confidence: 0.9,
    steps: [{
      step_kind: "command", command: "EQS", control_operation: null,
      control_target: null, control_value: null, configure_target: null,
      security: null, query: null, arguments: [], required: true, placement: null,
      post_open_actions: [{
        feature: "range_filter", operation: "add",
        value: { field: "Sector", items: ["Technology"] }
      }]
    }],
    layout: { preset: "grid", preserve_existing: false, new_screen: false },
    clarification: null, reason: "Invalid mismatched filter shape."
  };
  const compiled = compileStructuredWorkflow(invalid, "screen for technology companies");
  assert.equal(compiled.plan, null);
  assert.match(compiled.plan_error, /EQS range value/i);
});

test("workflow repair resolves redundant model actions without weakening live allowlists", () => {
  const security = { spoken_name: "amazon", ticker: "AMZN", venue: "US", asset_class: "EQ", needs_resolution: false };
  const step = (command, post_open_actions = []) => ({
    step_kind: "command", command, security: ["MOST", "HMAP"].includes(command) ? null : security,
    query: null, arguments: [], post_open_actions, required: true, placement: null
  });
  const compiled = compileStructuredWorkflow({
    kind: "execute", confidence: 0.9,
    steps: [
      step("HMAP"),
      step("MOST", [{ feature: "ranking", operation: "select", value: "active" }]),
      step("DES"), step("EM"), step("EM"), step("CF")
    ],
    layout: { preset: "market", preserve_existing: false, new_screen: true },
    clarification: null, reason: "Market and research workspace."
  }, "open a heat map and most active stocks then Amazon description earnings matrix estimates and filings", {
    resolvedEntities: [security]
  });
  assert.equal(compiled.plan_error, null);
  assert.deepEqual(compiled.workflow.steps.map(item => item.command), ["HMAP", "MOST", "DES", "EM", "ERN", "CF"]);
  assert.deepEqual(compiled.workflow.steps[1].post_open_actions, []);
});

test("one panel requested on both sides without duplication clarifies deterministically", () => {
  const compiled = compileStructuredWorkflow({
    kind: "execute", confidence: 0.8,
    steps: [{
      step_kind: "command", command: "G",
      security: { spoken_name: "amazon", ticker: "AMZN", venue: "US", asset_class: "EQ", needs_resolution: false },
      query: null, arguments: [], post_open_actions: [], required: true, placement: "left"
    }],
    layout: { preset: "grid", preserve_existing: false, new_screen: false },
    clarification: null, reason: "Chart requested."
  }, "put the Amazon chart on the left and also on the right but do not duplicate it");
  assert.equal(compiled.workflow.kind, "clarify");
  assert.equal(compiled.workflow.steps.length, 0);
  assert.match(compiled.workflow.clarification, /left or the right/i);
  assert.equal(compiled.plan, null);
});

test("VoiceInk comparison takes the zero-model route before network compilation", async () => {
  let modelCalls = 0;
  const compiled = await compileMarkerRequest(
    "compare Amazon and Meta operating margin and revenue over the last five years",
    {
      context: null,
      compile: async () => {
        modelCalls += 1;
        throw new Error("network compiler must not run for a deterministic comparison");
      }
    }
  );

  assert.equal(compiled.route, "local");
  assert.equal(modelCalls, 0);
  const plan = parseWorkflowMarker(compiled.marker);
  assert.equal(plan.steps[0].terminal_command, "AMZN EQ GF");
  assert.deepEqual(plan.steps[0].actions, [
    { feature: "range", operation: "select", value: "5Y" },
    { feature: "add company", operation: "add", value: "META" },
    { feature: "margin metric", operation: "add", value: "Operating Margin" },
    { feature: "add metric", operation: "add", value: "Revenue" }
  ]);
});

test("ambiguous requests still use the validated model route", async () => {
  let modelCalls = 0;
  const compiled = await compileMarkerRequest("look into Amazon for me", {
    context: null,
    compile: async () => {
      modelCalls += 1;
      return {
        workflow: { kind: "execute" },
        plan: {
          version: 2,
          failure_policy: "stop_on_any",
          layout: null,
          steps: [{
            id: "command-1", kind: "command", command: "DES",
            terminal_command: "AMZN EQ DES", security_query: null,
            arguments: [], actions: [], required: true,
            failure_policy: "stop", layout: null
          }]
        },
        inference: { model: "test-model" }
      };
    }
  });

  assert.equal(compiled.route, "model");
  assert.equal(modelCalls, 1);
  assert.equal(parseWorkflowMarker(compiled.marker).steps[0].command, "DES");
});

test("VoiceInk compiler telemetry records route latency without transcript or model payload", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "godel-voiceink-routing-"));
  const diagnosticsPath = path.join(directory, "routing.jsonl");
  writeVoiceInkCompileTelemetry(diagnosticsPath, {
    requestId: "request-123", route: "model", compileMs: 182.7
  });

  const record = JSON.parse(fs.readFileSync(diagnosticsPath, "utf8"));
  assert.deepEqual(Object.keys(record).sort(), [
    "at", "compile_ms", "event", "request_id", "route", "transcript_received"
  ]);
  assert.equal(record.event, "voiceink_compile");
  assert.equal(record.request_id, "request-123");
  assert.equal(record.transcript_received, true);
  assert.equal(record.route, "model");
  assert.equal(record.compile_ms, 183);
  assert.equal(fs.statSync(diagnosticsPath).mode & 0o777, 0o600);
});
