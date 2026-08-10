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
  assert.match(upstreamSession, /\"interrupt_response\":false/);
  assert.match(upstreamSession, /\"gpt-4o-transcribe\"/);
  assert.doesNotMatch(upstreamSession, /run_godel_workflow|wait_for_user/);

  const tool = await fetch(`${base}/realtime/request`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, call_id: "call-1", workflow: structuredWorkflow() })
  });
  assert.equal(tool.status, 202);
  const queued = await tool.json();
  assert.equal(queued.kind, "execute");
  assert.equal(queued.workflow_timeout_ms, 30_000);
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
  assert.deepEqual(checkIn, { kind: "conversation", message: "I'm here." });

  const thanksWorkflow = structuredWorkflow("User is acknowledging with thanks. No action requested.");
  thanksWorkflow.workflow.kind = "unsupported";
  thanksWorkflow.workflow.steps = [];
  thanksWorkflow.workflow.reason = "Conversation only";
  const thanks = await (await fetch(`${base}/realtime/request`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, call_id: "call-thanks", workflow: thanksWorkflow })
  })).json();
  assert.deepEqual(thanks, { kind: "conversation", message: "Anytime." });

  const ideasWorkflow = structuredWorkflow("Jarvis, give me some ideas.");
  ideasWorkflow.workflow.kind = "unsupported";
  ideasWorkflow.workflow.steps = [];
  ideasWorkflow.workflow.reason = "Conversation only";
  const ideas = await (await fetch(`${base}/realtime/request`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, call_id: "call-ideas", workflow: ideasWorkflow })
  })).json();
  assert.equal(ideas.kind, "conversation");
  assert.match(ideas.message, /compare Amazon and Meta revenue/);
  assert.match(ideas.message, /search Meta earnings calls for AI agents/);

  const leased = await (await fetch(`${base}/next?client=arc-a`, { headers: auth })).json();
  assert.equal(leased.realtime, true);
  await fetch(`${base}/ack`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ id: queued.id, client_id: "arc-a", status: "completed", message: "Heatmap on screen." })
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(speakerCalls, []);
});

test("concurrent duplicate Realtime compilations share one queued workflow per endpoint", async t => {
  let workflowCompiles = 0;
  let preflightCompiles = 0;
  const delayed = () => new Promise(resolve => setTimeout(resolve, 20));
  const store = new HandoffStore();
  const server = createHandoffServer({
    secret, store, port: 0, realtimeEnabled: true, openaiApiKey: "private-openai-key",
    realtimeFetch: async () => new Response(answer, { status: 200, headers: { "Content-Type": "application/sdp" } }),
    realtimeWorkflowCompiler: async () => {
      workflowCompiles += 1;
      await delayed();
      return { kind: "execute", route: "slow-workflow", marker: `GV1:${JSON.stringify({ version: 1, command: "HMAP", arguments: [], actions: [] })}` };
    },
    realtimeNaturalCompiler: async () => {
      preflightCompiles += 1;
      await delayed();
      return { kind: "execute", route: "slow-preflight", marker: `GV1:${JSON.stringify({ version: 1, command: "HALT", arguments: [], actions: [] })}` };
    }
  });
  const address = await server.listen();
  t.after(() => server.close());
  const base = `http://127.0.0.1:${address.port}`;
  const sessionResponse = await fetch(`${base}/realtime/session`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/sdp" }, body: offer
  });
  const sessionId = sessionResponse.headers.get("x-godel-realtime-session");

  const workflowBodies = ["parallel-workflow-a", "parallel-workflow-b"].map(callId => fetch(`${base}/realtime/request`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, call_id: callId, workflow: structuredWorkflow("open the slow custom dashboard") })
  }).then(response => response.json()));
  const workflowResults = await Promise.all(workflowBodies);
  assert.equal(workflowCompiles, 1);
  assert.equal(workflowResults[0].id, workflowResults[1].id);
  assert.equal(store.entries.length, 1);
  store.cancel(workflowResults[0].id);

  const preflightBodies = ["parallel-preflight-a", "parallel-preflight-b"].map(turnId => fetch(`${base}/realtime/preflight`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, turn_id: turnId, transcript: "open the bespoke liquidity constellation" })
  }).then(response => response.json()));
  const preflightResults = await Promise.all(preflightBodies);
  assert.equal(preflightCompiles, 1);
  assert.equal(preflightResults[0].id, preflightResults[1].id);
  assert.equal(store.entries.length, 2);
  const serverSource = fs.readFileSync(new URL("../src/handoff-server.mjs", import.meta.url), "utf8");
  assert.match(serverSource, /const key = `\$\{lane\}:\$\{markerDigest\(normalizedRealtimeRequest\(requestText\)\)\}`/);
});

test("closing Realtime during delayed compilation cannot enqueue late work on either endpoint", async t => {
  let releaseWorkflow;
  let releasePreflight;
  let markWorkflowStarted;
  let markPreflightStarted;
  const workflowGate = new Promise(resolve => { releaseWorkflow = resolve; });
  const preflightGate = new Promise(resolve => { releasePreflight = resolve; });
  const workflowStarted = new Promise(resolve => { markWorkflowStarted = resolve; });
  const preflightStarted = new Promise(resolve => { markPreflightStarted = resolve; });
  const marker = `GV1:${JSON.stringify({ version: 1, command: "HMAP", arguments: [], actions: [] })}`;
  const store = new HandoffStore();
  const server = createHandoffServer({
    secret, store, port: 0, realtimeEnabled: true, openaiApiKey: "private-openai-key",
    realtimeFetch: async () => new Response(answer, { status: 200, headers: { "Content-Type": "application/sdp" } }),
    realtimeWorkflowCompiler: async () => {
      markWorkflowStarted();
      await workflowGate;
      return { kind: "execute", route: "delayed-workflow", marker };
    },
    realtimeNaturalCompiler: async () => {
      markPreflightStarted();
      await preflightGate;
      return { kind: "execute", route: "delayed-preflight", marker };
    }
  });
  const address = await server.listen();
  t.after(() => server.close());
  const base = `http://127.0.0.1:${address.port}`;
  const createSession = async () => {
    const response = await fetch(`${base}/realtime/session`, {
      method: "POST", headers: { ...auth, "Content-Type": "application/sdp" }, body: offer
    });
    assert.equal(response.status, 200);
    return response.headers.get("x-godel-realtime-session");
  };
  const closeSession = sessionId => fetch(`${base}/realtime/close`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, reason: "manual_toggle" })
  });

  const workflowSession = await createSession();
  const pendingWorkflow = fetch(`${base}/realtime/request`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: workflowSession, call_id: "late-workflow",
      workflow: structuredWorkflow("open the slow custom dashboard")
    })
  });
  await workflowStarted;
  assert.equal((await closeSession(workflowSession)).status, 200);
  releaseWorkflow();
  const workflowResult = await (await pendingWorkflow).json();
  assert.equal(workflowResult.kind, "failed");
  assert.match(workflowResult.message, /session ended before the request could start/);
  assert.equal(store.entries.length, 0);

  const preflightSession = await createSession();
  const pendingPreflight = fetch(`${base}/realtime/preflight`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: preflightSession, turn_id: "late-preflight",
      transcript: "open the bespoke liquidity constellation"
    })
  });
  await preflightStarted;
  assert.equal((await closeSession(preflightSession)).status, 200);
  releasePreflight();
  const preflightResult = await (await pendingPreflight).json();
  assert.equal(preflightResult.kind, "failed");
  assert.match(preflightResult.message, /session ended before the request could start/);
  assert.equal(store.entries.length, 0);
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
  assert.equal(first.workflow_timeout_ms, 30_000);
  assert.equal(first.progress_message, undefined);
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
  assert.deepEqual(checkIn, { kind: "conversation", message: "I'm here." });

  const capabilities = await (await fetch(`${base}/realtime/preflight`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, turn_id: "turn-capabilities", transcript: "What else can you do?" })
  })).json();
  assert.deepEqual(capabilities, {
    kind: "conversation",
    message: "Try: compare Amazon and Meta revenue, screen U.S. technology above ten billion, search Meta earnings calls for AI agents, open the VIX chart, or build me a market desk."
  });

  const unsupportedComparison = await (await fetch(`${base}/realtime/preflight`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      turn_id: "turn-operating-income",
      transcript: "Close everything and open a chart comparing Amazon and Meta operating income and revenue for five years"
    })
  })).json();
  assert.deepEqual(unsupportedComparison, {
    kind: "clarify",
    message: "Godel's fundamentals graph does not expose operating income. Shall I compare revenue and operating margin instead?"
  });

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

test("Realtime sessions and preflights retain exact executor and document affinity", async t => {
  const owner = "gx-realtime-owner";
  const generation = "gd-realtime-document";
  const store = new HandoffStore();
  store.setContext({ focused_panel: { command: "GF", security: "META" } }, owner, generation);
  const server = createHandoffServer({
    secret, store, port: 0, realtimeEnabled: true, openaiApiKey: "private-openai-key",
    realtimeFetch: async () => new Response(answer, { status: 200, headers: { "Content-Type": "application/sdp" } })
  });
  const address = await server.listen();
  t.after(() => server.close());
  const base = `http://127.0.0.1:${address.port}`;
  const sessionResponse = await fetch(`${base}/realtime/session`, {
    method: "POST",
    headers: {
      ...auth, "Content-Type": "application/sdp",
      "X-Godel-Executor-Id": owner, "X-Godel-Document-Generation": generation
    },
    body: offer
  });
  assert.equal(sessionResponse.status, 200);
  const sessionId = sessionResponse.headers.get("x-godel-realtime-session");
  const request = {
    session_id: sessionId, turn_id: "affinity-turn", transcript: "open the market heatmap",
    executor_id: owner, document_generation: generation
  };

  const stale = await fetch(`${base}/realtime/preflight`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ ...request, document_generation: "gd-stale-document" })
  });
  assert.equal(stale.status, 409);

  const prepared = await (await fetch(`${base}/realtime/preflight`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(request)
  })).json();
  assert.equal(prepared.kind, "execute");
  assert.equal((await fetch(`${base}/next?client=gx-other-owner&executor=gx-other-owner&generation=gd-other`, {
    headers: auth
  })).status, 204);
  const leased = await (await fetch(`${base}/next?client=${owner}&executor=${owner}&generation=${generation}`, {
    headers: auth
  })).json();
  assert.equal(leased.id, prepared.id);

  const ownerB = "gx-realtime-owner-b";
  const generationB = "gd-realtime-document-b";
  const secondSession = await fetch(`${base}/realtime/session`, {
    method: "POST",
    headers: {
      ...auth, "Content-Type": "application/sdp",
      "X-Godel-Executor-Id": ownerB, "X-Godel-Document-Generation": generationB
    },
    body: offer
  });
  assert.equal(secondSession.status, 200);
  assert.equal(store.armedExecutor().executor_id, ownerB);
  const oldOwnerRetry = await fetch(`${base}/realtime/preflight`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ ...request, turn_id: "old-owner-retry" })
  });
  assert.equal(oldOwnerRetry.status, 409);
  assert.match((await oldOwnerRetry.json()).error, /another Godel tab/);
  assert.equal(store.armedExecutor().executor_id, ownerB);
});

test("Realtime reconnects preserve bounded verified continuity and retry the last exact plan", async t => {
  const owner = "gx-continuity-owner";
  const generation = "gd-continuity-document";
  const store = new HandoffStore();
  store.setContext({ focused_panel: null, last_panel: null, panels: [] }, owner, generation);
  const server = createHandoffServer({
    secret, store, port: 0, realtimeEnabled: true, openaiApiKey: "private-openai-key",
    realtimeFetch: async () => new Response(answer, { status: 200, headers: { "Content-Type": "application/sdp" } })
  });
  const address = await server.listen();
  t.after(() => server.close());
  const base = `http://127.0.0.1:${address.port}`;
  const sessionHeaders = {
    ...auth, "Content-Type": "application/sdp",
    "X-Godel-Executor-Id": owner, "X-Godel-Document-Generation": generation
  };
  const firstSessionResponse = await fetch(`${base}/realtime/session`, {
    method: "POST", headers: sessionHeaders, body: offer
  });
  const firstSession = firstSessionResponse.headers.get("x-godel-realtime-session");
  const first = await (await fetch(`${base}/realtime/preflight`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: firstSession, turn_id: "open-1", transcript: "open the market heatmap",
      executor_id: owner, document_generation: generation })
  })).json();
  const leased = await (await fetch(`${base}/next?client=${owner}&executor=${owner}&generation=${generation}`, {
    headers: auth
  })).json();
  assert.equal(leased.id, first.id);
  const acknowledged = await fetch(`${base}/ack`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ id: leased.id, client_id: owner, executor_id: owner,
      document_generation: generation, status: "completed", message: "Heatmap opened." })
  });
  assert.equal(acknowledged.status, 200);

  const beforeReconnect = await (await fetch(`${base}/realtime/preflight`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: firstSession, turn_id: "recall-1", transcript: "what did you open",
      executor_id: owner, document_generation: generation })
  })).json();
  assert.deepEqual(beforeReconnect, { kind: "conversation", message: "Heatmap opened." });

  const secondSessionResponse = await fetch(`${base}/realtime/session`, {
    method: "POST", headers: sessionHeaders, body: offer
  });
  const secondSession = secondSessionResponse.headers.get("x-godel-realtime-session");
  const afterReconnect = await (await fetch(`${base}/realtime/preflight`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: secondSession, turn_id: "recall-2", transcript: "what did you open",
      executor_id: owner, document_generation: generation })
  })).json();
  assert.deepEqual(afterReconnect, { kind: "conversation", message: "Heatmap opened." });

  const retried = await (await fetch(`${base}/realtime/preflight`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: secondSession, turn_id: "retry-1", transcript: "try that again",
      executor_id: owner, document_generation: generation })
  })).json();
  assert.equal(retried.kind, "execute");
  assert.equal(retried.route, "local_retry");
  assert.notEqual(retried.id, first.id);
});

test("manually stopping Realtime cancels its queued workflows server-side", async t => {
  const owner = "gx-close-owner";
  const generation = "gd-close-document";
  const store = new HandoffStore();
  const server = createHandoffServer({
    secret, store, port: 0, realtimeEnabled: true, openaiApiKey: "private-openai-key",
    realtimeFetch: async () => new Response(answer, { status: 200, headers: { "Content-Type": "application/sdp" } })
  });
  const address = await server.listen();
  t.after(() => server.close());
  const base = `http://127.0.0.1:${address.port}`;
  const sessionResponse = await fetch(`${base}/realtime/session`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/sdp",
      "X-Godel-Executor-Id": owner, "X-Godel-Document-Generation": generation }, body: offer
  });
  const sessionId = sessionResponse.headers.get("x-godel-realtime-session");
  const prepared = await (await fetch(`${base}/realtime/preflight`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, turn_id: "close-active", transcript: "open the market heatmap",
      executor_id: owner, document_generation: generation })
  })).json();
  assert.equal(store.status(prepared.id).status, "queued");
  const closed = await fetch(`${base}/realtime/close`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, reason: "manual_toggle" })
  });
  assert.equal(closed.status, 200);
  assert.equal(store.status(prepared.id).status, "cancelled");
  assert.equal(store.armedExecutor(), null);
});

test("Realtime heartbeat keeps an exact executor lease alive and stale sessions release it", async t => {
  let now = 1_800_000_000_000;
  const clock = () => now;
  const owner = "gx-heartbeat-owner";
  const generation = "gd-heartbeat-document";
  const store = new HandoffStore({ clock });
  const server = createHandoffServer({
    secret, store, port: 0, realtimeEnabled: true, openaiApiKey: "private-openai-key", clock,
    realtimeFetch: async () => new Response(answer, { status: 200, headers: { "Content-Type": "application/sdp" } })
  });
  const address = await server.listen();
  t.after(() => server.close());
  const base = `http://127.0.0.1:${address.port}`;
  const sessionResponse = await fetch(`${base}/realtime/session`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/sdp",
      "X-Godel-Executor-Id": owner, "X-Godel-Document-Generation": generation }, body: offer
  });
  const sessionId = sessionResponse.headers.get("x-godel-realtime-session");
  assert.equal(store.armedExecutor().executor_id, owner);

  now += 100_000;
  const heartbeat = await fetch(`${base}/realtime/heartbeat`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, executor_id: owner, document_generation: generation })
  });
  assert.equal(heartbeat.status, 200);
  const wrongAffinity = await fetch(`${base}/realtime/heartbeat`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, executor_id: owner, document_generation: "gd-wrong" })
  });
  assert.equal(wrongAffinity.status, 409);

  now += 100_000;
  assert.equal((await fetch(`${base}/next?client=gx-other&executor=gx-other&generation=gd-other`, {
    headers: auth
  })).status, 204);
  assert.equal(store.armedExecutor().executor_id, owner);

  now += 21_000;
  assert.equal((await fetch(`${base}/next?client=gx-other&executor=gx-other&generation=gd-other`, {
    headers: auth
  })).status, 204);
  assert.equal(store.armedExecutor(), null);
  assert.equal((await fetch(`${base}/realtime/heartbeat`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, executor_id: owner, document_generation: generation })
  })).status, 404);
});

test("server startup never restores a pinned executor whose Realtime connection is gone", () => {
  const store = new HandoffStore();
  store.armExecutor("gx-dead-session", "gd-dead-document");
  assert.equal(store.armedPinned, true);
  const server = createHandoffServer({ secret, store, port: 0 });
  assert.equal(store.armedExecutor(), null);
  server.close();
});

test("Realtime browser surface contains no provider credential and has bounded teardown", () => {
  const source = fs.readFileSync(new URL("../extension/realtime.js", import.meta.url), "utf8");
  const serverSource = fs.readFileSync(new URL("../src/handoff-server.mjs", import.meta.url), "utf8");
  const manifest = JSON.parse(fs.readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));
  assert.equal(source.includes("OPENAI_API_KEY"), false);
  assert.equal(source.includes("sk-proj-"), false);
  assert.match(source, /getUserMedia/);
  assert.match(source, /track\.stop\(\)/);
  assert.doesNotMatch(source, /run_godel_workflow/);
  assert.doesNotMatch(source, /Jarvis online/);
  assert.match(source, /Ready when you are/);
  assert.match(source, /\.shell\[data-collapsed="true"\]\s*\{[^}]*opacity:\.55/);
  assert.match(source, /\.shell\[data-collapsed="true"\] \.copy\s*\{display:none/);
  assert.match(source, /function setIdleCollapsed\(collapsed\)/);
  assert.match(source, /setIdleCollapsed\(next === "ready"\)/);
  assert.match(source, /mouseenter[\s\S]{0,100}setIdleCollapsed\(false\)/);
  assert.match(source, /mouseleave[\s\S]{0,100}setIdleCollapsed\(true\)/);
  assert.match(source, /transcriptionConfidence/);
  assert.match(source, /request\.kind === "ignore"/);
  assert.match(source, /response_audio_after_transcript/);
  assert.match(source, /else if \(responseRequestedAt\) render\("thinking", "Responding"\)/);
  assert.match(source, /transcription_after_stop/);
  assert.match(source, /I didn't catch that · say it again/);
  assert.doesNotMatch(source, /render\("error", "I couldn't transcribe/);
  assert.match(source, /tool_choice: "none"/);
  assert.doesNotMatch(source, /toolWatchdog|armToolWatchdog/);
  assert.match(source, /user_transcript/);
  assert.match(source, /tool_result/);
  assert.doesNotMatch(source, /track\.enabled = enabled/);
  assert.match(source, /\/realtime\/preflight/);
  assert.match(source, /TURN_GRACE_MS = 120/);
  assert.match(source, /WORKFLOW_FAST_POLL_MS = 50/);
  assert.match(source, /WORKFLOW_FAST_POLL_WINDOW_MS = 1_000/);
  assert.match(source, /WORKFLOW_POLL_MS = 160/);
  assert.match(source, /realtimeState\.workflowPollDelay/);
  assert.match(source, /PREFLIGHT_RETRY_MS = 120/);
  assert.match(source, /SESSION_ROLLOVER_MS = 50 \* 60_000/);
  assert.match(source, /SESSION_HEARTBEAT_MS = 20_000/);
  assert.match(source, /\/realtime\/heartbeat/);
  assert.match(source, /scheduleSessionRollover/);
  assert.match(source, /provider_session_rollover/);
  assert.match(source, /error\?\.status === 404/);
  assert.match(source, /coordinator\.enqueueTurn\(\{ transcript, turnId \}, \{ front: true \}\)/);
  assert.match(source, /local_session_lost/);
  assert.match(source, /\/status\?id=/);
  assert.match(source, /new Set\(\["completed", "failed", "cancelled"\]\)/);
  assert.match(source, /Suppressed unsolicited Realtime audio/);
  assert.match(source, /audio\.muted = true/);
  assert.match(source, /type: "response\.cancel"/);
  assert.doesNotMatch(source, /wait_for_user/);
  assert.match(source, /auditAssistantTranscript/);
  assert.match(source, /createConversationResponse/);
  assert.doesNotMatch(source, /event\.key === "Escape"/);
  assert.match(source, /"clarify", "unsupported", "failed", "busy"/);
  assert.match(source, /FAST_RECONNECT_ATTEMPTS = 3/);
  assert.match(source, /MAX_RECONNECT_DELAY_MS = 5_000/);
  assert.doesNotMatch(source, /reconnect_exhausted/);
  assert.match(source, /scheduleReconnect/);
  assert.match(source, /preserveMicrophone: true/);
  assert.match(source, /preserveIntent: true/);
  assert.match(source, /ACTIVE_INTENT_KEY = "godel-voice:jarvis-active-v1"/);
  assert.match(source, /createIntentStore\(globalThis\.sessionStorage, ACTIVE_INTENT_KEY\)/);
  assert.match(source, /intentStore\.activate\(\)/);
  assert.match(source, /intentStore\.deactivate\(\)/);
  assert.match(source, /coordinator\.reset\(\{ preserveTurns: preserveWork, preserveResponses: preserveWork \}\)/);
  assert.match(source, /pagehide/);
  assert.match(source, /preserveIntent: intentStore\.isActive\(\)/);
  assert.match(source, /preserveWork: false/);
  assert.match(source, /suspendTransport: true/);
  assert.match(source, /keepalive: reason === "pagehide"/);
  assert.match(source, /pageshow/);
  assert.match(source, /if \(intentStore\.isActive\(\)\) \{[\s\S]*start\(\{ reconnecting: true \}\)/);
  assert.match(source, /track\.enabled = true/);
  assert.match(source, /data-channel[\s\S]*authoritative signal/);
  assert.match(source, /BARGE_IN_CONFIRM_MS = 280/);
  assert.match(source, /RESPONSE_START_TIMEOUT_MS = 4_000/);
  assert.match(source, /WORKFLOW_PROGRESS_DELAY_MS = 8_000/);
  assert.match(source, /scheduleWorkflowProgress\(request\.id, runGeneration, request\.progress_message\)/);
  assert.match(source, /if \(!message\) return/);
  assert.match(source, /exactResponse\(message, "workflow_progress"\)/);
  assert.doesNotMatch(source, /exactResponse\("Still working\."/);
  assert.match(source, /coordinator\.dropResponses/);
  assert.match(source, /cancelActiveResponse/);
  assert.match(source, /cancelActiveResponse\(\(\) => true\)/);
  assert.match(source, /if \(cancelledPendingResponse\) \{[\s\S]*clearResponseStartTimer\(\);[\s\S]*type: "response\.cancel"/);
  assert.doesNotMatch(source, /audio\.volume = 0\.15/);
  assert.match(source, /audio\.volume = 1/);
  assert.match(source, /responseStarted/);
  assert.match(source, /failed\.audible !== true/);
  assert.match(source, /audio\.muted = true;[\s\S]*peer\.ontrack/);
  assert.match(source, /channel\?\.readyState === "open" && !assistantSpeaking/);
  assert.match(source, /coordinator\.releaseDeferredResponses\(\)/);
  assert.match(source, /preserveResponses && activeResponse && activeResponse\.audible !== true/);
  assert.match(source, /recoverableGenerations\.has\(runGeneration\)/);
  assert.match(source, /preserveWork && !suspendTransport/);
  assert.match(source, /cancelWorkflow\(id\)/);
  assert.match(serverSource, /realtime_session_superseded/);
  assert.doesNotMatch(serverSource, /sameAffinitySessions\.length >= 3/);
  assert.doesNotMatch(source, /visibilityState === "hidden" && peer\) teardown/);
  assert.match(source, /"godel-voice:session-state"/);
  assert.match(source, /detail: \{ active: true, reconnecting \}/);
  assert.match(source, /detail: \{ active: false, reason \}/);
  assert.ok(manifest.content_scripts[0].js.includes("realtime.js"));
});

test("verified successes are spoken exactly and first-audio latency is audited separately", () => {
  const source = fs.readFileSync(new URL("../extension/realtime.js", import.meta.url), "utf8");
  assert.match(source, /String\(output\?\.status \?\? ""\) === "completed"/);
  assert.match(source, /exactResponse\(exact, "grounded_result"\)/);
  assert.match(source, /responseRequestKind \?\? "response"/);
  assert.match(source, /Date\.now\(\) - responseRequestedAt/);
  assert.match(source, /max_output_tokens: 64/);
  assert.equal(source.match(/conversation: "none", input: \[\]/g)?.length, 2,
    "exact and grounded speech both stay outside the default conversation");
  assert.match(source, /return await api\("\/realtime\/preflight", options\)/);
  assert.match(source, /error\?\.status && error\.status < 500/);
});

test("audible buffer completion releases the response queue without waiting for response.done", () => {
  const source = fs.readFileSync(new URL("../extension/realtime.js", import.meta.url), "utf8");
  const stopped = source.slice(source.indexOf('event.type === "output_audio_buffer.stopped"'),
    source.indexOf('event.type === "error"'));
  assert.match(stopped, /coordinator\.responseDone\(event\.response_id \?\? null\)/);
});
