(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GodelVoiceDiscoveryHoldingsAdapters = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const EQS_RANGE_FIELDS = Object.freeze([
    "Market Cap (USD)", "P/E (Fwd)", "P/E (TTM)", "P/S (Fwd)", "P/S (TTM)",
    "P/B (Fwd)", "P/B (TTM)", "P/CF (Fwd)", "P/CF (TTM)", "EPS (Fwd 12mo)",
    "Rev. (TTM, USD)", "Rev. (Fwd 12mo, USD)",
    "Net Inc. (TTM, USD)", "Net Inc. (Fwd 12mo, USD)"
  ]);
  const EQS_LIST_FIELDS = Object.freeze(["Currency", "Venue", "HQ Country", "Sector", "Sub-Sector"]);
  const EQS_BOOLEAN_FIELDS = Object.freeze(["Private Company"]);
  const EQS_FILTER_MENU = Object.freeze([
    "Currency", "Venue", "HQ Country", "Sector", "Sub-Sector", ...EQS_RANGE_FIELDS.slice(0, 1),
    "Private Company", ...EQS_RANGE_FIELDS.slice(1)
  ]);
  const SECF_TABS = Object.freeze([
    "All", "Equities", "Corporate Bonds", "Options", "Sovereign Bonds",
    "Crypto", "Index", "Futures", "Forex", "People"
  ]);
  const SECF_MAX = Object.freeze([50, 100, 250, 500]);
  const HDS_VIEWS = Object.freeze(["Table", "Treemap", "Bubble"]);
  const HDS_OBSERVED_CONTROLS = Object.freeze(["Download Data", "Table", "Treemap", "Bubble", "Columns"]);
  const EXPORT_EXTENSIONS = Object.freeze({ CSV: ".csv", JSON: ".json" });

  // These are activation candidates, not claims that a live Godel binding exists.
  // Each candidate is atomic in this adapter and has an authoritative postcondition.
  const LIVE_BINDING_CANDIDATES = Object.freeze([
    Object.freeze({ command: "HDS", action: "view.select", rank: 1, postcondition: "exact Table/Treemap/Bubble view plus mutually exclusive rendered visibility" }),
    Object.freeze({ command: "EQS", action: "screen.run", rank: 2, postcondition: "authoritative screen status is complete" }),
    Object.freeze({ command: "EQS", action: "screen.clear", rank: 3, postcondition: "authoritative active-filter list is empty" }),
    Object.freeze({ command: "SECF", action: "search.configure", rank: 4, postcondition: "query, tab, cap, filters and bounded completed rows all match" })
  ]);

  const CONTRACTS = Object.freeze({
    EQS: Object.freeze({ command: "EQS", enabled: false, status: "documented-unbound" }),
    SECF: Object.freeze({ command: "SECF", enabled: false, status: "documented-unbound" }),
    HDS: Object.freeze({ command: "HDS", enabled: false, status: "documented-unbound" }),
    HLDR: Object.freeze({ command: "HLDR", enabled: false, status: "open-only" })
  });

  const clean = value => String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const fold = value => clean(value).toLowerCase();
  const same = (left, right) => fold(left) === fold(right);

  function exactEnum(value, allowed, field) {
    const match = allowed.find(candidate => same(candidate, value));
    if (match == null) throw new Error(`Unsupported ${field}: ${clean(value) || "empty"}`);
    return match;
  }

  function optionalNumber(value, field) {
    if (value == null || value === "") return null;
    const number = typeof value === "number" ? value : Number(clean(value).replace(/,/g, ""));
    if (!Number.isFinite(number)) throw new Error(`${field} must be a finite number`);
    return number;
  }

  function exactStringList(values, field) {
    if (!Array.isArray(values) || values.length === 0) throw new Error(`${field} must be a non-empty list`);
    const result = values.map(value => clean(value));
    if (result.some(value => !value)) throw new Error(`${field} contains an empty value`);
    if (new Set(result.map(fold)).size !== result.length) throw new Error(`${field} contains duplicate values`);
    return result;
  }

  function assertDynamicValues(requested, available, field) {
    if (!Array.isArray(available)) throw new Error(`${field} live values are unavailable`);
    return requested.map(value => {
      const matches = available.filter(candidate => same(candidate, value));
      if (matches.length !== 1) throw new Error(`${field} value '${value}' is unavailable or ambiguous`);
      return clean(matches[0]);
    });
  }

  function assertPanel(panel, command, exactTitles) {
    if (!panel || typeof panel.querySelectorAll !== "function") throw new Error(`${command} requires an exact panel root`);
    const type = clean(panel.getAttribute?.("data-cy-command-type") ?? panel.getAttribute?.("data-command"));
    const title = clean(panel.getAttribute?.("aria-label") ?? panel.getAttribute?.("data-panel-title"));
    if (type) {
      if (same(type, command)) return panel;
      throw new Error(`Addressed panel is not ${command}`);
    }
    if (exactTitles.some(candidate => same(title, candidate))) return panel;
    throw new Error(`Addressed panel is not ${command}`);
  }

  function sameOptionalNumber(observed, expected) {
    if (expected == null) return observed == null;
    return observed != null && Number(observed) === Number(expected);
  }

  function normalizeEQSAction(action) {
    if (!action || typeof action !== "object") throw new Error("EQS action must be an object");
    const feature = fold(action.feature).replace(/[._-]+/g, "_");
    const operation = fold(action.operation);
    const value = action.value;
    if (feature === "range_filter" && operation === "add") {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("EQS range filter must be an object");
      const field = exactEnum(value.field, EQS_RANGE_FIELDS, "EQS range field");
      const minimum = optionalNumber(value.minimum ?? value.min, "EQS minimum");
      const maximum = optionalNumber(value.maximum ?? value.max, "EQS maximum");
      if (minimum == null && maximum == null) throw new Error("EQS range filter needs a minimum or maximum");
      if (minimum != null && maximum != null && minimum > maximum) throw new Error("EQS minimum cannot exceed maximum");
      return { feature, operation, value: { field, minimum, maximum } };
    }
    if (feature === "list_filter" && operation === "add") {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("EQS list filter must be an object");
      return {
        feature, operation,
        value: { field: exactEnum(value.field, EQS_LIST_FIELDS, "EQS list field"), items: exactStringList(value.items, "EQS list items") }
      };
    }
    if (feature === "currency" && operation === "select") {
      if (!clean(value)) throw new Error("EQS currency is empty");
      return { feature, operation, value: clean(value) };
    }
    if (["primary_listings", "hide_no_trades"].includes(feature) && operation === "select") {
      if (typeof value !== "boolean") throw new Error(`EQS ${feature} must be boolean`);
      return { feature, operation, value };
    }
    if (feature === "boolean_filter" && operation === "add") {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("EQS boolean filter must be an object");
      if (typeof value.value !== "boolean") throw new Error("EQS boolean filter value must be boolean");
      return {
        feature, operation,
        value: { field: exactEnum(value.field, EQS_BOOLEAN_FIELDS, "EQS boolean field"), value: value.value }
      };
    }
    if (feature === "screen" && ["run", "clear"].includes(operation)) return { feature, operation, value: null };
    if (feature === "export" && operation === "download") {
      return { feature, operation, value: exactEnum(value, Object.keys(EXPORT_EXTENSIONS), "EQS export format") };
    }
    throw new Error(`Unsupported EQS action: ${feature || "empty"}.${operation || "empty"}`);
  }

  function normalizeSECFAction(action) {
    if (!action || typeof action !== "object") throw new Error("SECF action must be an object");
    if (fold(action.feature).replace(/[._-]+/g, "_") !== "search" || fold(action.operation) !== "configure") {
      throw new Error("SECF only supports search.configure");
    }
    const value = action.value;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("SECF configuration must be an object");
    const tab = exactEnum(value.tab ?? "All", SECF_TABS, "SECF tab");
    const max = Number(value.max ?? 50);
    if (!SECF_MAX.includes(max)) throw new Error(`Unsupported SECF max: ${max}`);
    const venues = value.venues == null ? [] : exactStringList(value.venues, "SECF venues");
    const countries = value.countries == null ? [] : exactStringList(value.countries, "SECF countries");
    const hideNoTrade = value.hide_no_trade ?? false;
    if (typeof hideNoTrade !== "boolean") throw new Error("SECF hide_no_trade must be boolean");
    if (tab === "People" && (venues.length || countries.length || hideNoTrade)) {
      throw new Error("SECF People does not support venue, country, or no-trade filters");
    }
    const query = clean(value.query);
    if (query.length > 200) throw new Error("SECF query is too long");
    return { feature: "search", operation: "configure", value: { query, tab, max, venues, countries, hide_no_trade: hideNoTrade } };
  }

  function normalizeHDSAction(action) {
    if (!action || typeof action !== "object") throw new Error("HDS action must be an object");
    const feature = fold(action.feature).replace(/[._-]+/g, "_");
    const operation = fold(action.operation);
    if (feature === "view" && operation === "select") {
      return { feature, operation, value: exactEnum(action.value, HDS_VIEWS, "HDS view") };
    }
    if (feature === "row" && operation === "select") {
      return { feature, operation, value: exactEnum(action.value, ["Previous", "Next"], "HDS row direction") };
    }
    if (feature === "filing" && operation === "open") {
      if (action.value?.explicit !== true) throw new Error("HDS filing navigation requires explicit intent");
      return { feature, operation, value: { explicit: true } };
    }
    if (feature === "export" && operation === "download") {
      throw new Error("HDS export remains disabled because Godel does not document its file format");
    }
    throw new Error(`Unsupported HDS action: ${feature || "empty"}.${operation || "empty"}`);
  }

  function findFilter(state, type, field) {
    const matches = (state?.filters ?? []).filter(filter => same(filter.type, type) && same(filter.field, field));
    if (matches.length !== 1) throw new Error(`Expected one active ${field} filter; found ${matches.length}`);
    return matches[0];
  }

  function assertEQSCompletion(state, action, before = null) {
    if (!state || typeof state !== "object") throw new Error("EQS authoritative state is unavailable");
    if (action.feature === "range_filter") {
      const filter = findFilter(state, "range", action.value.field);
      if (!sameOptionalNumber(filter.minimum, action.value.minimum) ||
        !sameOptionalNumber(filter.maximum, action.value.maximum)) throw new Error("EQS range filter state does not match");
    } else if (action.feature === "list_filter") {
      const filter = findFilter(state, "list", action.value.field);
      const observed = [...(filter.items ?? [])].map(fold).sort();
      const expected = [...action.value.items].map(fold).sort();
      if (JSON.stringify(observed) !== JSON.stringify(expected)) throw new Error("EQS list filter state does not match");
    } else if (action.feature === "boolean_filter") {
      const filter = findFilter(state, "boolean", action.value.field);
      if (filter.value !== action.value.value) throw new Error("EQS boolean filter state does not match");
    } else if (action.feature === "currency" && !same(state.currency, action.value)) {
      throw new Error("EQS currency state does not match");
    } else if (action.feature === "primary_listings" && state.primary_listings_only !== action.value) {
      throw new Error("EQS primary-listings state does not match");
    } else if (action.feature === "hide_no_trades" && state.hide_no_trades !== action.value) {
      throw new Error("EQS no-trade state does not match");
    } else if (action.feature === "screen" && action.operation === "run") {
      if (state.status !== "complete") throw new Error("EQS screen has not completed");
      if (before && clean(before.run_id) && same(state.run_id, before.run_id)) throw new Error("EQS screen did not produce a fresh run");
    } else if (action.feature === "screen" && action.operation === "clear" && (state.filters ?? []).length !== 0) {
      throw new Error("EQS filters were not cleared");
    }
    return true;
  }

  function assertSECFCompletion(state, action) {
    if (!state || typeof state !== "object") throw new Error("SECF authoritative state is unavailable");
    const expected = action.value;
    for (const key of ["query", "tab"]) if (!same(state[key], expected[key])) throw new Error(`SECF ${key} state does not match`);
    if (Number(state.max) !== expected.max) throw new Error("SECF max state does not match");
    for (const key of ["venues", "countries"]) {
      const observed = [...(state[key] ?? [])].map(fold).sort();
      const wanted = [...expected[key]].map(fold).sort();
      if (JSON.stringify(observed) !== JSON.stringify(wanted)) throw new Error(`SECF ${key} state does not match`);
    }
    if (state.hide_no_trade !== expected.hide_no_trade) throw new Error("SECF no-trade state does not match");
    if (state.status !== "complete") throw new Error("SECF results have not completed");
    if (!Array.isArray(state.rows) || state.rows.length > expected.max) throw new Error("SECF result bound is not proven");
    return true;
  }

  function assertHDSCompletion(before, after, action) {
    if (!after || typeof after !== "object") throw new Error("HDS authoritative state is unavailable");
    if (action.feature === "view") {
      if (!same(after.view, action.value)) throw new Error("HDS view state does not match");
      const correct = (action.value === "Table" && after.table_visible === true && after.treemap_visible === false && after.bubble_visible === false) ||
        (action.value === "Treemap" && after.table_visible === false && after.treemap_visible === true && after.bubble_visible === false) ||
        (action.value === "Bubble" && after.table_visible === false && after.treemap_visible === false && after.bubble_visible === true);
      if (!correct) throw new Error("HDS rendered view does not prove the requested mode");
    } else if (action.feature === "row") {
      const delta = action.value === "Next" ? 1 : -1;
      if (!Number.isInteger(before?.selected_index) || after.selected_index !== before.selected_index + delta) {
        throw new Error("HDS selected row did not move exactly once");
      }
      if (!clean(after.selected_row_id) || same(after.selected_row_id, before.selected_row_id)) {
        throw new Error("HDS selected holder identity did not change");
      }
    }
    return true;
  }

  function assertHDSViewLiveProof(proof) {
    if (!proof || typeof proof !== "object" || Array.isArray(proof)) {
      throw new Error("HDS view binding requires an authenticated live-proof record");
    }
    if (proof.session_authenticated !== true || !same(proof.command, "HDS") || !same(proof.action, "view.select")) {
      throw new Error("HDS view live proof does not match the authenticated HDS view action");
    }
    const controls = Array.isArray(proof.controls) ? proof.controls.map(clean) : [];
    if (controls.length !== HDS_OBSERVED_CONTROLS.length || HDS_OBSERVED_CONTROLS.some(expected => controls.filter(control => same(control, expected)).length !== 1)) {
      throw new Error("HDS view live proof must match the exact observed HDS controls");
    }
    const fields = Array.isArray(proof.state_fields) ? proof.state_fields.map(fold) : [];
    for (const field of ["view", "table_visible", "treemap_visible", "bubble_visible"]) {
      if (!fields.includes(field)) throw new Error(`HDS view live proof is missing ${field}`);
    }
    const observedAt = clean(proof.observed_at);
    if (!observedAt || !Number.isFinite(Date.parse(observedAt))) throw new Error("HDS view live proof needs an observation timestamp");
    const build = clean(proof.godel_build);
    if (!build) throw new Error("HDS view live proof needs the observed Godel build");
    return Object.freeze({
      session_authenticated: true,
      command: "HDS",
      action: "view.select",
      controls: Object.freeze([...HDS_OBSERVED_CONTROLS]),
      state_fields: Object.freeze(["view", "table_visible", "treemap_visible", "bubble_visible"]),
      observed_at: observedAt,
      godel_build: build
    });
  }

  function assertHDSViewState(state) {
    if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("HDS view state is unavailable");
    const view = exactEnum(state.view, HDS_VIEWS, "HDS live view state");
    if (typeof state.table_visible !== "boolean" || typeof state.treemap_visible !== "boolean" || typeof state.bubble_visible !== "boolean") {
      throw new Error("HDS live view state requires explicit Table, Treemap and Bubble visibility");
    }
    const validVisibility = (view === "Table" && state.table_visible === true && state.treemap_visible === false && state.bubble_visible === false) ||
      (view === "Treemap" && state.table_visible === false && state.treemap_visible === true && state.bubble_visible === false) ||
      (view === "Bubble" && state.table_visible === false && state.treemap_visible === false && state.bubble_visible === true);
    if (!validVisibility) throw new Error("HDS live view state is internally inconsistent");
    return { ...state, view, table_visible: state.table_visible, treemap_visible: state.treemap_visible, bubble_visible: state.bubble_visible };
  }

  // Integration seam for the first HDS primitive. The host must supply a Godel-owned
  // state reader and exact native control callback after an authenticated live capture.
  // This does not change CONTRACTS.HDS.enabled.
  function createHDSViewEnvironment(hooks = {}) {
    const liveProof = assertHDSViewLiveProof(hooks.liveProof);
    if (typeof hooks.selectExactView !== "function" || typeof hooks.readViewState !== "function") {
      throw new Error("HDS view binding needs selectExactView and readViewState hooks");
    }
    const environment = {
      bindingVerified: true,
      liveProof,
      readState(panel) { return assertHDSViewState(hooks.readViewState(panel)); },
      async applyAction(panel, action) {
        if (action.feature !== "view" || action.operation !== "select") {
          throw new Error("HDS view-only binding refuses non-view actions");
        }
        await hooks.selectExactView(panel, action.value);
      }
    };
    if (typeof hooks.waitForCompletion === "function") environment.waitForCompletion = hooks.waitForCompletion;
    return Object.freeze(environment);
  }

  function assertDownloadArtifact(artifact, format) {
    if (!artifact || artifact.download_event !== true) throw new Error("Verified browser download event missing");
    if (!Number.isFinite(artifact.size) || artifact.size <= 0) throw new Error("Downloaded file is empty");
    if (artifact.overwrote_existing !== false) throw new Error("Download overwrite safety is unproven");
    const filename = clean(artifact.filename).toLowerCase();
    if (!filename.endsWith(EXPORT_EXTENSIONS[format])) throw new Error(`Unexpected ${format} filename`);
    return Object.freeze({ filename: artifact.filename, size: artifact.size, format });
  }

  async function waitFor(check, timeoutMs = 2500) {
    const start = Date.now();
    do {
      try { return check(); } catch (error) {
        if (Date.now() - start >= timeoutMs) throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    } while (true);
  }

  function requireBinding(environment, command) {
    if (environment.bindingVerified !== true || typeof environment.applyAction !== "function" || typeof environment.readState !== "function") {
      throw new Error(`${command} nested binding is not live-verified`);
    }
  }

  function snapshot(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function createEQSAdapter(environment = {}) {
    return Object.freeze({
      command: "EQS", contract: CONTRACTS.EQS,
      async run(panel, rawAction) {
        const root = assertPanel(panel, "EQS", ["EQUITY SCREENER", "EQS"]);
        const action = normalizeEQSAction(rawAction);
        if (action.feature === "export") {
          if (environment.downloadBindingVerified !== true || typeof environment.beginDownload !== "function") {
            throw new Error("EQS download binding is not live-verified");
          }
          return assertDownloadArtifact(await environment.beginDownload(root, action.value), action.value);
        }
        requireBinding(environment, "EQS");
        if (action.feature === "list_filter") {
          action.value.items = assertDynamicValues(action.value.items, environment.availableValues?.(root, action.value.field), `EQS ${action.value.field}`);
        }
        if (action.feature === "currency") {
          action.value = assertDynamicValues([action.value], environment.availableCurrencies?.(root), "EQS currency")[0];
        }
        const before = snapshot(environment.readState(root));
        if (!(action.feature === "screen" && action.operation === "run")) {
          try { assertEQSCompletion(before, action); return { changed: false, action }; } catch {}
        }
        await environment.applyAction(root, action);
        await (environment.waitForCompletion ?? waitFor)(() => assertEQSCompletion(
          environment.readState(root), action, environment.requireFreshRun === true ? before : null
        ));
        return { changed: true, action };
      }
    });
  }

  function assertEQSRunClearLiveProof(proof) {
    if (!proof || typeof proof !== "object" || Array.isArray(proof)) {
      throw new Error("EQS Run/Clear binding requires an authenticated live-proof record");
    }
    if (proof.session_authenticated !== true || !same(proof.command, "EQS") || !same(proof.action, "screen.run_clear")) {
      throw new Error("EQS Run/Clear live proof does not match the authenticated action");
    }
    const controls = Array.isArray(proof.controls) ? proof.controls.map(clean) : [];
    if (controls.length !== 2 || ["Run", "Clear"].some(expected => controls.filter(value => same(value, expected)).length !== 1)) {
      throw new Error("EQS Run/Clear proof must observe exactly one Run and one Clear control");
    }
    const fields = Array.isArray(proof.state_fields) ? proof.state_fields.map(fold) : [];
    for (const field of ["filters", "status", "run_id"]) if (!fields.includes(field)) throw new Error(`EQS Run/Clear proof is missing ${field}`);
    const observedAt = clean(proof.observed_at);
    if (!observedAt || !Number.isFinite(Date.parse(observedAt))) throw new Error("EQS Run/Clear proof needs an observation timestamp");
    const build = clean(proof.godel_build);
    if (!build) throw new Error("EQS Run/Clear proof needs the observed Godel build");
    return Object.freeze({ ...proof, controls: Object.freeze(["Run", "Clear"]), state_fields: Object.freeze(["filters", "status", "run_id"]), observed_at: observedAt, godel_build: build });
  }

  // Narrow host seam for Run/Clear only. Filters stay unbound until their exact
  // editor callbacks and authoritative state shapes are captured.
  function createEQSRunClearEnvironment(hooks = {}) {
    const liveProof = assertEQSRunClearLiveProof(hooks.liveProof);
    if (typeof hooks.runScreen !== "function" || typeof hooks.clearScreen !== "function" || typeof hooks.readScreenState !== "function") {
      throw new Error("EQS Run/Clear binding needs runScreen, clearScreen and readScreenState hooks");
    }
    const readState = panel => {
      const state = hooks.readScreenState(panel);
      if (!state || typeof state !== "object" || !Array.isArray(state.filters)) throw new Error("EQS screen state requires an authoritative filters list");
      if (!clean(state.status) || !clean(state.run_id)) throw new Error("EQS screen state requires status and run_id");
      return state;
    };
    const environment = {
      bindingVerified: true,
      requireFreshRun: true,
      liveProof,
      readState,
      async applyAction(panel, action) {
        if (action.feature !== "screen") throw new Error("EQS Run/Clear binding refuses filter actions");
        if (action.operation === "run") return hooks.runScreen(panel);
        if (action.operation === "clear") return hooks.clearScreen(panel);
        throw new Error("EQS Run/Clear binding refuses unsupported screen actions");
      }
    };
    if (typeof hooks.waitForCompletion === "function") environment.waitForCompletion = hooks.waitForCompletion;
    return Object.freeze(environment);
  }

  function createSECFAdapter(environment = {}) {
    return Object.freeze({
      command: "SECF", contract: CONTRACTS.SECF,
      async run(panel, rawAction) {
        const root = assertPanel(panel, "SECF", ["SECURITIES FINDER", "SECF"]);
        const action = normalizeSECFAction(rawAction);
        requireBinding(environment, "SECF");
        action.value.venues = assertDynamicValues(action.value.venues, environment.availableVenues?.(root) ?? [], "SECF venue");
        action.value.countries = assertDynamicValues(action.value.countries, environment.availableCountries?.(root) ?? [], "SECF country");
        try { assertSECFCompletion(environment.readState(root), action); return { changed: false, action }; } catch {}
        await environment.applyAction(root, action);
        await (environment.waitForCompletion ?? waitFor)(() => assertSECFCompletion(environment.readState(root), action));
        return { changed: true, action };
      }
    });
  }

  function isVerified13F(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && /(^|\.)sec\.gov$/i.test(parsed.hostname) && /\/Archives\/edgar\/data\//i.test(parsed.pathname);
    } catch { return false; }
  }

  function createHDSAdapter(environment = {}) {
    return Object.freeze({
      command: "HDS", contract: CONTRACTS.HDS,
      async run(panel, rawAction) {
        const root = assertPanel(panel, "HDS", ["HOLDERS", "HDS"]);
        const action = normalizeHDSAction(rawAction);
        requireBinding(environment, "HDS");
        const before = snapshot(environment.readState(root));
        if (action.feature === "filing") {
          if (!clean(before?.selected_row_id)) throw new Error("HDS original 13F requires one exact selected holder");
          if (environment.externalNavigationVerified !== true || typeof environment.openFiling !== "function") {
            throw new Error("HDS 13F navigation binding is not live-verified");
          }
          const result = await environment.openFiling(root, before?.selected_row_id);
          if (!result || !same(result.holder_id, before?.selected_row_id) || !isVerified13F(result.url)) {
            throw new Error("HDS original 13F destination could not be verified");
          }
          return Object.freeze({ changed: true, holder_id: result.holder_id, url: result.url });
        }
        try { assertHDSCompletion(before, before, action); return { changed: false, action }; } catch {}
        await environment.applyAction(root, action);
        await (environment.waitForCompletion ?? waitFor)(() => assertHDSCompletion(before, environment.readState(root), action));
        return { changed: true, action };
      }
    });
  }

  function buildHoldingsWorkflow(request) {
    const security = clean(request?.security);
    if (!security) throw new Error("Holdings workflow requires a security");
    const intent = fold(request?.intent);
    if (["owners", "institutional owners", "who owns"].includes(intent)) {
      const actions = [];
      if (request.view != null) actions.push(normalizeHDSAction({ feature: "view", operation: "select", value: request.view }));
      if (request.open_filing === true) actions.push(normalizeHDSAction({ feature: "filing", operation: "open", value: { explicit: true } }));
      return Object.freeze({ command: "HDS", security, actions: Object.freeze(actions) });
    }
    if (["latest holdings", "what it owns"].includes(intent)) {
      if (request.view != null || request.open_filing === true || request.export != null) {
        throw new Error("HLDR has no grounded nested controls");
      }
      return Object.freeze({ command: "HLDR", security, actions: Object.freeze([]) });
    }
    throw new Error("Holdings intent must distinguish who owns the security from what the security owns");
  }

  return Object.freeze({
    CONTRACTS, LIVE_BINDING_CANDIDATES, EQS_RANGE_FIELDS, EQS_LIST_FIELDS, EQS_BOOLEAN_FIELDS, EQS_FILTER_MENU,
    SECF_TABS, SECF_MAX, HDS_VIEWS, HDS_OBSERVED_CONTROLS, EXPORT_EXTENSIONS,
    normalizeEQSAction, normalizeSECFAction, normalizeHDSAction, assertDynamicValues,
    assertEQSCompletion, assertEQSRunClearLiveProof, assertSECFCompletion, assertHDSCompletion, assertHDSViewLiveProof, assertHDSViewState, assertDownloadArtifact,
    createEQSAdapter, createEQSRunClearEnvironment, createSECFAdapter, createHDSAdapter, createHDSViewEnvironment, buildHoldingsWorkflow, isVerified13F
  });
});
