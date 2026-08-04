import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFixtureRunner, createLiveRunner, readJson, redact, runRouteEvaluation, validateCases, validateRoute } from "./model-eval-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument ${token}`);
    const key = token.slice(2).replaceAll("-", "_");
    if (key === "offline") options.offline = true;
    else options[key] = argv[++index];
  }
  return options;
}

function resolveInput(value, fallback) {
  return path.resolve(process.cwd(), value ?? fallback);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const offline = args.offline === true;
  const casesFile = resolveInput(args.cases, offline ? "data/model-eval-fixture-cases.json" : "data/model-eval-cases.json");
  const routesFile = resolveInput(args.routes, "data/model-eval-routes.example.json");
  const cases = validateCases(readJson(casesFile));
  let routes = readJson(routesFile);
  const requestedRoutes = new Set(String(args.route ?? "").split(",").filter(Boolean));
  if (requestedRoutes.size) routes = routes.filter(route => requestedRoutes.has(route.id));
  if (!routes.length) throw new Error("No evaluation routes selected");
  let selectedPartitionIds = [];
  if (args.split_file || args.partition) {
    if (!args.split_file || !args.partition) throw new Error("Use --split-file and --partition together");
    const split = readJson(resolveInput(args.split_file));
    selectedPartitionIds = split[args.partition];
    if (!Array.isArray(selectedPartitionIds)) throw new Error(`Unknown split partition ${args.partition}`);
  }
  const ids = new Set(selectedPartitionIds.length ? selectedPartitionIds : String(args.ids ?? "").split(",").filter(Boolean));
  const selectedCases = ids.size ? cases.filter(testCase => ids.has(testCase.id)) : cases;
  if (!selectedCases.length) throw new Error("No evaluation cases selected");
  const fixtures = offline ? readJson(resolveInput(args.fixtures, "data/model-eval-fixtures.json")) : null;
  const reports = [];
  for (const routeSource of routes) {
    const route = { ...routeSource, offline };
    validateRoute(route, { offline });
    const runner = offline ? createFixtureRunner(fixtures) : createLiveRunner(route);
    process.stderr.write(`Evaluating ${route.id}: ${selectedCases.length} cases x ${Number(args.repeat ?? 1)}\n`);
    reports.push(await runRouteEvaluation({
      route, cases: selectedCases, runner,
      repeat: Number(args.repeat ?? 1), warmup: Number(args.warmup ?? 0), concurrency: Number(args.concurrency ?? 1),
      retries: Number(args.retries ?? 0), retryBaseMs: Number(args.retry_base_ms ?? 1000)
    }));
  }
  const report = redact({
    schema_version: cases.some(testCase => Number(testCase.schema_version ?? 1) >= 2) ? 2 : 1,
    case_schema_versions: [...new Set(cases.map(testCase => Number(testCase.schema_version ?? 1)))].sort(),
    generated_at: new Date().toISOString(),
    offline,
    cases_file: path.relative(root, casesFile),
    routes_file: path.relative(root, routesFile),
    reports
  });
  const output = resolveInput(args.output, offline ? "reports/model-eval-offline.json" : `reports/model-eval-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ output, reports: reports.map(item => ({ route: item.route, overall: item.overall, metrics: item.metrics, latency_ms: item.latency_ms, usage: item.usage })) }, null, 2) + "\n");
  if (reports.some(item => item.overall.accuracy !== 1)) process.exitCode = 1;
}

main().catch(error => {
  console.error(redact(String(error.message ?? error)));
  process.exitCode = 1;
});
