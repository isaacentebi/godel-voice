import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileVoiceWorkflow } from "./compiler.mjs";
import { encodeWorkflowPlan } from "./automation-plan.mjs";
import { readRecentExecutorContext } from "./executor-context.mjs";
import { compileWorkflowWithValidatedFallback } from "./model-routing.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const transcript = fs.readFileSync(0, "utf8").trim();
  if (!transcript) throw new Error("VoiceInk supplied an empty transcript");

  const routed = await compileWorkflowWithValidatedFallback(transcript, {
    compile: compileVoiceWorkflow,
    context: readRecentExecutorContext(),
    fallbackModel: process.env.VOICE_LLM_FALLBACK_MODEL || null,
    fallbackProviderOnly: process.env.VOICE_LLM_FALLBACK_PROVIDER_ONLY || process.env.OPENROUTER_PROVIDER_ONLY || null
  });
  const result = routed.result;
  if (result.workflow.kind === "clarify") {
    throw new Error(result.workflow.clarification || "The Godel request needs clarification");
  }
  if (result.workflow.kind !== "execute" || !result.plan) {
    throw new Error(result.plan_error || result.workflow.reason || "The request cannot be executed in Godel");
  }
  const diagnosticsPath = process.env.GODEL_VOICE_DIAGNOSTICS_PATH;
  if (diagnosticsPath) {
    fs.mkdirSync(path.dirname(diagnosticsPath), { recursive: true });
    fs.appendFileSync(diagnosticsPath, `${JSON.stringify({
      at: new Date().toISOString(),
      request_id: process.env.GODEL_VOICE_REQUEST_ID || null,
      model: result.inference.model,
      provider: result.inference.provider,
      latency_ms: result.inference.latency_ms,
      provider_latency_ms: result.inference.provider_latency_ms,
      attempt_latencies_ms: result.inference.attempt_latencies_ms,
      timeout_ms: result.inference.timeout_ms,
      max_attempts: result.inference.max_attempts,
      prompt_tokens: result.inference.prompt_tokens,
      completion_tokens: result.inference.completion_tokens,
      cost: result.inference.cost,
      escalated: routed.escalated,
      primary_error: routed.primary_error,
      routing: routed.routing,
      commands: result.plan.steps.map(step => step.command ?? step.target?.command ?? null)
    })}\n`, { mode: 0o600 });
  }
  process.stdout.write(encodeWorkflowPlan(result.plan));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
