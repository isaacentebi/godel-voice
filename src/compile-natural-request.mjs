import { deterministicClarification, encodeControlFollowup } from "./control-followup.mjs";
import { compileVoiceWorkflow } from "./compiler.mjs";
import { compileWorkflowWithValidatedFallback } from "./model-routing.mjs";
import { encodeWorkflowPlan } from "./workflow-plan.mjs";

function cleanRequest(value) {
  const request = String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!request || request.length > 1_000) throw new Error("Godel request must be 1-1000 characters");
  if (/^(?:GV[12]:|[\[{])/.test(request)) throw new Error("Godel request must be natural language");
  return request;
}

export async function compileNaturalRequest(value, {
  context = null,
  compile = compileVoiceWorkflow,
  fallbackModel = process.env.VOICE_LLM_FALLBACK_MODEL || null,
  fallbackProviderOnly = process.env.VOICE_LLM_FALLBACK_PROVIDER_ONLY || process.env.OPENROUTER_PROVIDER_ONLY || null
} = {}) {
  const request = cleanRequest(value);
  const localClarification = deterministicClarification(request);
  if (localClarification) return { kind: "clarify", message: localClarification, route: "local", inference: null };
  const fastMarker = encodeControlFollowup(request, context);
  if (fastMarker) return { kind: "execute", marker: fastMarker, route: "local", inference: null };

  const routed = await compileWorkflowWithValidatedFallback(request, {
    compile, context, fallbackModel, fallbackProviderOnly
  });
  const result = routed.result;
  if (result?.workflow?.kind === "clarify") {
    return { kind: "clarify", message: result.workflow.clarification || "Please clarify the Godel request." };
  }
  if (result?.workflow?.kind !== "execute" || !result.plan) {
    return { kind: "unsupported", message: result?.plan_error || result?.workflow?.reason || "That request is not safely available in Godel yet." };
  }
  return {
    kind: "execute",
    marker: encodeWorkflowPlan(result.plan),
    route: routed.escalated ? "fallback" : "model",
    inference: result.inference ?? null
  };
}
