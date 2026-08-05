import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import { compileNaturalRequest } from "./compile-natural-request.mjs";
import { encodeWorkflowPlan, parseWorkflowMarker } from "./workflow-plan.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const terminalStatuses = new Set(["completed", "failed", "cancelled"]);
const workflowPhaseNames = [
  "lifecycle_barrier_ms", "workspace_prepare_ms", "layout_ms", "reconcile_ms", "completion_fact_ms"
];
const liveReadOnlyCommands = new Set(["EQS", "HDS", "HMAP", "EM", "GF", "IMAP", "N", "SECF", "OMON", "G", "HMS", "MOST", "TRAN"]);
const forbiddenOperations = new Set(["download", "export", "send", "post", "publish", "buy", "sell", "trade", "submit"]);
const liveSafeWindowControls = new Set(["move", "resize", "maximize", "restore", "focus", "close"]);

export class WorkflowTimeoutError extends Error {
  constructor() {
    super("workflow timeout");
    this.name = "WorkflowTimeoutError";
  }
}

function boundedInteger(value, fallback, minimum, maximum) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.round(parsed))) : fallback;
}

function safeCaseId(value) {
  const id = String(value ?? "");
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) throw new Error("Every live case needs a safe unique id");
  return id;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (!isDeepStrictEqual(actual, required)) {
    throw new Error(`${label} must declare exactly: ${required.join(", ")}`);
  }
}

function jsonValue(value, label) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    throw new Error(`${label} must be JSON-serializable`);
  }
}

function normalizeDeclaredLiveSemantics(value, label = "expected_semantics") {
  exactKeys(value, ["layout", "postconditions"], label);
  exactKeys(value.layout, ["mode", "direction", "gap_px", "preset", "preserve_existing", "new_screen"], `${label}.layout`);
  if (!Array.isArray(value.postconditions) || value.postconditions.length < 1 || value.postconditions.length > 8) {
    throw new Error(`${label}.postconditions must contain 1-8 exact entries`);
  }
  const postconditions = value.postconditions.map((item, index) => {
    const itemLabel = `${label}.postconditions[${index}]`;
    if (item?.kind === "control") {
      exactKeys(item, ["kind", "operation", "target", "value"], itemLabel);
      exactKeys(item.target, ["mode", "command", "security"], `${itemLabel}.target`);
      return jsonValue(item, itemLabel);
    }
    if (!["command", "configure"].includes(item?.kind)) throw new Error(`${itemLabel}.kind is unsupported`);
    exactKeys(item, ["kind", "command", "security", "terminal_command", "arguments", "actions", "placement"], itemLabel);
    if (!Array.isArray(item.arguments) || !Array.isArray(item.actions)) {
      throw new Error(`${itemLabel} must declare exact arguments and actions arrays`);
    }
    return jsonValue(item, itemLabel);
  });
  return { layout: jsonValue(value.layout, `${label}.layout`), postconditions };
}

export function validateLiveStressCases(value, { maximum = 20 } = {}) {
  const cases = Array.isArray(value) ? value : value?.cases;
  if (!Array.isArray(cases) || cases.length < 1 || cases.length > maximum) {
    throw new Error(`Live stress case files must contain 1-${maximum} cases`);
  }
  const ids = new Set();
  return cases.map(item => {
    const id = safeCaseId(item?.id);
    if (ids.has(id)) throw new Error(`Duplicate live case id: ${id}`);
    ids.add(id);
    const phrase = String(item?.phrase ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
    if (!phrase || phrase.length > 500) throw new Error(`${id} needs a phrase of 1-500 characters`);
    if (item?.read_only !== true) throw new Error(`${id} must explicitly declare read_only=true`);
    const expectedSemantics = normalizeDeclaredLiveSemantics(item?.expected_semantics, `${id}.expected_semantics`);
    return {
      id, phrase, read_only: true,
      timeout_ms: boundedInteger(item?.timeout_ms, null, 1_000, 120_000),
      expected_semantics: expectedSemantics
    };
  });
}

function securityFromCommandStep(step) {
  if (step?.kind === "configure") return step.target?.security ?? null;
  if (step?.security_query) return step.security_query;
  const terminal = String(step?.terminal_command ?? "").trim();
  const command = String(step?.command ?? "").trim();
  if (!terminal || terminal === command || terminal.startsWith(`${command} `)) return null;
  return terminal.split(/\s+/)[0] || null;
}

export function normalizeLivePlanSemantics(plan) {
  const layout = plan?.layout ?? {};
  return {
    layout: {
      mode: layout.mode ?? null,
      direction: layout.direction ?? null,
      gap_px: layout.gap_px ?? null,
      preset: layout.preset ?? null,
      preserve_existing: layout.preserve_existing ?? null,
      new_screen: layout.new_screen ?? null
    },
    postconditions: (plan?.steps ?? []).map(step => {
      if ((step.kind ?? "command") === "control") {
        return {
          kind: "control",
          operation: step.operation ?? null,
          target: {
            mode: step.target?.mode ?? null,
            command: step.target?.command ?? null,
            security: step.target?.security ?? null
          },
          value: step.value ?? null
        };
      }
      return {
        kind: step.kind ?? "command",
        command: step.command ?? step.target?.command ?? null,
        security: securityFromCommandStep(step),
        terminal_command: step.terminal_command ?? null,
        arguments: jsonValue(step.arguments ?? [], "plan arguments"),
        actions: jsonValue(step.actions ?? [], "plan actions"),
        placement: step.layout?.placement ?? null
      };
    })
  };
}

export function assertExpectedLiveSemantics(plan, expected) {
  const declared = normalizeDeclaredLiveSemantics(expected);
  const actual = normalizeLivePlanSemantics(plan);
  if (!isDeepStrictEqual(actual, declared)) {
    const error = new Error("compiled workflow does not match the case's exact declared semantics");
    error.name = "CompileSemanticsError";
    throw error;
  }
  return actual;
}

export function assertLiveReadOnlyMarker(marker) {
  const plan = parseWorkflowMarker(marker);
  const steps = plan.version === 2 ? plan.steps : [plan];
  if (!steps.length || steps.length > 8) throw new Error("Live stress workflows must contain 1-8 steps");
  for (const step of steps) {
    if ((step.kind ?? "command") === "control") {
      if (!liveSafeWindowControls.has(step.operation)) {
        throw new Error(`Live stress control is not in the safe window set: ${step.operation}`);
      }
      if (step.target?.mode !== "command" || !liveReadOnlyCommands.has(String(step.target.command ?? ""))) {
        throw new Error("Live stress window controls require one exact proven command target");
      }
      continue;
    }
    if (!['command', 'configure'].includes(step.kind ?? "command")) {
      throw new Error("Live stress cases cannot contain workspace controls");
    }
    const command = String(step.command ?? step.target?.command ?? "");
    if (!liveReadOnlyCommands.has(command)) throw new Error(`Live stress command is not in the proven read-only set: ${command}`);
    for (const action of step.actions ?? []) {
      if (forbiddenOperations.has(String(action.operation ?? "").toLowerCase())) {
        throw new Error("Live stress cases cannot export, transact, or publish");
      }
    }
  }
  return plan;
}

export function resetWorkspaceMarker() {
  return encodeWorkflowPlan({
    version: 2,
    failure_policy: "stop_on_any",
    layout: null,
    steps: [{
      id: "reset-workspace", kind: "control", operation: "reset_workspace",
      target: { mode: "focused", command: null, security: null }, value: null,
      required: true, failure_policy: "stop"
    }]
  });
}

export function sanitizeWorkflowMeasurement(status, elapsedMs = null) {
  const phases = status?.phases && typeof status.phases === "object"
    ? Object.fromEntries(workflowPhaseNames
      .filter(name => Number.isFinite(status.phases[name]))
      .map(name => [name, Math.max(0, Math.round(status.phases[name]))]))
    : {};
  const steps = Array.isArray(status?.steps) ? status.steps.slice(0, 16).map((step, index) => ({
    index,
    kind: ["command", "control", "configure"].includes(step?.kind) ? step.kind : "command",
    status: ["completed", "failed", "skipped"].includes(step?.status) ? step.status : "failed",
    command: String(step?.command ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || null,
    operation: String(step?.operation ?? "").toLowerCase().replace(/[^a-z]/g, "").slice(0, 16) || null,
    duration_ms: Number.isFinite(step?.duration_ms) ? Math.max(0, Math.round(step.duration_ms)) : null
  })) : [];
  return {
    status: terminalStatuses.has(status?.status) ? status.status : "unknown",
    handoff_ms: Number.isFinite(elapsedMs) ? Math.max(0, Math.round(elapsedMs)) : null,
    workflow_ms: Number.isFinite(status?.duration_ms) ? Math.max(0, Math.round(status.duration_ms)) : null,
    phases,
    steps
  };
}

export function completedWithoutSkippedWork(measurement) {
  return measurement?.status === "completed"
    && Array.isArray(measurement.steps)
    && measurement.steps.length > 0
    && measurement.steps.every(step => step.status === "completed");
}

export class LocalHandoffClient {
  constructor({
    baseUrl = "http://127.0.0.1:17841", secret, fetchImpl = globalThis.fetch,
    clock = () => Date.now(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), pollMs = 100
  } = {}) {
    if (!String(secret ?? "").trim()) throw new Error("The local handoff secret is unavailable");
    if (typeof fetchImpl !== "function") throw new Error("fetch is unavailable");
    this.baseUrl = String(baseUrl).replace(/\/$/, "");
    this.secret = String(secret).trim();
    this.fetch = fetchImpl;
    this.clock = clock;
    this.sleep = sleep;
    this.pollMs = boundedInteger(pollMs, 100, 25, 2_000);
  }

  async request(pathname, { method = "GET", body = null, requestId = null } = {}) {
    const headers = { Authorization: `Bearer ${this.secret}` };
    if (body != null) headers["Content-Type"] = "text/plain";
    if (requestId) headers["X-Godel-Request-Id"] = requestId;
    const response = await this.fetch(`${this.baseUrl}${pathname}`, { method, headers, body });
    const text = response.status === 204 ? "" : await response.text();
    let value = null;
    try { value = text ? JSON.parse(text) : null; } catch {}
    if (!response.ok) throw new Error(`handoff ${pathname} returned ${response.status}`);
    return value;
  }

  health() {
    return this.request("/health");
  }

  async queue(marker, requestId) {
    const value = await this.request("/plan", { method: "POST", body: marker, requestId });
    if (!value?.id) throw new Error("handoff did not return a workflow id");
    return value.id;
  }

  status(id) {
    return this.request(`/status?id=${encodeURIComponent(id)}`);
  }

  cancel(id) {
    return this.request("/cancel", { method: "POST", body: JSON.stringify({ id }) });
  }

  async waitForTerminal(id, timeoutMs) {
    const startedAt = this.clock();
    while (this.clock() - startedAt <= timeoutMs) {
      const status = await this.status(id);
      if (terminalStatuses.has(status?.status)) {
        return { status, elapsed_ms: this.clock() - startedAt };
      }
      await this.sleep(this.pollMs);
    }
    throw new WorkflowTimeoutError();
  }
}

function requestId(runRef, label) {
  return `live-${runRef}-${label}-${crypto.randomBytes(4).toString("hex")}`.slice(0, 96);
}

function routeName(value) {
  const route = String(value ?? "unknown").toLowerCase().replace(/[^a-z_]/g, "").slice(0, 32);
  return route || "unknown";
}

async function executeCleanup(handoff, marker, runRef, label, timeoutMs) {
  const startedAt = Date.now();
  try {
    const id = await handoff.queue(marker, requestId(runRef, `reset-${label}`));
    const terminal = await handoff.waitForTerminal(id, timeoutMs);
    return sanitizeWorkflowMeasurement(terminal.status, Date.now() - startedAt);
  } catch (error) {
    return {
      status: error instanceof WorkflowTimeoutError ? "timeout" : "unavailable",
      handoff_ms: Math.max(0, Date.now() - startedAt), workflow_ms: null, phases: {}
    };
  }
}

export async function runLiveGodelStress({
  cases, handoff, compilePhrase = phrase => compileNaturalRequest(phrase, { context: null }),
  timeoutMs = 45_000, cleanupTimeoutMs = 30_000, now = () => Date.now()
} = {}) {
  const validated = validateLiveStressCases(cases);
  const boundedTimeout = boundedInteger(timeoutMs, 45_000, 1_000, 120_000);
  const boundedCleanupTimeout = boundedInteger(cleanupTimeoutMs, 30_000, 1_000, 120_000);
  const runRef = crypto.randomBytes(6).toString("hex");
  const cleanupMarker = resetWorkspaceMarker();
  const report = {
    schema_version: 1,
    generated_at: new Date(now()).toISOString(),
    mode: "authenticated-local-handoff",
    case_count: validated.length,
    preflight_cleanup: null,
    cases: [],
    passed: false
  };

  report.preflight_cleanup = await executeCleanup(handoff, cleanupMarker, runRef, "preflight", boundedCleanupTimeout);
  if (!completedWithoutSkippedWork(report.preflight_cleanup)) return report;

  for (const item of validated) {
    const result = {
      id: item.id,
      route: "unknown",
      compile_ms: null,
      workflow: null,
      cleanup: null,
      failure_stage: null,
      passed: false
    };
    let workflowId = null;
    let workflowTerminal = false;
    try {
      const compileStartedAt = now();
      let compiled;
      try {
        compiled = await compilePhrase(item.phrase);
      } finally {
        result.compile_ms = Math.max(0, Math.round(now() - compileStartedAt));
      }
      result.route = routeName(compiled?.route);
      if (compiled?.kind !== "execute" || !compiled.marker) {
        result.failure_stage = "compile";
        throw new Error("compile did not produce an executable workflow");
      }
      let plan;
      try {
        plan = assertLiveReadOnlyMarker(compiled.marker);
      } catch (error) {
        result.failure_stage = "compile_safety";
        throw error;
      }
      try {
        assertExpectedLiveSemantics(plan, item.expected_semantics);
      } catch (error) {
        result.failure_stage = "compile_semantics";
        throw error;
      }
      const workflowStartedAt = now();
      workflowId = await handoff.queue(compiled.marker, requestId(runRef, item.id));
      const terminal = await handoff.waitForTerminal(workflowId, item.timeout_ms ?? boundedTimeout);
      workflowTerminal = true;
      result.workflow = sanitizeWorkflowMeasurement(terminal.status, now() - workflowStartedAt);
      if (!completedWithoutSkippedWork(result.workflow)) result.failure_stage = "workflow";
    } catch (error) {
      if (!result.failure_stage) {
        result.failure_stage = error instanceof WorkflowTimeoutError ? "workflow_timeout"
          : workflowId ? "workflow_handoff" : "compile";
      }
    } finally {
      if (workflowId && !workflowTerminal) await handoff.cancel(workflowId).catch(() => null);
      result.cleanup = await executeCleanup(handoff, cleanupMarker, runRef, item.id, boundedCleanupTimeout);
      result.passed = completedWithoutSkippedWork(result.workflow)
        && completedWithoutSkippedWork(result.cleanup);
      report.cases.push(result);
    }
    if (!completedWithoutSkippedWork(result.cleanup)) break;
  }

  report.passed = report.preflight_cleanup.status === "completed"
    && report.cases.length === validated.length
    && completedWithoutSkippedWork(report.preflight_cleanup)
    && report.cases.every(item => item.passed && completedWithoutSkippedWork(item.cleanup));
  return report;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const [key, inline] = token.slice(2).split("=", 2);
    args[key] = inline ?? argv[++index];
  }
  return args;
}

function writeReport(outputPath, report) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const temporary = `${outputPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, outputPath);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const casesPath = path.resolve(root, args.cases ?? "evals/data/godel-live-stress-cases-v1.json");
  const outputPath = path.resolve(root, args.output ?? "reports/godel-live-stress-latest.json");
  const secretPath = path.resolve(root, args.secret ?? ".godel-voice-secret");
  const secret = fs.readFileSync(secretPath, "utf8").trim();
  const cases = validateLiveStressCases(JSON.parse(fs.readFileSync(casesPath, "utf8")), {
    maximum: boundedInteger(args["max-cases"], 20, 1, 20)
  });
  const handoff = new LocalHandoffClient({
    baseUrl: args.server ?? "http://127.0.0.1:17841",
    secret,
    pollMs: boundedInteger(args["poll-ms"], 100, 25, 2_000)
  });
  await handoff.health();
  const report = await runLiveGodelStress({
    cases,
    handoff,
    timeoutMs: boundedInteger(args["timeout-ms"], 45_000, 1_000, 120_000),
    cleanupTimeoutMs: boundedInteger(args["cleanup-timeout-ms"], 30_000, 1_000, 120_000)
  });
  writeReport(outputPath, report);
  process.stdout.write(`${JSON.stringify({
    output: path.relative(root, outputPath),
    passed: report.passed,
    cases_completed: report.cases.filter(item => item.workflow?.status === "completed").length,
    cases_total: report.case_count,
    cleanup_complete: completedWithoutSkippedWork(report.preflight_cleanup)
      && report.cases.every(item => completedWithoutSkippedWork(item.cleanup))
  }, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
