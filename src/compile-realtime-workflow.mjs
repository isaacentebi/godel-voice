import { compileStructuredWorkflow } from "./compiler.mjs";
import { buildCompactCatalog } from "./catalog.mjs";
import { voiceWorkflowSchema } from "./prompt.mjs";
import { encodeWorkflowPlan } from "./workflow-plan.mjs";

const workflowFields = Object.freeze(Object.keys(voiceWorkflowSchema.properties));
const allowedFields = new Set(["original_request", ...workflowFields]);

function cleanRequest(value) {
  const request = String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!request || request.length > 1_000) throw new Error("Godel request must be 1-1000 characters");
  if (/^(?:GV[12]:|[\[{])/.test(request)) throw new Error("Godel request must be natural language");
  return request;
}

export const realtimeWorkflowToolParameters = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["original_request", "workflow"],
  properties: {
    original_request: {
      type: "string",
      minLength: 1,
      maxLength: 1_000,
      description: "Faithful natural-language restatement of the user's complete request. Preserve every company, metric, period, placement, and follow-up reference."
    },
    workflow: {
      type: "object",
      description: "The semantic Godel workflow object described in the session instructions. It is independently validated locally before execution."
    }
  }
});

export function realtimeWorkflowInstructions() {
  return `# Godel planning

For every Godel action or read, call run_godel_workflow once. Put the complete request in original_request and express the requested result in the structured workflow fields. Never emit terminal syntax, selectors, or arbitrary code.

- Use one command step per window. Keep every explicitly requested company, metric, period, comparison, placement, and ordering constraint.
- A setting within a window is a post_open_action. Existing-window changes use configure; move, resize, maximize, restore, focus, close, and export use control.
- Use only canonical commands and ui features present in GODEL_SPEC. Unknown or unavailable capabilities are unsupported, never invented.
- Resolve Amazon/AWS=AMZN, Apple=AAPL, Microsoft=MSFT, Meta/Facebook=META, Nvidia=NVDA, Tesla=TSLA, Netflix=NFLX, Oracle=ORCL, Reddit=RDDT and Palantir=PLTR. Preserve unfamiliar names as spoken_name with needs_resolution=true.
- A normal price chart is G. A historical price comparison is HMS. Ratios, spreads, correlation and regression use GR. Fundamental or valuation series such as revenue, margins or P/E use GF.
- For an action such as open, show, or pull up a company's bare earnings, default to EM so the request executes in one turn. Earnings matrix means EM; analyst expectations/estimates/beat-miss means ERN; calls/transcripts/Q&A means TRAN. Ask which view only when the user is asking about the distinction rather than requesting an action.
- For a fundamental comparison, the first company is the GF primary security. Additional companies use feature=add company, operation=add. Revenue uses feature=add metric, operation=add, value=Revenue. Operating margin uses feature=margin metric, operation=add, value=Operating Margin.
- Example: “open a heatmap on the left and an Amazon chart on the right with operating margins and revenues” is HMAP placement=left plus AMZN GF placement=right with Operating Margin and Revenue actions, preset=market.
- placement is null unless spoken. preserve_existing=true unless the user asks to rearrange the whole screen. new_screen=true only when requested.
- For pronouns, use the latest successful tool result, then focused panel, then last panel. If no exact live target exists, clarify.
- Never claim success before the tool result. Never retry an identical failed call automatically.

Put this exact semantic object inside the tool's workflow property:
WORKFLOW_SCHEMA=${JSON.stringify(voiceWorkflowSchema)}

${buildCompactCatalog()}`;
}

export function compileRealtimeWorkflow(value, { context = null } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid structured Godel workflow");
  const wrapped = value.workflow && typeof value.workflow === "object" && !Array.isArray(value.workflow);
  if (wrapped) {
    const wrapperUnknown = Object.keys(value).filter(key => !["original_request", "workflow"].includes(key));
    if (wrapperUnknown.length) throw new Error(`Structured Godel workflow has unknown wrapper field: ${wrapperUnknown[0]}`);
  }
  const originalRequest = cleanRequest(value.original_request);
  const workflowValue = wrapped ? value.workflow : value;
  const unknown = Object.keys(workflowValue).filter(key => !allowedFields.has(key));
  if (unknown.length) throw new Error(`Structured Godel workflow has unknown field: ${unknown[0]}`);
  for (const field of voiceWorkflowSchema.required) {
    if (!Object.prototype.hasOwnProperty.call(workflowValue, field)) throw new Error(`Structured Godel workflow is missing ${field}`);
  }
  const workflow = Object.fromEntries(workflowFields.map(field => [field, workflowValue[field]]));
  const compiled = compileStructuredWorkflow(workflow, originalRequest, { context });
  if (compiled.workflow.kind === "clarify") {
    return {
      kind: "clarify",
      message: compiled.workflow.clarification || "Which Godel view did you mean?",
      route: "realtime_structured"
    };
  }
  if (compiled.workflow.kind !== "execute" || !compiled.plan) {
    return {
      kind: "unsupported",
      message: compiled.plan_error || compiled.workflow.reason || "That action is not safely available in Godel yet.",
      route: "realtime_structured"
    };
  }
  return {
    kind: "execute",
    marker: encodeWorkflowPlan(compiled.plan),
    route: "realtime_structured"
  };
}

export function normalizedRealtimeRequest(value) {
  return cleanRequest(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
