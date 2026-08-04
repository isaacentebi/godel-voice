import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const context = { globalThis: {}, module: undefined, setTimeout, URL };
vm.runInNewContext(fs.readFileSync(new URL("../extension/adapters/discovery-holdings.js", import.meta.url), "utf8"), context);
const api = context.globalThis.GodelVoiceDiscoveryHoldingsAdapters;
const plain = value => JSON.parse(JSON.stringify(value));

function panel(command, title) {
  return {
    textContent: title,
    getAttribute(name) {
      if (name === "data-cy-command-type") return command;
      if (name === "data-panel-title") return title;
      return null;
    },
    querySelectorAll() { return []; }
  };
}

test("exports exact documented EQS and SECF enums while every contract stays disabled", () => {
  assert.equal(api.EQS_RANGE_FIELDS.length, 14);
  assert.deepEqual(plain(api.EQS_LIST_FIELDS), ["Currency", "Venue", "HQ Country", "Sector", "Sub-Sector"]);
  assert.deepEqual(plain(api.EQS_BOOLEAN_FIELDS), ["Private Company"]);
  assert.equal(api.EQS_FILTER_MENU.length, 20);
  assert.equal(new Set(api.EQS_FILTER_MENU).size, 20);
  assert.deepEqual(plain(api.SECF_MAX), [50, 100, 250, 500]);
  assert.deepEqual(plain(api.HDS_VIEWS), ["Table", "Treemap", "Bubble"]);
  assert.deepEqual(plain(api.HDS_OBSERVED_CONTROLS), ["Download Data", "Table", "Treemap", "Bubble", "Columns"]);
  for (const contract of Object.values(api.CONTRACTS)) assert.equal(contract.enabled, false);
  assert.equal(api.CONTRACTS.HLDR.status, "open-only");
  assert.deepEqual(plain(api.LIVE_BINDING_CANDIDATES).map(item => `${item.command}:${item.action}`), [
    "HDS:view.select", "EQS:screen.run", "EQS:screen.clear", "SECF:search.configure"
  ]);
});

test("exact panel identity cannot fall back to descendant text or confuse HDS with HLDR", async () => {
  const unlabeled = {
    textContent: "HOLDERS portfolio rows",
    getAttribute() { return null; },
    querySelectorAll() { return []; }
  };
  await assert.rejects(api.createHDSAdapter({
    bindingVerified: true,
    readState() { return { view: "Table", table_visible: true, treemap_visible: false, bubble_visible: false }; },
    applyAction() {}
  }).run(unlabeled, { feature: "view", operation: "select", value: "Table" }), /not HDS/);
  const latestHoldings = panel("HLDR", "HOLDERS");
  await assert.rejects(api.createHDSAdapter({
    bindingVerified: true,
    readState() { return { view: "Table", table_visible: true, treemap_visible: false, bubble_visible: false }; },
    applyAction() {}
  }).run(latestHoldings, { feature: "view", operation: "select", value: "Table" }), /not HDS/);
});

test("EQS normalizes stacked filters and rejects invented or inverted ranges", () => {
  assert.deepEqual(plain(api.normalizeEQSAction({
    feature: "range_filter", operation: "add",
    value: { field: "P/E (Fwd)", minimum: 5, maximum: 25 }
  })), { feature: "range_filter", operation: "add", value: { field: "P/E (Fwd)", minimum: 5, maximum: 25 } });
  assert.deepEqual(plain(api.normalizeEQSAction({
    feature: "list_filter", operation: "add", value: { field: "Sector", items: ["Technology", "Healthcare"] }
  })).value.items, ["Technology", "Healthcare"]);
  assert.throws(() => api.normalizeEQSAction({ feature: "range_filter", operation: "add", value: { field: "PEG", maximum: 2 } }), /Unsupported/);
  assert.throws(() => api.normalizeEQSAction({ feature: "range_filter", operation: "add", value: { field: "Market Cap (USD)", minimum: 10, maximum: 1 } }), /cannot exceed/);
  assert.throws(() => api.normalizeEQSAction({ feature: "list_filter", operation: "add", value: { field: "Sector", items: ["Tech", "tech"] } }), /duplicate/);
});

test("EQS uses exact dynamic values and proves authoritative filter state", async () => {
  const state = { filters: [], currency: "USD", primary_listings_only: false, hide_no_trades: false, status: "idle" };
  const environment = {
    bindingVerified: true,
    availableValues(_root, field) { return field === "Sector" ? ["Technology", "Healthcare"] : []; },
    availableCurrencies() { return ["USD", "EUR"]; },
    readState() { return state; },
    async applyAction(_root, action) {
      if (action.feature === "list_filter") state.filters.push({ type: "list", ...action.value });
      if (action.feature === "currency") state.currency = action.value;
      if (action.feature === "screen" && action.operation === "run") state.status = "complete";
    },
    async waitForCompletion(check) { return check(); }
  };
  const adapter = api.createEQSAdapter(environment);
  const first = await adapter.run(panel("EQS", "EQUITY SCREENER"), {
    feature: "list_filter", operation: "add", value: { field: "Sector", items: ["technology"] }
  });
  assert.equal(first.changed, true);
  assert.deepEqual(state.filters[0].items, ["Technology"]);
  const second = await adapter.run(panel("EQS", "EQUITY SCREENER"), {
    feature: "list_filter", operation: "add", value: { field: "Sector", items: ["Technology"] }
  });
  assert.equal(second.changed, false);
  await assert.rejects(adapter.run(panel("EQS", "EQUITY SCREENER"), {
    feature: "list_filter", operation: "add", value: { field: "Sector", items: ["Crypto"] }
  }), /unavailable or ambiguous/);
});

test("EQS range completion distinguishes an absent bound from numeric zero", () => {
  const action = api.normalizeEQSAction({
    feature: "range_filter", operation: "add", value: { field: "Market Cap (USD)", maximum: 10 }
  });
  assert.equal(api.assertEQSCompletion({
    filters: [{ type: "range", field: "Market Cap (USD)", minimum: null, maximum: 10 }]
  }, action), true);
  assert.throws(() => api.assertEQSCompletion({
    filters: [{ type: "range", field: "Market Cap (USD)", minimum: 0, maximum: 10 }]
  }, action), /does not match/);
});

test("EQS download requires a verified event, non-empty expected file and no overwrite", async () => {
  const action = { feature: "export", operation: "download", value: "CSV" };
  await assert.rejects(api.createEQSAdapter().run(panel("EQS", "EQUITY SCREENER"), action), /not live-verified/);
  const adapter = api.createEQSAdapter({
    downloadBindingVerified: true,
    async beginDownload() { return { download_event: true, filename: "screen.csv", size: 128, overwrote_existing: false }; }
  });
  assert.deepEqual(plain(await adapter.run(panel("EQS", "EQUITY SCREENER"), action)), { filename: "screen.csv", size: 128, format: "CSV" });
  assert.throws(() => api.assertDownloadArtifact({ download_event: true, filename: "screen.json", size: 12, overwrote_existing: false }, "CSV"), /Unexpected/);
  assert.throws(() => api.assertDownloadArtifact({ download_event: true, filename: "screen.csv", size: 0, overwrote_existing: false }, "CSV"), /empty/);
  assert.throws(() => api.assertDownloadArtifact({ download_event: true, filename: "screen.csv", size: 12, overwrote_existing: true }, "CSV"), /overwrite/);
});

test("EQS Run/Clear seam requires proof, proves a fresh run and refuses filter edits", async () => {
  const liveProof = {
    session_authenticated: true,
    command: "EQS",
    action: "screen.run_clear",
    controls: ["Run", "Clear"],
    state_fields: ["filters", "status", "run_id"],
    observed_at: "2026-08-03T18:45:53.752Z",
    godel_build: "4.5.7"
  };
  assert.throws(() => api.createEQSRunClearEnvironment({}), /authenticated live-proof/);
  const state = { filters: [{ type: "boolean", field: "Private Company", value: true }], status: "complete", run_id: "run-1" };
  const environment = api.createEQSRunClearEnvironment({
    liveProof,
    runScreen() { state.run_id = "run-2"; state.status = "complete"; },
    clearScreen() { state.filters = []; },
    readScreenState() { return state; },
    async waitForCompletion(check) { return check(); }
  });
  const adapter = api.createEQSAdapter(environment);
  assert.equal((await adapter.run(panel("EQS", "EQUITY SCREENER"), { feature: "screen", operation: "run" })).changed, true);
  assert.equal(state.run_id, "run-2");
  assert.equal((await adapter.run(panel("EQS", "EQUITY SCREENER"), { feature: "screen", operation: "clear" })).changed, true);
  assert.deepEqual(state.filters, []);
  await assert.rejects(adapter.run(panel("EQS", "EQUITY SCREENER"), {
    feature: "boolean_filter", operation: "add", value: { field: "Private Company", value: true }
  }), /refuses filter actions/);
  assert.equal(api.CONTRACTS.EQS.enabled, false);
});

test("EQS authenticated Run proof cannot accept a stale completed result", async () => {
  const state = { filters: [], status: "complete", run_id: "same-run" };
  const environment = api.createEQSRunClearEnvironment({
    liveProof: {
      session_authenticated: true, command: "EQS", action: "screen.run_clear",
      controls: ["Run", "Clear"], state_fields: ["filters", "status", "run_id"],
      observed_at: "2026-08-03T18:45:53.752Z", godel_build: "4.5.7"
    },
    runScreen() {}, clearScreen() { state.filters = []; }, readScreenState() { return state; },
    async waitForCompletion(check) { return check(); }
  });
  await assert.rejects(api.createEQSAdapter(environment).run(panel("EQS", "EQUITY SCREENER"), {
    feature: "screen", operation: "run"
  }), /fresh run/);
});

test("SECF supports exact tabs and result caps, with People-specific restrictions", () => {
  const action = api.normalizeSECFAction({
    feature: "search", operation: "configure",
    value: { query: "Citigroup", tab: "Corporate Bonds", max: 100, venues: ["TRACE"], countries: ["US"], hide_no_trade: true }
  });
  assert.equal(action.value.tab, "Corporate Bonds");
  assert.equal(action.value.max, 100);
  assert.throws(() => api.normalizeSECFAction({ feature: "search", operation: "configure", value: { tab: "People", venues: ["NYSE"] } }), /People does not support/);
  assert.throws(() => api.normalizeSECFAction({ feature: "search", operation: "configure", value: { max: 1000 } }), /Unsupported SECF max/);
});

test("SECF refuses dynamic guesses and proves the completed bounded result set", async () => {
  const state = { query: "", tab: "All", max: 50, venues: [], countries: [], hide_no_trade: false, status: "idle", rows: [] };
  const adapter = api.createSECFAdapter({
    bindingVerified: true,
    availableVenues() { return ["TRACE", "NYSE"]; },
    availableCountries() { return ["US", "JP"]; },
    readState() { return state; },
    async applyAction(_root, action) { Object.assign(state, action.value, { status: "complete", rows: [{ ticker: "BACR" }] }); },
    async waitForCompletion(check) { return check(); }
  });
  const result = await adapter.run(panel("SECF", "SECURITIES FINDER"), {
    feature: "search", operation: "configure",
    value: { query: "bank", tab: "Corporate Bonds", max: 100, venues: ["trace"], countries: ["US"], hide_no_trade: true }
  });
  assert.equal(result.changed, true);
  assert.deepEqual(state.venues, ["TRACE"]);
  await assert.rejects(adapter.run(panel("SECF", "SECURITIES FINDER"), {
    feature: "search", operation: "configure", value: { tab: "Equities", venues: ["FAKE"] }
  }), /unavailable or ambiguous/);
});

test("HDS view and row navigation require rendered state and exact one-row movement", async () => {
  const state = { view: "Table", table_visible: true, treemap_visible: false, bubble_visible: false, selected_index: 2, selected_row_id: "holder-2" };
  const adapter = api.createHDSAdapter({
    bindingVerified: true,
    readState() { return state; },
    async applyAction(_root, action) {
      if (action.feature === "view") Object.assign(state, {
        view: action.value,
        table_visible: action.value === "Table",
        treemap_visible: action.value === "Treemap",
        bubble_visible: action.value === "Bubble"
      });
      if (action.feature === "row") Object.assign(state, { selected_index: state.selected_index + 1, selected_row_id: "holder-3" });
    },
    async waitForCompletion(check) { return check(); }
  });
  assert.equal((await adapter.run(panel("HDS", "HOLDERS"), { feature: "view", operation: "select", value: "Table" })).changed, false);
  assert.equal((await adapter.run(panel("HDS", "HOLDERS"), { feature: "view", operation: "select", value: "Treemap" })).changed, true);
  const row = await adapter.run(panel("HDS", "HOLDERS"), { feature: "row", operation: "select", value: "Next" });
  assert.equal(row.changed, true);
  assert.equal(state.selected_index, 3);
});

test("HDS view-only integration seam requires authenticated proof and refuses every other action", async () => {
  const liveProof = {
    session_authenticated: true,
    command: "HDS",
    action: "view.select",
    controls: ["Download Data", "Table", "Treemap", "Bubble", "Columns"],
    state_fields: ["view", "table_visible", "treemap_visible", "bubble_visible"],
    observed_at: "2026-08-03T18:45:53.752Z",
    godel_build: "4.5.7"
  };
  assert.throws(() => api.createHDSViewEnvironment({}), /authenticated live-proof/);
  assert.throws(() => api.createHDSViewEnvironment({
    liveProof: { ...liveProof, controls: ["Download Data", "Table", "Tree", "Bubble", "Columns"] },
    selectExactView() {}, readViewState() {}
  }), /exact observed HDS controls/);

  const state = { view: "Table", table_visible: true, treemap_visible: false, bubble_visible: false };
  const calls = [];
  const environment = api.createHDSViewEnvironment({
    liveProof,
    async selectExactView(_root, value) {
      calls.push(value);
      Object.assign(state, {
        view: value,
        table_visible: value === "Table",
        treemap_visible: value === "Treemap",
        bubble_visible: value === "Bubble"
      });
    },
    readViewState() { return state; },
    async waitForCompletion(check) { return check(); }
  });
  assert.equal(api.CONTRACTS.HDS.enabled, false);
  assert.equal(environment.liveProof.godel_build, "4.5.7");
  const adapter = api.createHDSAdapter(environment);
  const result = await adapter.run(panel("HDS", "HOLDERS"), { feature: "view", operation: "select", value: "Bubble" });
  assert.equal(result.changed, true);
  assert.deepEqual(calls, ["Bubble"]);
  await assert.rejects(adapter.run(panel("HDS", "HOLDERS"), {
    feature: "row", operation: "select", value: "Next"
  }), /view-only binding refuses non-view actions/);
});

test("HDS view-only state reader rejects inferred or contradictory visibility", () => {
  assert.throws(() => api.assertHDSViewState({ view: "Table" }), /explicit Table, Treemap and Bubble visibility/);
  assert.throws(() => api.assertHDSViewState({ view: "Bubble", table_visible: true, treemap_visible: false, bubble_visible: false }), /internally inconsistent/);
  assert.deepEqual(plain(api.assertHDSViewState({ view: "table", table_visible: true, treemap_visible: false, bubble_visible: false })), {
    view: "Table", table_visible: true, treemap_visible: false, bubble_visible: false
  });
});

test("HDS filing navigation is explicit, separately verified, and restricted to SEC archive URLs", async () => {
  assert.throws(() => api.normalizeHDSAction({ feature: "filing", operation: "open", value: {} }), /explicit intent/);
  const state = { selected_index: 0, selected_row_id: "holder-a" };
  const base = { bindingVerified: true, readState: () => state, applyAction() {} };
  await assert.rejects(api.createHDSAdapter(base).run(panel("HDS", "HOLDERS"), {
    feature: "filing", operation: "open", value: { explicit: true }
  }), /not live-verified/);
  const adapter = api.createHDSAdapter({
    ...base, externalNavigationVerified: true,
    async openFiling() { return { holder_id: "holder-a", url: "https://www.sec.gov/Archives/edgar/data/123/filing.txt" }; }
  });
  const result = await adapter.run(panel("HDS", "HOLDERS"), { feature: "filing", operation: "open", value: { explicit: true } });
  assert.match(result.url, /sec\.gov\/Archives/);
  assert.equal(api.isVerified13F("https://example.com/Archives/edgar/data/123/file.txt"), false);
  assert.throws(() => api.normalizeHDSAction({ feature: "export", operation: "download" }), /file format/);
  await assert.rejects(api.createHDSAdapter({
    ...base,
    readState() { return { selected_index: -1, selected_row_id: "" }; },
    externalNavigationVerified: true,
    async openFiling() { return { holder_id: "", url: "https://www.sec.gov/Archives/edgar/data/123/filing.txt" }; }
  }).run(panel("HDS", "HOLDERS"), { feature: "filing", operation: "open", value: { explicit: true } }), /exact selected holder/);
});

test("holdings workflows distinguish who owns a company from what a fund owns", () => {
  assert.deepEqual(plain(api.buildHoldingsWorkflow({ security: "NVDA US EQ", intent: "who owns", view: "Treemap" })), {
    command: "HDS", security: "NVDA US EQ", actions: [{ feature: "view", operation: "select", value: "Treemap" }]
  });
  assert.deepEqual(plain(api.buildHoldingsWorkflow({ security: "BRK.B US EQ", intent: "latest holdings" })), {
    command: "HLDR", security: "BRK.B US EQ", actions: []
  });
  assert.throws(() => api.buildHoldingsWorkflow({ security: "BRK.B", intent: "latest holdings", export: "CSV" }), /no grounded nested controls/);
  assert.throws(() => api.buildHoldingsWorkflow({ security: "NVDA", intent: "holdings" }), /distinguish who owns/);
});

test("all default adapters fail closed and source has no generic active CSS success", async () => {
  await assert.rejects(api.createEQSAdapter().run(panel("EQS", "EQUITY SCREENER"), { feature: "screen", operation: "run" }), /not live-verified/);
  await assert.rejects(api.createSECFAdapter().run(panel("SECF", "SECURITIES FINDER"), { feature: "search", operation: "configure", value: {} }), /not live-verified/);
  await assert.rejects(api.createHDSAdapter().run(panel("HDS", "HOLDERS"), { feature: "view", operation: "select", value: "Treemap" }), /not live-verified/);
  const source = fs.readFileSync(new URL("../extension/adapters/discovery-holdings.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /classList\.(?:contains|toggle).*active/i);
  assert.doesNotMatch(source, /matches\([^)]*\.active/i);
});
