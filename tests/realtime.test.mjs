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

test("model output cannot retain old Jarvis windows unless the user explicitly asks", () => {
  const ordinary = compileRealtimeWorkflow(structuredWorkflow("open the heatmap"));
  assert.equal(parseWorkflowMarker(ordinary.marker).layout.preserve_existing, false);

  const alongside = compileRealtimeWorkflow(structuredWorkflow("keep this open and show the heatmap alongside it"));
  assert.equal(parseWorkflowMarker(alongside.marker).layout.preserve_existing, true);

  const ignoredModelPreference = structuredWorkflow("show the heatmap");
  ignoredModelPreference.workflow.layout.preserve_existing = true;
  assert.equal(
    parseWorkflowMarker(compileRealtimeWorkflow(ignoredModelPreference).marker).layout.preserve_existing,
    false
  );
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
  assert.match(upstreamSession, /low-latency audio layer/);
  assert.match(upstreamSession, /Jarvis/);
  assert.match(upstreamSession, /\"model\":\"gpt-realtime-2\.1-mini\"/);
  assert.doesNotMatch(upstreamSession, /\"reasoning\"/);
  assert.match(upstreamSession, /\"tools\":\[\]/);
  assert.match(upstreamSession, /\"tool_choice\":\"none\"/);
  assert.match(upstreamSession, /\"eagerness\":\"low\"/);
  assert.match(upstreamSession, /\"item\.input_audio_transcription\.logprobs\"/);
  assert.match(upstreamSession, /\"noise_reduction\":\{\"type\":\"far_field\"\}/);
  assert.match(upstreamSession, /\"create_response\":false/);
  assert.match(upstreamSession, /\"gpt-4o-transcribe\"/);
  assert.doesNotMatch(upstreamSession, /run_godel_workflow|wait_for_user/);

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

test("Realtime deterministic preflight executes common commands without a model turn", async t => {
  let now = 1_800_000_000_000;
  const clock = () => now;
  const store = new HandoffStore({ clock });
  const server = createHandoffServer({
    secret, store, port: 0, realtimeEnabled: true, openaiApiKey: "private-openai-key",
    realtimeAuditEnabled: false, clock,
    realtimeFetch: async () => new Response(answer, { status: 200, headers: { "Content-Type": "application/sdp" } }),
    realtimeNaturalCompiler: async requestText => requestText.includes("what should")
      ? { kind: "clarify", message: "Do you want a market, company, or research view?" }
      : { kind: "unsupported", message: "That is not a Godel request." }
  });
  const address = await server.listen();
  t.after(() => server.close());
  const base = `http://127.0.0.1:${address.port}`;
  const sessionResponse = await fetch(`${base}/realtime/session`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/sdp" }, body: offer
  });
  const sessionId = sessionResponse.headers.get("x-godel-realtime-session");
  const request = { session_id: sessionId, turn_id: "turn-1", transcript: "open the market heatmap" };
  const first = await (await fetch(`${base}/realtime/preflight`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(request)
  })).json();
  assert.equal(first.kind, "execute");
  assert.equal(first.route, "local_preflight");
  assert.match(first.id, /^rt-/);
  const replay = await (await fetch(`${base}/realtime/preflight`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(request)
  })).json();
  assert.deepEqual(replay, first);
  const leased = await (await fetch(`${base}/next?client=arc-preflight`, { headers: auth })).json();
  assert.equal(leased.id, first.id);
  assert.equal(leased.realtime, true);
  await fetch(`${base}/ack`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ id: leased.id, client_id: "arc-preflight", status: "completed", message: "Heatmap opened." })
  });

  // A repeated spoken command later in the same conversation is a new user
  // intent, not a permanent semantic replay of the first turn.
  now += 2_000;
  const repeated = await (await fetch(`${base}/realtime/preflight`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ ...request, turn_id: "turn-repeat" })
  })).json();
  assert.equal(repeated.kind, "execute");
  assert.notEqual(repeated.id, first.id);
  const repeatedLease = await (await fetch(`${base}/next?client=arc-preflight`, { headers: auth })).json();
  await fetch(`${base}/ack`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ id: repeatedLease.id, client_id: "arc-preflight", status: "completed", message: "Heatmap opened." })
  });

  const checkIn = await (await fetch(`${base}/realtime/preflight`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, turn_id: "turn-check-in", transcript: "Are you there?" })
  })).json();
  assert.deepEqual(checkIn, { kind: "conversation", message: "Yes, I'm here and listening." });

  const ambiguous = await (await fetch(`${base}/realtime/preflight`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, turn_id: "turn-2", transcript: "what should I look at next?" })
  })).json();
  assert.deepEqual(ambiguous, { kind: "clarify", message: "Do you want a market, company, or research view?" });

  const ambient = await (await fetch(`${base}/realtime/preflight`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, turn_id: "turn-ambient", transcript: "society is falling" })
  })).json();
  assert.deepEqual(ambient, { kind: "ignore" });

  const addressed = await (await fetch(`${base}/realtime/preflight`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, turn_id: "turn-addressed", transcript: "Jarvis, society is falling" })
  })).json();
  assert.deepEqual(addressed, { kind: "unsupported", message: "That is not a Godel request." });
});

test("Realtime browser surface contains no provider credential and has bounded teardown", () => {
  const source = fs.readFileSync(new URL("../extension/realtime.js", import.meta.url), "utf8");
  const manifest = JSON.parse(fs.readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));
  assert.equal(source.includes("OPENAI_API_KEY"), false);
  assert.equal(source.includes("sk-proj-"), false);
  assert.match(source, /getUserMedia/);
  assert.match(source, /track\.stop\(\)/);
  assert.doesNotMatch(source, /run_godel_workflow/);
  assert.doesNotMatch(source, /Jarvis online/);
  assert.match(source, /Ready when you are/);
  assert.match(source, /transcriptionConfidence/);
  assert.match(source, /request\.kind === "ignore"/);
  assert.match(source, /response_audio_after_transcript/);
  assert.match(source, /transcription_after_stop/);
  assert.match(source, /tool_choice: "none"/);
  assert.doesNotMatch(source, /toolWatchdog|armToolWatchdog/);
  assert.match(source, /user_transcript/);
  assert.match(source, /tool_result/);
  assert.match(source, /track\.enabled = enabled/);
  assert.match(source, /\/realtime\/preflight/);
  assert.match(source, /TURN_GRACE_MS = 325/);
  assert.doesNotMatch(source, /wait_for_user/);
  assert.match(source, /auditAssistantTranscript/);
  assert.match(source, /createConversationResponse/);
  assert.doesNotMatch(source, /event\.key === "Escape"/);
  assert.match(source, /"clarify", "unsupported", "failed", "busy"/);
  assert.match(source, /MAX_RECONNECT_ATTEMPTS = 3/);
  assert.match(source, /scheduleReconnect/);
  assert.match(source, /preserveMicrophone: true/);
  assert.match(source, /preserveIntent: true/);
  assert.doesNotMatch(source, /visibilityState === "hidden" && peer\) teardown/);
  assert.ok(manifest.content_scripts[0].js.includes("realtime.js"));
});
