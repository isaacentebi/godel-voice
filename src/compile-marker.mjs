import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileVoiceWorkflow } from "./compiler.mjs";
import { encodeWorkflowPlan } from "./automation-plan.mjs";
import { readRecentExecutorContext } from "./executor-context.mjs";
import { compileWorkflowWithValidatedFallback } from "./model-routing.mjs";
import { deterministicClarification, encodeControlFollowup } from "./control-followup.mjs";

export function writeVoiceInkCompileTelemetry(diagnosticsPath, {
  requestId = null, route = "failed", compileMs = 0
} = {}) {
  if (!diagnosticsPath) return;
  const safeRequestId = /^[A-Za-z0-9_.-]{1,96}$/.test(String(requestId ?? ""))
    ? String(requestId) : null;
  const safeRoute = String(route ?? "failed").toLowerCase().replace(/[^a-z_]/g, "").slice(0, 32) || "failed";
  fs.mkdirSync(path.dirname(diagnosticsPath), { recursive: true });
  fs.appendFileSync(diagnosticsPath, `${JSON.stringify({
    at: new Date().toISOString(),
    event: "voiceink_compile",
    request_id: safeRequestId,
    transcript_received: true,
    route: safeRoute,
    compile_ms: Number.isFinite(Number(compileMs)) ? Math.max(0, Math.round(Number(compileMs))) : 0
  })}\n`, { mode: 0o600 });
}

export async function compileMarkerRequest(transcript, {
  context = readRecentExecutorContext(),
  compile = compileVoiceWorkflow,
  fallbackModel = process.env.VOICE_LLM_FALLBACK_MODEL || null,
  fallbackProviderOnly = process.env.VOICE_LLM_FALLBACK_PROVIDER_ONLY || process.env.OPENROUTER_PROVIDER_ONLY || null
} = {}) {
  transcript = String(transcript ?? "").trim();
  if (!transcript) throw new Error("VoiceInk supplied an empty transcript");
  const localClarification = deterministicClarification(transcript);
  if (localClarification) throw new Error(localClarification);

  // Keep the deterministic compiler in front of every model entry point, not
  // only the VoiceInk shell wrapper. This prevents direct callers and future
  // integrations from paying network latency for locally provable workflows.
  const localMarker = encodeControlFollowup(transcript, context);
  if (localMarker) return { marker: localMarker, route: "local", result: null, routed: null };

  const routed = await compileWorkflowWithValidatedFallback(transcript, {
    compile, context, fallbackModel, fallbackProviderOnly
  });
  const result = routed.result;
  if (result.workflow.kind === "clarify") {
    throw new Error(result.workflow.clarification || "The Godel request needs clarification");
  }
  if (result.workflow.kind !== "execute" || !result.plan) {
    throw new Error(result.plan_error || result.workflow.reason || "The request cannot be executed in Godel");
  }
  return {
    marker: encodeWorkflowPlan(result.plan),
    route: routed.escalated ? "fallback" : "model",
    result,
    routed
  };
}

async function main() {
  const suppliedStartedAt = Number(process.env.GODEL_VOICE_COMPILE_STARTED_AT);
  const compileStartedAt = Number.isFinite(suppliedStartedAt) && suppliedStartedAt > 0
    ? suppliedStartedAt : Date.now();
  const transcript = fs.readFileSync(0, "utf8").trim();
  const diagnosticsPath = process.env.GODEL_VOICE_DIAGNOSTICS_PATH;
  try {
    const compiled = await compileMarkerRequest(transcript);
    writeVoiceInkCompileTelemetry(diagnosticsPath, {
      requestId: process.env.GODEL_VOICE_REQUEST_ID,
      route: compiled.route,
      compileMs: Date.now() - compileStartedAt
    });
    process.stdout.write(compiled.marker);
  } catch (error) {
    writeVoiceInkCompileTelemetry(diagnosticsPath, {
      requestId: process.env.GODEL_VOICE_REQUEST_ID,
      route: "failed",
      compileMs: Date.now() - compileStartedAt
    });
    throw error;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
