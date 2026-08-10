#!/usr/bin/env node

// Deterministic integration harness for the browser Realtime client. It runs
// the shipped extension code in a browser-shaped VM, drives a synthetic
// provider event trace, routes the transcript through the real local server,
// leases and acknowledges the resulting Godel workflow, and verifies that a
// grounded spoken response is requested. It intentionally does not claim to
// test OpenAI speech recognition or audio synthesis; those require a live
// provider/browser run and are reported as an explicit coverage gap.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createHandoffServer, HandoffStore, progressMessageForMarker } from "../src/handoff-server.mjs";
import { parseWorkflowMarker } from "../src/workflow-plan.mjs";

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const realtimeSource = fs.readFileSync(path.join(projectDir, "extension", "realtime.js"), "utf8");
const offer = "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n";
const answer = "v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n";

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function waitFor(predicate, { timeoutMs = 4_000, intervalMs = 5, message = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${message}`);
}

class HarnessElement extends EventTarget {
  constructor(tagName = "div") {
    super();
    this.tagName = tagName.toUpperCase();
    this.dataset = {};
    this.attributes = new Map();
    this.textContent = "";
    this.muted = false;
    this.srcObject = null;
  }
  setAttribute(name, value) { this.attributes.set(String(name), String(value)); }
  append() {}
  remove() {}
}

class HarnessShadowRoot {
  constructor() {
    this.shell = new HarnessElement("div");
    this.button = new HarnessElement("button");
    this.copy = new HarnessElement("div");
    this.label = new HarnessElement("div");
    this.detail = new HarnessElement("div");
  }
  set innerHTML(_) {}
  querySelector(selector) {
    return ({ ".shell": this.shell, "button": this.button, ".copy": this.copy,
      ".label": this.label, ".detail": this.detail })[selector] ?? null;
  }
}

class HarnessHost extends HarnessElement {
  attachShadow() {
    this.shadowRootForHarness = new HarnessShadowRoot();
    return this.shadowRootForHarness;
  }
}

class HarnessDocument extends EventTarget {
  constructor() {
    super();
    this.readyState = "complete";
    this.visibilityState = "visible";
    this.body = new HarnessElement("body");
    this.documentElement = new HarnessElement("html");
    this.createdHosts = [];
    this.mountedElements = [];
    this.body.append = element => { this.mountedElements.push(element); };
    this.documentElement.append = element => { this.mountedElements.push(element); };
  }
  createElement(tagName) {
    const element = tagName === "div" ? new HarnessHost(tagName) : new HarnessElement(tagName);
    if (tagName === "div") this.createdHosts.push(element);
    return element;
  }
}

class HarnessChannel extends EventTarget {
  constructor(onClientEvent) {
    super();
    this.readyState = "connecting";
    this.onClientEvent = onClientEvent;
  }
  send(raw) { this.onClientEvent(JSON.parse(raw)); }
  emit(value) {
    const event = new Event("message");
    Object.defineProperty(event, "data", { value: JSON.stringify(value) });
    this.dispatchEvent(event);
  }
  open() {
    this.readyState = "open";
    this.dispatchEvent(new Event("open"));
  }
  disconnect() {
    this.readyState = "closed";
    this.dispatchEvent(new Event("close"));
  }
  close() { this.readyState = "closed"; }
}

function sessionStorageFixture() {
  const values = new Map();
  return {
    getItem: key => values.get(String(key)) ?? null,
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: key => values.delete(String(key))
  };
}

function milliseconds(start, end) {
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : null;
}

export async function runRealtimeLifecycleHarness({
  transcript = "open the market heatmap",
  executionMs = 35,
  transcriptionMs = 65,
  synthesisMs = 28,
  disconnectAfterLease = false,
  disconnectDuringPreflight = false,
  falseVadDuringOutput = false,
  unsolicitedStartupAudio = false,
  workflowProgressDelayMs = null,
  outputPath = null
} = {}) {
  const secret = "realtime-harness-secret";
  const auth = { Authorization: `Bearer ${secret}`, Origin: "https://app.godelterminal.com" };
  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "godel-realtime-harness-"));
  const auditPath = path.join(temporaryDir, "audit.jsonl");
  const store = new HandoffStore();
  const server = createHandoffServer({
    secret,
    store,
    port: 0,
    realtimeEnabled: true,
    openaiApiKey: "test-key-never-sent",
    realtimeAuditEnabled: true,
    realtimeAuditPath: auditPath,
    realtimeFetch: async () => new Response(answer, {
      status: 200,
      headers: { "Content-Type": "application/sdp" }
    })
  });
  const address = await server.listen();
  const base = `http://127.0.0.1:${address.port}`;
  const stamps = {};
  const clientEvents = [];
  const providerEvents = [];
  const renderTrace = [];
  let channel;
  let lease;
  let host;
  let clientStopped = false;
  let stopped = false;
  let disconnectedOnce = false;
  let acknowledgedMessage = "";
  let spokenTranscript = "";
  let providerResponseCounter = 0;
  const providerTasks = new Set();

  function emitProvider(value) {
    providerEvents.push({ at: Date.now(), type: value.type });
    channel.emit(value);
  }

  async function respondToClientEvent(event) {
    clientEvents.push({ at: Date.now(), type: event.type, event });
    if (event.type !== "response.create") return;
    stamps.responseCreate = Date.now();
    const instructions = String(event.response?.instructions ?? "");
    const exactMatch = instructions.match(/Say exactly this sentence and nothing else:\s*("(?:[^"\\]|\\.)*")\s*$/s);
    spokenTranscript = exactMatch ? JSON.parse(exactMatch[1]) : "Godel request completed.";
    const responseId = `response-harness-${++providerResponseCounter}`;
    emitProvider({ type: "response.created", response: { id: responseId } });
    await sleep(synthesisMs);
    stamps.firstAudio = Date.now();
    emitProvider({ type: "output_audio_buffer.started", event_id: "audio-start-1" });
    if (falseVadDuringOutput) {
      emitProvider({ type: "input_audio_buffer.speech_started", event_id: "false-vad-start-1" });
      const remoteAudio = document.mountedElements.find(element => element.tagName === "AUDIO");
      stamps.falseVadVolume = remoteAudio?.volume;
      await sleep(10);
      emitProvider({ type: "input_audio_buffer.speech_stopped", event_id: "false-vad-stop-1" });
      emitProvider({
        type: "conversation.item.input_audio_transcription.failed",
        event_id: "false-vad-transcription-1",
        item_id: "false-vad-item-1"
      });
    }
    emitProvider({
      type: "response.output_audio_transcript.done",
      event_id: "assistant-transcript-1",
      response_id: responseId,
      transcript: spokenTranscript
    });
    // Providers may declare the response complete before the browser audio
    // buffer drains. The client must not start another response during this
    // interval.
    emitProvider({
      type: "response.done",
      response: {
        id: responseId,
        status: "completed",
        usage: {
          input_token_details: { text_tokens: 12, audio_tokens: 48, cached_tokens_details: { text_tokens: 0, audio_tokens: 0 } },
          output_token_details: { text_tokens: 4, audio_tokens: 20 }
        },
        output: [{ id: "assistant-item-1", content: [{ transcript: spokenTranscript }] }]
      }
    });
    await sleep(12);
    stamps.audioDone = Date.now();
    emitProvider({ type: "output_audio_buffer.stopped", event_id: "audio-stop-1" });
  }

  const document = new HarnessDocument();
  const window = new EventTarget();
  const microphoneTrack = { kind: "audio", readyState: "live", enabled: true, stop() { this.readyState = "ended"; } };
  const microphone = {
    fixture: { kind: "generated-speech-placeholder", transcript },
    getTracks: () => [microphoneTrack],
    getAudioTracks: () => [microphoneTrack]
  };

  class HarnessPeer {
    addTrack() {}
    createDataChannel() {
      channel = new HarnessChannel(event => {
        const task = respondToClientEvent(event);
        providerTasks.add(task);
        task.finally(() => providerTasks.delete(task));
      });
      return channel;
    }
    async createOffer() { return { type: "offer", sdp: offer }; }
    async setLocalDescription() {}
    async setRemoteDescription() { queueMicrotask(() => channel.open()); }
    close() {}
  }

  const nativeFetch = globalThis.fetch;
  const executorId = `gx-${"a".repeat(43)}`;
  const documentGeneration = `gd-${"b".repeat(43)}`;
  async function harnessFetch(input, options = {}) {
    const url = String(input);
    const headers = new Headers(options.headers ?? {});
    if (url.startsWith(base)) headers.set("Origin", "https://app.godelterminal.com");
    if (url.endsWith("/realtime/preflight")) stamps.preflightStart ??= Date.now();
    const response = await nativeFetch(input, { ...options, headers });
    if (url.endsWith("/realtime/preflight")) {
      stamps.preflightDone = Date.now();
      if (disconnectDuringPreflight && !disconnectedOnce) {
        disconnectedOnce = true;
        stamps.transportInterrupted = Date.now();
        channel.disconnect();
      }
    }
    return response;
  }

  const context = {
    globalThis: null,
    GodelVoiceConfig: { handoffUrl: base, secret },
    location: { origin: "https://app.godelterminal.com" },
    document,
    window,
    navigator: { mediaDevices: { getUserMedia: async () => microphone } },
    chrome: {
      runtime: {
        sendMessage: async message => message?.type === "godel-voice:executor-identity"
          ? { ok: true, executor_id: executorId, document_generation: documentGeneration }
          : { ok: false, error: "Unsupported harness message" }
      }
    },
    sessionStorage: sessionStorageFixture(),
    RTCPeerConnection: HarnessPeer,
    CustomEvent: class extends Event { constructor(type, init = {}) { super(type); this.detail = init.detail; } },
    Event,
    EventTarget,
    Headers,
    Response,
    fetch: harnessFetch,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    console,
    URL,
    Math,
    JSON,
    Date,
    Promise
  };
  context.globalThis = context;

  const executorAbort = new AbortController();
  const executor = (async () => {
    while (!stopped) {
      const response = await nativeFetch(`${base}/next?client=${executorId}&executor=${executorId}&generation=${documentGeneration}`, {
        headers: auth,
        signal: executorAbort.signal
      });
      if (response.status === 204) { await sleep(5); continue; }
      lease = await response.json();
      stamps.workflowLease = Date.now();
      const commands = parseWorkflowMarker(lease.marker).steps.map(step => step.command).filter(Boolean);
      acknowledgedMessage = commands.length === 1 ? `${commands[0]} completed.` : `${commands.join(", ")} completed.`;
      if (disconnectAfterLease && !disconnectedOnce) {
        disconnectedOnce = true;
        stamps.transportInterrupted = Date.now();
        channel.disconnect();
      }
      await sleep(executionMs);
      stamps.workflowAck = Date.now();
      await nativeFetch(`${base}/ack`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          id: lease.id,
          client_id: executorId,
          executor_id: executorId,
          document_generation: documentGeneration,
          status: "completed",
          message: acknowledgedMessage,
          step_timings: commands.map(command => ({ command, duration_ms: executionMs }))
        })
      });
      return;
    }
  })().catch(error => {
    if (!stopped && error?.name !== "AbortError") throw error;
  });

  try {
    stamps.harnessStart = Date.now();
    const sourceForHarness = Number.isFinite(workflowProgressDelayMs)
      ? realtimeSource.replace("WORKFLOW_PROGRESS_DELAY_MS = 8_000", `WORKFLOW_PROGRESS_DELAY_MS = ${Math.max(1, Math.round(workflowProgressDelayMs))}`)
      : realtimeSource;
    vm.runInNewContext(sourceForHarness, context, { filename: "extension/realtime.js" });
    host = await waitFor(() => document.mountedElements.find(candidate => candidate.id === "godel-jarvis-control"), {
      message: "Jarvis control mount"
    });
    const shadow = host.shadowRootForHarness;
    const observedDataset = shadow.shell.dataset;
    shadow.shell.dataset = new Proxy(observedDataset, {
      set(target, property, value) {
        Reflect.set(target, property, value);
        if (property === "state") {
          const latest = { at: Date.now(), state: value, label: shadow.label.textContent, detail: shadow.detail.textContent };
          const previous = renderTrace.at(-1);
          if (!previous || previous.state !== latest.state) renderTrace.push(latest);
        }
        return true;
      }
    });
    stamps.activation = Date.now();
    shadow.button.dispatchEvent(new Event("click"));
    await waitFor(() => channel?.readyState === "open", { message: "Realtime data channel" });
    stamps.channelOpen = Date.now();
    emitProvider({ type: "session.created" });
    if (unsolicitedStartupAudio) {
      emitProvider({ type: "output_audio_buffer.started", event_id: "startup-audio-start-1" });
      const remoteAudio = document.mountedElements.find(element => element.tagName === "AUDIO");
      stamps.startupAudioMuted = remoteAudio?.muted;
      emitProvider({ type: "output_audio_buffer.stopped", event_id: "startup-audio-stop-1" });
    }
    stamps.speechStart = Date.now();
    emitProvider({ type: "input_audio_buffer.speech_started", event_id: "speech-start-1" });
    await sleep(25);
    stamps.speechStop = Date.now();
    emitProvider({ type: "input_audio_buffer.speech_stopped", event_id: "speech-stop-1" });
    await sleep(transcriptionMs);
    stamps.transcript = Date.now();
    emitProvider({
      type: "conversation.item.input_audio_transcription.completed",
      event_id: "transcription-1",
      item_id: "turn-1",
      transcript,
      logprobs: [{ logprob: -0.04 }, { logprob: -0.08 }]
    });

    await executor;
    await waitFor(() => stamps.audioDone && spokenTranscript === acknowledgedMessage, {
      timeoutMs: 5_000,
      message: "grounded spoken completion"
    });
    await sleep(30);

    assert.equal(lease?.marker?.startsWith("GV"), true, "transcript must compile into a validated workflow marker");
    const expectedSpokenResponses = Number.isFinite(workflowProgressDelayMs)
      && executionMs > workflowProgressDelayMs
      && progressMessageForMarker(lease.marker) ? 2 : 1;
    assert.equal(
      clientEvents.filter(item => item.type === "response.create").length,
      expectedSpokenResponses,
      "the lifecycle should request only its bounded progress acknowledgement and grounded completion"
    );
    assert.equal(spokenTranscript, acknowledgedMessage, "spoken completion must exactly match the executor acknowledgement");
    assert.equal(providerEvents.some(item => item.type === "output_audio_buffer.started"), true);
    assert.equal(renderTrace.some(item => item.state === "working"), true);
    assert.equal(renderTrace.some(item => item.state === "speaking"), true);

    const audit = fs.existsSync(auditPath)
      ? fs.readFileSync(auditPath, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line))
      : [];
    const workflowPlan = parseWorkflowMarker(lease.marker);
    const commands = workflowPlan.steps.map(step => step.command).filter(Boolean);
    const report = {
      schema_version: 1,
      pass: true,
      transcript,
      workflow: { id: lease.id, commands, marker_version: lease.marker.slice(0, 3) },
      spoken_completion: spokenTranscript,
      latency_ms: {
        activation_to_channel_open: milliseconds(stamps.activation, stamps.channelOpen),
        speech_duration: milliseconds(stamps.speechStart, stamps.speechStop),
        speech_stop_to_transcript: milliseconds(stamps.speechStop, stamps.transcript),
        transcript_to_preflight_start: milliseconds(stamps.transcript, stamps.preflightStart),
        preflight_roundtrip: milliseconds(stamps.preflightStart, stamps.preflightDone),
        transcript_to_workflow_lease: milliseconds(stamps.transcript, stamps.workflowLease),
        workflow_execution: milliseconds(stamps.workflowLease, stamps.workflowAck),
        transcript_to_response_create: milliseconds(stamps.transcript, stamps.responseCreate),
        response_create_to_first_audio: milliseconds(stamps.responseCreate, stamps.firstAudio),
        speech_stop_to_first_audio: milliseconds(stamps.speechStop, stamps.firstAudio),
        speech_stop_to_audio_done: milliseconds(stamps.speechStop, stamps.audioDone),
        activation_to_audio_done: milliseconds(stamps.activation, stamps.audioDone)
      },
      event_counts: {
        client: clientEvents.length,
        provider: providerEvents.length,
        audit: audit.length,
        spoken_responses: clientEvents.filter(item => item.type === "response.create").length,
        response_cancellations: clientEvents.filter(item => item.type === "response.cancel").length
      },
      interruption: falseVadDuringOutput ? {
        false_vad_volume: stamps.falseVadVolume,
        response_cancelled: clientEvents.some(item => item.type === "response.cancel")
      } : null,
      startup_audio: unsolicitedStartupAudio ? {
        muted: stamps.startupAudioMuted,
        response_cancelled: clientEvents.some(item => item.type === "response.cancel")
      } : null,
      render_states: renderTrace.map(item => item.state),
      coverage: {
        browser_realtime_state_machine: true,
        local_http_handoff: true,
        deterministic_intent_compiler: true,
        workflow_lease_and_ack: true,
        grounded_response_request: true,
        provider_event_ordering: true,
        transport_recovery_during_workflow: disconnectAfterLease || disconnectDuringPreflight,
        physical_microphone_capture: false,
        provider_speech_recognition: false,
        provider_audio_synthesis: false,
        live_godel_dom: false
      },
      live_e2e_required_for: [
        "microphone and room acoustics",
        "OpenAI transcription accuracy and latency",
        "OpenAI first-audio latency and pronunciation",
        "Godel DOM rendering and window geometry"
      ]
    };
    if (outputPath) {
      fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
      fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`);
    }
    shadow.button.dispatchEvent(new Event("click"));
    clientStopped = true;
    await sleep(10);
    await Promise.allSettled([...providerTasks]);
    return report;
  } finally {
    if (host && !clientStopped) {
      try {
        host.shadowRootForHarness.button.dispatchEvent(new Event("click"));
        clientStopped = true;
      } catch {}
    }
    stopped = true;
    executorAbort.abort();
    await Promise.allSettled([executor, ...providerTasks]);
    await server.close();
    fs.rmSync(temporaryDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputIndex = process.argv.indexOf("--output");
  const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;
  const transcriptIndex = process.argv.indexOf("--transcript");
  const transcript = transcriptIndex >= 0 ? process.argv[transcriptIndex + 1] : undefined;
  const report = await runRealtimeLifecycleHarness({ transcript, outputPath });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
