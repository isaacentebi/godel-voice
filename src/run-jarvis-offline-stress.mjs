import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseControlFollowup } from "./control-followup.mjs";
import { validateCases } from "./model-eval-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relativePath => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const spec = read("evals/data/jarvis-offline-stress-v3.json");
const cases = validateCases([...spec.sources.flatMap(read), ...spec.cases]);
const registry = read("catalog/commands.json").commands;
const commandCoverage = read("catalog/contracts/command-coverage.json");
const contracts = read("catalog/contracts/adapter-contracts-v1.json");

function canonicalAction(action) {
  return [
    String(action?.feature ?? "").toLowerCase(),
    String(action?.operation ?? "").toLowerCase(),
    JSON.stringify(action?.value ?? null)
  ].join("|");
}

function expectedProbe(item) {
  const step = item.expected.steps?.[0];
  if (!step) return null;
  return {
    kind: step.step_kind ?? "command",
    operation: step.control_operation ?? null,
    target: step.control_target ?? step.configure_target ?? null,
    value: step.control_value ?? null,
    actions: (step.actions ?? []).map(canonicalAction).sort()
  };
}

function actualProbe(plan) {
  const step = plan?.steps?.[0];
  if (!step) return null;
  return {
    kind: step.kind,
    operation: step.operation ?? null,
    target: step.target ?? null,
    value: step.value ?? null,
    actions: (step.actions ?? []).map(canonicalAction).sort()
  };
}

function runControlProbes(items) {
  const probes = [];
  for (const item of items.filter(candidate => candidate.probe?.kind === "control_followup")) {
    let plan = null;
    let error = null;
    try {
      plan = parseControlFollowup(item.utterance, {
        ...(item.context ?? {}),
        resolved_entities: item.resolved_entities ?? item.context?.resolved_entities ?? []
      });
    } catch (caught) {
      error = String(caught.message ?? caught);
    }

    const outcome = plan ? "plan" : "decline";
    const outcomePass = !error && outcome === item.probe.outcome;
    const shapePass = outcome !== "plan"
      || JSON.stringify(actualProbe(plan)) === JSON.stringify(expectedProbe(item));
    probes.push({
      id: item.id,
      expected_outcome: item.probe.outcome,
      observed_outcome: outcome,
      outcome_pass: outcomePass,
      shape_pass: outcomePass && shapePass,
      error
    });
  }
  return probes;
}

const probes = runControlProbes(cases);
const commands = new Set(cases.flatMap(item => item.expected.steps ?? []).map(step => step.command).filter(Boolean));
const tags = new Set(cases.flatMap(item => item.tags ?? []));
const enabledBindings = contracts.contracts.flatMap(contract => (
  contract.actions ?? []
).filter(action => action.binding?.enabled).map(action => `${contract.command}.${action.id}`));
const casesByKind = Object.groupBy(cases, item => item.expected.kind);
const strictCases = cases.filter(item => (
  item.schema_version === 2
  && item.scoring?.strict_steps === true
  && item.scoring?.actions === "exact"
));
const passedProbes = probes.filter(probe => probe.outcome_pass && probe.shape_pass).length;

const report = {
  schema_version: 3,
  generated_at: new Date().toISOString(),
  mode: "offline-deterministic-no-model",
  honesty: {
    model_accuracy: null,
    reason: "No live model or synthetic oracle result was scored. Metrics below measure corpus coverage and deterministic local parser behavior only.",
    runtime_execution_accuracy: null,
    reason_runtime: "No Arc session was used. Executable coverage is the declared verified adapter snapshot, not an execution claim."
  },
  corpus: {
    sources: spec.sources,
    new_cases: spec.cases.length,
    total_cases: cases.length,
    unique_ids: new Set(cases.map(item => item.id)).size,
    strict_exact_cases: strictCases.length,
    expected_kinds: Object.fromEntries(Object.entries(casesByKind).map(([kind, items]) => [kind, items.length])),
    command_coverage: {
      covered: commands.size,
      total: registry.length,
      missing: registry.map(command => command.code).filter(code => !commands.has(code))
    },
    required_tag_coverage: {
      covered: spec.required_tags.filter(tag => tags.has(tag)).length,
      total: spec.required_tags.length,
      missing: spec.required_tags.filter(tag => !tags.has(tag))
    }
  },
  architecture: {
    strict_or_live_commands: commandCoverage.commands.filter(command => !command.generic_only).length,
    total_commands: commandCoverage.commands.length,
    generic_only: commandCoverage.generic_catalog_only,
    verified_nested_bindings: enabledBindings
  },
  deterministic_fast_path: {
    passed: passedProbes,
    total: probes.length,
    accuracy: probes.length ? passedProbes / probes.length : null,
    results: probes
  }
};

const outputPath = path.join(root, "reports/jarvis-offline-stress-v3.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  output: path.relative(root, outputPath),
  corpus: report.corpus,
  architecture: report.architecture,
  deterministic_fast_path: {
    passed: report.deterministic_fast_path.passed,
    total: report.deterministic_fast_path.total,
    accuracy: report.deterministic_fast_path.accuracy
  }
}, null, 2)}\n`);

if (
  report.corpus.command_coverage.missing.length
  || report.corpus.required_tag_coverage.missing.length
  || report.deterministic_fast_path.passed !== probes.length
) {
  process.exitCode = 1;
}
