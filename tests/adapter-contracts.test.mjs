import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = JSON.parse(fs.readFileSync(path.join(root, "catalog", "commands.json"), "utf8"));
const contracts = JSON.parse(fs.readFileSync(path.join(root, "catalog", "contracts", "adapter-contracts-v1.json"), "utf8"));
const matrix = JSON.parse(fs.readFileSync(path.join(root, "catalog", "contracts", "capability-matrix.json"), "utf8"));

const registryByCode = new Map(registry.commands.map(command => [command.code, command]));
const matrixByCode = new Map(matrix.commands.map(command => [command.code, command]));
const contractByCode = new Map(contracts.contracts.map(command => [command.command, command]));
const expectedCommands = registry.commands.map(command => command.code).sort();

test("all 59 canonical commands have exactly one nested-capability contract", () => {
  assert.equal(registry.commands.length, 59, "canonical command count changed; audit the new registry before accepting it");
  assert.deepEqual([...contractByCode.keys()].sort(), expectedCommands);
  assert.equal(contractByCode.size, contracts.contracts.length, "duplicate command contract");
  for (const code of expectedCommands) {
    assert(registryByCode.has(code), `${code} absent from command registry`);
    assert(matrixByCode.has(code), `${code} absent from capability matrix`);
  }
});

test("every contract records an executable action tree or an explicit open-only/gated limitation", () => {
  for (const contract of contracts.contracts) {
    assert.match(contract.panel_identity, /\S/, `${contract.command} panel identity`);
    assert(Array.isArray(contract.actions), `${contract.command} actions`);
    if (contract.actions.length === 0) {
      assert(["open-only", "gated"].includes(contract.mode), `${contract.command} empty contract has no honest mode`);
      assert.match(contract.limitations ?? "", /\S/, `${contract.command} missing limitation`);
      assert.match(contract.evidence ?? "", /^https:\/\/godelterminal\.com\/docs\/commands\//, `${contract.command} missing official evidence`);
    }
  }
});

test("every contracted action is grounded in registry features or an explicit live observation", () => {
  for (const contract of contracts.contracts) {
    const command = registryByCode.get(contract.command);
    for (const action of contract.actions) {
      if (action.source_feature != null) {
        assert(command.features.includes(action.source_feature), `${contract.command}.${action.id} invented feature: ${action.source_feature}`);
      } else {
        assert.match(action.source_observation ?? "", /\S/, `${contract.command}.${action.id} missing observation`);
        assert.match(action.evidence ?? "", /^live-ui:/, `${contract.command}.${action.id} ungrounded observation`);
      }
      assert.match(action.evidence, /^(https:\/\/godelterminal\.com\/docs\/commands\/|live-ui:)/, `${contract.command}.${action.id} evidence`);
      assert.match(action.completion, /\S/, `${contract.command}.${action.id} completion assertion`);
      assert.match(action.operation, /\S/, `${contract.command}.${action.id} operation`);
      assert.match(action.value?.type ?? "", /\S/, `${contract.command}.${action.id} value type`);
      assert(action.safety || contracts.policy.action_defaults.safety, `${contract.command}.${action.id} safety`);
      assert(action.prerequisites || contracts.policy.action_defaults.prerequisites, `${contract.command}.${action.id} prerequisites`);
      assert(action.binding.preferred || contracts.policy.action_defaults.preferred_binding, `${contract.command}.${action.id} preferred binding`);
    }
  }
});

test("only explicitly verified controls have executable bindings", () => {
  const executable = new Set(contracts.policy.executable_binding_kinds);
  const nonExecutable = new Set(contracts.policy.non_executable_binding_kinds);
  for (const contract of contracts.contracts) {
    for (const action of contract.actions) {
      if (action.binding.enabled) {
        assert(executable.has(action.binding.kind), `${contract.command}.${action.id} enabled with a non-executable binding`);
      } else {
        assert(nonExecutable.has(action.binding.kind), `${contract.command}.${action.id} has unknown unbound kind`);
        assert(!executable.has(action.binding.kind), `${contract.command}.${action.id} promoted without live verification`);
      }
    }
  }
});

test("HMAP promotes only the live-observed index universe and Map/Table controls", () => {
  const actions = contractByCode.get("HMAP").actions;
  const enabled = actions.filter(action => action.binding.enabled).map(action => action.id);
  assert.deepEqual(enabled, ["universe.select", "view.select"]);
  const universe = actions.find(action => action.id === "universe.select");
  assert.equal(universe.binding.kind, "confirmed-unique-dom");
  assert.deepEqual(universe.value.allowed, ["S&P 500", "DJIA"]);
  const view = actions.find(action => action.id === "view.select");
  assert.equal(view.binding.kind, "confirmed-unique-dom");
  assert.deepEqual(view.value.allowed, ["Map", "Table"]);
  for (const id of ["watchlist.select", "size_by.select", "label.select", "sectors.toggle", "animate.toggle", "update_interval.set", "color_mode.select", "movers.toggle", "export.download"]) {
    assert.equal(actions.find(action => action.id === id).binding.enabled, false, `${id} must remain fail-closed`);
  }
});

test("IMAP exposes verified index/view while sector and table sort remain fail-closed", () => {
  const actions = contractByCode.get("IMAP").actions;
  assert.deepEqual(actions.filter(action => action.binding.enabled).map(action => action.id),["map.configure"]);
  assert.deepEqual(actions.find(action => action.id === "map.configure").value.view.allowed,["Map","Table"]);
  assert.equal(actions.find(action => action.id === "sector.drilldown").binding.enabled,false);
  const sort = actions.find(action => action.id === "members.sort");
  assert.equal(sort.binding.enabled,false);
  assert.deepEqual(sort.value.column.allowed,["Ticker","Name","Last","Change","Chg %","Volume"]);
  assert.match(sort.completion,/monotonic/);
});

test("MOST promotes only the live-verified result-count selector", () => {
  const actions = contractByCode.get("MOST").actions;
  assert.deepEqual(actions.filter(action => action.binding.enabled).map(action => action.id), ["results.select"]);
  assert.equal(actions.find(action => action.id === "results.select").binding.kind, "confirmed-native-callback");
  for (const id of ["ranking.select", "market_cap.set", "sector.select"]) {
    assert.equal(actions.find(action => action.id === id).binding.enabled, false);
  }
});

test("shared primitives cover identity, state, input and verified downloads", () => {
  for (const primitive of [
    "resolve_exact_panel", "wait_data_ready", "invoke_native_callback", "act_unique_dom",
    "focus_and_type_trusted", "select_enum", "set_range", "set_iso_date_range",
    "set_boolean", "verify_control_state", "begin_verified_download", "open_external_read_only"
  ]) assert(contracts.shared_primitives[primitive], `missing ${primitive}`);
  assert.equal(contracts.policy.fail_closed, true);
  assert.match(contracts.policy.download_gate, /download event/i);
});

test("official enum values are exact and difficult dynamic values stay dynamic", () => {
  const action = (code, id) => contractByCode.get(code).actions.find(item => item.id === id);
  assert.deepEqual(action("HALT", "tab.select").value.allowed, ["All", "Active", "Resumed"]);
  assert.deepEqual(action("MOST", "results.select").value.allowed, [10, 25, 50, 100]);
  assert.deepEqual(action("MOST", "ranking.select").value.allowed, ["Active", "Gainers", "Losers", "Value"]);
  assert.equal(action("MOST", "sector.select").value.allowed.length, 12);
  assert.deepEqual(action("HP", "resolution.select").value.allowed, ["1D", "1H", "1M"]);
  assert.deepEqual(action("FA", "statement.select").value.allowed, ["Income Statement", "Balance Sheet", "Cash Flow"]);
  assert.equal(action("EQS", "list_filter.add").value.items.startsWith("dynamic values"), true);
  assert.equal(action("HMAP", "size_by.select").value.type, "dynamic-enum");
  assert.equal(action("HMAP", "label.select").value.type, "dynamic-enum");
  assert.match(action("HMAP", "update_interval.set").value.range, /unverified/i);
});

test("EM contract enables only the end-to-end verified metric selector and strict valuation read", () => {
  const actions = contractByCode.get("EM").actions;
  const matrix = actions.find(action => action.id === "matrix.configure");
  assert.deepEqual(matrix.value.metric.allowed, [
    "Sales", "EBITDA", "Net Income", "EPS (GAAP)", "Total Assets", "Current Assets",
    "Current Liabilities", "Shareholder Equity", "Cash Flow From Operations",
    "Cash Flow From Investing", "Cash Flow From Financing"
  ]);
  assert.deepEqual(matrix.value.chart.allowed, ["Values Chart", "Growth Chart"]);
  assert.deepEqual(matrix.value.growth.allowed, ["YoY % Growth", "PoP % Growth"]);
  assert.equal(matrix.value.metric_aliases["Net Income (BFNG)"], "Net Income");
  const liveRevenue = actions.find(action => action.id === "metric.live_revenue.select");
  assert.deepEqual(liveRevenue.value.allowed, ["Gross Revenue", "Net Revenue"]);
  const series = actions.find(action => action.id === "series.visibility");
  assert.deepEqual(series.value.series.allowed, ["Historical", "Estimates"]);
  const enabled = actions.filter(action => action.binding.enabled).map(action => action.id);
  assert.deepEqual(enabled, ["metric.select", "valuation.read"]);
  assert.equal(actions.find(action => action.id === "metric.select").binding.kind, "confirmed-native-callback");
  const valuation = actions.find(action => action.id === "valuation.read");
  assert.equal(valuation.binding.kind, "confirmed-native-callback");
  assert.deepEqual(valuation.value.row.allowed, ["P/E", "P/B", "P/S", "P/CF", "EV/EBITDA", "EV/Sales", "EV/CF", "EV/FCF", "Dividend Yield"]);
  assert.equal(valuation.value.section.const, "Multiples");
  assert.equal(valuation.value.semantic_unit["Dividend Yield"], "Percent");
  for (const action of actions.filter(action => !["metric.select", "valuation.read"].includes(action.id))) {
    assert.equal(action.binding.enabled, false, `${action.id} must await end-to-end live verification`);
  }
  assert.match(series.completion, /legend text alone is not proof/i);
});

test("download contracts agree with the capability audit and block unresolved formats", () => {
  const actions = contracts.contracts.flatMap(contract => contract.actions
    .filter(action => action.operation === "download")
    .map(action => ({ command: contract.command, action })));
  for (const { command, action } of actions) {
    const audit = matrixByCode.get(command).export;
    if (audit.status === "verified" && !audit.formats.includes("unknown")) {
      assert.notEqual(action.value.type, "unresolved-format", `${command} lost verified format`);
    }
    if (audit.status === "observed-unverified") {
      assert.equal(action.binding.kind, "unverified", `${command} export icon incorrectly promoted`);
    }
    if (action.value.extensions) {
      for (const extensions of Object.values(action.value.extensions)) {
        assert(extensions.every(value => /^\.[a-z0-9]+$/i.test(value)), `${command} invalid extension contract`);
      }
    }
  }
  assert.equal(contractByCode.get("ANR").actions.find(action => action.id === "export.download").value.type, "unresolved-format");
  assert.equal(contractByCode.get("HDS").actions.find(action => action.id === "export.download").value.type, "unresolved-format");
});

test("every command tree has high-value natural-language examples", () => {
  for (const contract of contracts.contracts) {
    assert(Array.isArray(contract.voice) && contract.voice.length > 0, `${contract.command} voice examples`);
    assert(contract.voice.every(example => example.length >= 12), `${contract.command} weak voice example`);
  }
  assert(contracts.command_trees.table_filter_export.length >= 6);
  assert(contracts.command_trees.market_filter.length >= 5);
});

test("sensitive surfaces remain gated and no unverified action is executable", () => {
  const sensitive = ["BROK", "CHAT", "ACM", "AL", "NOTE", "ENT", "ERR"];
  for (const code of sensitive) {
    const contract = contractByCode.get(code);
    assert.equal(contract.mode, "gated", `${code} must be confirmation/manual gated`);
    assert.equal(contract.actions.length, 0, `${code} must not expose unattended nested mutations`);
  }
  const enabled = contracts.contracts.flatMap(contract => contract.actions
    .filter(action => action.binding.enabled)
    .map(action => `${contract.command}.${action.id}`));
  assert.deepEqual(enabled, ["EQS.range_filter.add", "EQS.list_filter.usd_technology", "EQS.screen.run", "EQS.screen.clear", "HDS.view.select", "MOST.results.select", "HMAP.universe.select", "HMAP.view.select", "EM.metric.select", "EM.valuation.read", "IMAP.map.configure", "N.query.set", "SECF.people_search.configure", "OMON.strike_depth.set", "G.chart.resolution.1h", "HMS.comparison.configure"], "only end-to-end verified nested controls may be enabled");
});
