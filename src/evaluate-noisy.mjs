import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileVoiceRequest } from "./compiler.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const allCases = JSON.parse(fs.readFileSync(path.resolve(here, "../evals/data/noisy-eval-cases.json"), "utf8"));
const requestedIds = new Set((process.env.EVAL_IDS ?? "").split(",").map(value => value.trim()).filter(Boolean));
const cases = requestedIds.size ? allCases.filter(item => requestedIds.has(item.id)) : allCases;
const concurrency = Math.max(1, Number(process.env.EVAL_CONCURRENCY ?? 6));

function actionMatches(actual, expected) {
  return actual.some(action =>
    (!expected.feature || action.feature === expected.feature) &&
    (!expected.operation || action.operation === expected.operation) &&
    (expected.value === undefined || String(action.value).toLowerCase() === String(expected.value).toLowerCase())
  );
}

async function evaluate(item) {
  const startedAt = Date.now();
  try {
    const result = await compileVoiceRequest(item.utterance, { resolvedEntities: item.resolved_entities ?? [] });
    const actual = result.intent.kind === "clarify" ? "clarify" : result.intent.command;
    const commandOk = actual === item.expected;
    const queryOk = !item.expect_query_contains || String(result.intent.query ?? "").toLowerCase().includes(item.expect_query_contains.toLowerCase());
    const argumentOk = !item.expect_argument || result.intent.arguments.includes(item.expect_argument);
    const actionOk = !item.expect_action || actionMatches(result.intent.post_open_actions, item.expect_action);
    return { id: item.id, utterance: item.utterance, expected: item.expected, actual, pass: commandOk && queryOk && argumentOk && actionOk, command_ok: commandOk, query_ok: queryOk, argument_ok: argumentOk, action_ok: actionOk, result };
  } catch (error) {
    return { id: item.id, utterance: item.utterance, expected: item.expected, actual: "error", pass: false, error: error.message, elapsed_ms: Date.now() - startedAt };
  }
}

const results = new Array(cases.length);
let next = 0;
async function worker() {
  while (next < cases.length) {
    const index = next++;
    results[index] = await evaluate(cases[index]);
    process.stderr.write(`${results[index].pass ? "PASS" : "FAIL"} ${results[index].id}: ${results[index].actual}\n`);
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, cases.length) }, worker));

const passed = results.filter(result => result.pass).length;
const providerCounts = Object.fromEntries(Object.entries(results.reduce((counts, result) => {
  const provider = result.result?.inference?.provider ?? "unknown";
  counts[provider] = (counts[provider] ?? 0) + 1;
  return counts;
}, {})).sort());
const latencies = results.map(result => result.result?.inference?.latency_ms).filter(Number.isFinite).sort((a, b) => a - b);
const percentile = p => latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] : null;
const report = {
  generated_at: new Date().toISOString(),
  model: process.env.VOICE_LLM_MODEL,
  total: results.length,
  passed,
  failed: results.length - passed,
  accuracy: results.length ? passed / results.length : 0,
  providers: providerCounts,
  latency_ms: { p50: percentile(0.5), p95: percentile(0.95) },
  results
};
fs.mkdirSync(path.resolve(here, "../reports"), { recursive: true });
const reportName = process.env.EVAL_REPORT_NAME ?? "noisy-eval-latest.json";
if (!/^[a-zA-Z0-9._-]+\.json$/.test(reportName)) throw new Error("Invalid EVAL_REPORT_NAME");
fs.writeFileSync(path.resolve(here, "../reports", reportName), JSON.stringify(report, null, 2) + "\n");
process.stdout.write(JSON.stringify({ ...report, results: undefined }, null, 2) + "\n");
if (passed !== results.length) process.exitCode = 1;
