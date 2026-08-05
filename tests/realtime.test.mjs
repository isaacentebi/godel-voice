import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { compileNaturalRequest } from "../src/compile-natural-request.mjs";
import { compileRealtimeWorkflow } from "../src/compile-realtime-workflow.mjs";
import { estimateRealtimeResponseCost } from "../src/realtime-cost.mjs";
import { createHandoffServer, HandoffStore } from "../src/handoff-server.mjs";
import { parseWorkflowMarker } from "../src/workflow-plan.mjs";

const secret = "test-secret";
const auth = { Authorization: `Bearer ${secret}`, Origin: "https://app.godelterminal.com" };
const offer = "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n";
const answer = "v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n";

function structuredWorkflow(originalRequest = "open the heatmap") {
  return {
    original_request: originalRequest,
    workflow: {
      kind: "execute", confidence: 0.98,
      steps: [{
        step_kind: "command", command: "HMAP", control_operation: null, control_target: null,
        control_value: null, configure_target: null, security: null, query: null, arguments: [],
        post_open_actions: [], required: true, placement: null
      }],
      layout: { preset: "market", preserve_existing: true, new_screen: false },
      clarification: null, reason: "Open market heatmap"
    }
  };
}

test("natural Realtime requests use the same deterministic Godel compiler first", async () => {
  const result = await compileNaturalRequest("open the market heatmap");
  assert.equal(result.kind, "execute");
  assert.equal(result.route, "local");
  assert.match(result.marker, /^GV2:/);
  await assert.rejects(() => compileNaturalRequest("GV2:{\"version\":2}"), /natural language/);
});

test("Realtime directly validates the exact failed compound request without a second model", () => {
  const request = "open a heatmap on the left side and an Amazon chart on the right side with operating margins and revenues";
  const workflow = structuredWorkflow(request);
  workflow.workflow.steps = [
    { ...workflow.workflow.steps[0], placement: "left" },
    {
      step_kind: "command", command: "GF", control_operation: null, control_target: null,
      control_value: null, configure_target: null,
      security: { spoken_name: "Amazon", ticker: "AMZN", venue: "US", asset_class: "EQ", needs_resolution: false },
      query: null, arguments: [], required: true, placement: "right",
      post_open_actions: [
        { feature: "margin metric", operation: "add", value: "Operating Margin" },
        { feature: "add metric", operation: "add", value: "Revenue" }
      ]
    }
  ];
  const result = compileRealtimeWorkflow(workflow);
  assert.equal(result.kind, "execute");
  assert.equal(result.route, "realtime_structured");
  const plan = parseWorkflowMarker(result.marker);
  assert.deepEqual(plan.steps.map(step => [step.command, step.layout?.placement]), [["HMAP", "left"], ["GF", "right"]]);
  assert.deepEqual(plan.steps[1].actions, workflow.workflow.steps[1].post_open_actions);
  assert.throws(() => compileRealtimeWorkflow({ ...workflow, unexpected: true }), /unknown wrapper field/);
});

test("Realtime cost accounting separates audio, text and cached categories", () => {
  const usage = {
    input_token_details: {
      text_tokens: 100, audio_tokens: 600,
      cached_tokens_details: { text_tokens: 50, audio_tokens: 100 }
    },
    output_token_details: { text_tokens: 40, audio_tokens: 1200 }
  };
  assert.deepEqual(estimateRealtimeResponseCost("gpt-realtime-2.1-mini", usage), {
    exact: true, usd: 0.029159, model: "gpt-realtime-2.1-mini"
  });
  assert.equal(estimateRealtimeResponseCost("unknown", usage).exact, false);
  assert.equal(estimateRealtimeResponseCost("gpt-realtime-2.1-mini", {}).exact, false);
});

test("server creates a key-isolated Realtime SDP session and queues only validated natural requests", async t => {
  let upstream = null;
  const speakerCalls = [];
  const store = new HandoffStore();
  const server = createHandoffServer({
    secret, store, port: 0, realtimeEnabled: true, openaiApiKey: "private-openai-key",
    realtimeFetch: async (url, options) => {
      upstream = { url, options };
      return new Response(answer, { status: 200, headers: { "Content-Type": "application/sdp" } });
    },
    realtimeWorkflowCompiler: async workflow => ({
      kind: "execute", route: "local",
      marker: `GV1:${JSON.stringify({ version: 1, command: workflow.original_request.includes("heatmap") ? "HMAP" : "HALT", arguments: [], actions: [] })}`
    }),
    speaker: { speak: async (...args) => speakerCalls.push(args) }
  });
  const address = await server.listen();
  t.after(() => server.close());
  const base = `http://127.0.0.1:${address.port}`;

  const sessionResponse = await fetch(`${base}/realtime/session`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/sdp" }, body: offer
  });
  assert.equal(sessionResponse.status, 200);
  assert.equal(await sessionResponse.text(), answer);
  const sessionId = sessionResponse.headers.get("x-godel-realtime-session");
  assert.match(sessionId, /^[0-9a-f-]{36}$/);
  assert.equal(upstream.url, "https://api.openai.com/v1/realtime/calls");
  assert.equal(upstream.options.headers.Authorization, "Bearer private-openai-key");
  assert.match(upstream.options.headers["OpenAI-Safety-Identifier"], /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify([...upstream.options.body]).includes("private-openai-key"), false);
  const upstreamSession = String([...upstream.options.body].find(([key]) => key === "session")?.[1]);
  assert.match(upstreamSession, /run_godel_workflow/);
  assert.match(upstreamSession, /Jarvis/);
  assert.match(upstreamSession, /\"effort\":\"low\"/);
  assert.match(upstreamSession, /\"tool_choice\":\"auto\"/);
  assert.match(upstreamSession, /\"eagerness\":\"auto\"/);

  const tool = await fetch(`${base}/realtime/request`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, call_id: "call-1", workflow: structuredWorkflow() })
  });
  assert.equal(tool.status, 202);
  const queued = await tool.json();
  assert.equal(queued.kind, "execute");
  const replay = await (await fetch(`${base}/realtime/request`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, call_id: "call-1", workflow: structuredWorkflow("different request") })
  })).json();
  assert.equal(replay.id, queued.id);
  const semanticReplay = await (await fetch(`${base}/realtime/request`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, call_id: "call-2", workflow: structuredWorkflow() })
  })).json();
  assert.equal(semanticReplay.id, queued.id);

  const checkInWorkflow = structuredWorkflow("User asked if I am here.");
  checkInWorkflow.workflow.kind = "unsupported";
  checkInWorkflow.workflow.steps = [];
  checkInWorkflow.workflow.reason = "Conversation only";
  const checkIn = await (await fetch(`${base}/realtime/request`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, call_id: "call-check-in", workflow: checkInWorkflow })
  })).json();
  assert.deepEqual(checkIn, { kind: "conversation", message: "Yes, I'm here and listening." });

  const thanksWorkflow = structuredWorkflow("User is acknowledging with thanks. No action requested.");
  thanksWorkflow.workflow.kind = "unsupported";
  thanksWorkflow.workflow.steps = [];
  thanksWorkflow.workflow.reason = "Conversation only";
  const thanks = await (await fetch(`${base}/realtime/request`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, call_id: "call-thanks", workflow: thanksWorkflow })
  })).json();
  assert.deepEqual(thanks, { kind: "conversation", message: "You're welcome. I'm still listening." });

  const leased = await (await fetch(`${base}/next?client=arc-a`, { headers: auth })).json();
  assert.equal(leased.realtime, true);
  await fetch(`${base}/ack`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ id: queued.id, client_id: "arc-a", status: "completed", message: "Heatmap on screen." })
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(speakerCalls, []);
});

test("Realtime browser surface contains no provider credential and has bounded teardown", () => {
  const source = fs.readFileSync(new URL("../extension/realtime.js", import.meta.url), "utf8");
  const manifest = JSON.parse(fs.readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));
  assert.equal(source.includes("OPENAI_API_KEY"), false);
  assert.equal(source.includes("sk-proj-"), false);
  assert.match(source, /getUserMedia/);
  assert.match(source, /track\.stop\(\)/);
  assert.match(source, /run_godel_workflow/);
  assert.doesNotMatch(source, /Jarvis online/);
  assert.match(source, /Ready when you are/);
  assert.match(source, /function_call_output/);
  assert.match(source, /tool_choice: "none"/);
  assert.match(source, /12_000/);
  assert.match(source, /user_transcript/);
  assert.match(source, /tool_result/);
  assert.match(source, /godel_context/);
  assert.match(source, /track\.enabled = enabled/);
  assert.match(source, /!\["connecting", "thinking", "working"\]\.includes\(state\)/);
  assert.match(source, /status is conversation/);
  assert.doesNotMatch(source, /visibilityState === "hidden" && peer\) teardown/);
  assert.ok(manifest.content_scripts[0].js.includes("realtime.js"));
});
