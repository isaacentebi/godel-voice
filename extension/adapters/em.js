(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GodelVoiceEMAdapter = api;

  // Integration (intentionally dormant until live verification): load this file in the
  // main world, expose the main-world adapter registry as GodelVoiceAdapterRegistry,
  // then let this module register itself. Do not add EM to AUTOMATED/FEATURES before
  // the live panel contract has been verified.
  const registry = root.GodelVoiceAdapterRegistry;
  if (registry && typeof registry.registerAdapter === "function") {
    registry.registerAdapter("EM", api.createAdapter());
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const METRICS = Object.freeze([
    "Sales",
    "Gross Revenue",
    "Net Revenue",
    "EBITDA",
    "Net Income",
    "EPS (GAAP)",
    "Total Assets",
    "Current Assets",
    "Current Liabilities",
    "Shareholder Equity",
    "Cash Flow From Operations",
    "Cash Flow From Investing",
    "Cash Flow From Financing"
  ]);

  // Spoken/documentation shorthands resolve to the exact native labels. The two
  // revenue variants were observed in the authenticated native metric select.
  const METRIC_ALIASES = Object.freeze({
    "gross revenue": "Gross Revenue",
    "net revenue": "Net Revenue",
    "net income (bfng)": "Net Income",
    eps: "EPS (GAAP)",
    "eps gaap": "EPS (GAAP)",
    cfo: "Cash Flow From Operations",
    cfi: "Cash Flow From Investing",
    cff: "Cash Flow From Financing"
  });

  const VALUATION_ROWS = Object.freeze([
    "P/E", "P/B", "P/S", "P/CF", "EV/EBITDA", "EV/Sales", "EV/CF", "EV/FCF", "Dividend Yield"
  ]);

  const CHART_MODES = Object.freeze({ values: "Values Chart", growth: "Growth Chart" });
  const GROWTH_MODES = Object.freeze({
    yoy: "YoY % Growth",
    "year-over-year": "YoY % Growth",
    "year over year": "YoY % Growth",
    pop: "PoP % Growth",
    "period-over-period": "PoP % Growth",
    "period over period": "PoP % Growth"
  });
  const SERIES = Object.freeze({ historical: "Historical", estimates: "Estimates" });
  const CONTRACT = Object.freeze({
    command: "EM",
    status: "pending-live-verification",
    enabled: false,
    features: Object.freeze({
      metric: Object.freeze([...METRICS]),
      chart: Object.freeze([...new Set(Object.values(CHART_MODES))]),
      growth: Object.freeze([...new Set(Object.values(GROWTH_MODES))]),
      series: Object.freeze(Object.values(SERIES)),
      valuation_rows: Object.freeze([...VALUATION_ROWS])
    })
  });

  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const normalize = value => String(value ?? "").replace(/\s+/g, " ").trim();
  const fold = value => normalize(value).toLowerCase();

  function assertPanel(panel) {
    if (!panel || typeof panel.querySelectorAll !== "function") throw new Error("EM panel target missing");
    return panel;
  }

  function visible(element) {
    if (!element || element.hidden === true) return false;
    if (element.getAttribute?.("aria-hidden") === "true") return false;
    if (element.style?.display === "none" || element.style?.visibility === "hidden") return false;
    return true;
  }

  function labels(element) {
    return [
      element?.getAttribute?.("aria-label"),
      element?.getAttribute?.("data-label"),
      element?.textContent
    ].map(normalize).filter(Boolean);
  }

  function labelMatches(element, expected) {
    const target = fold(expected);
    return visible(element) && labels(element).some(label => fold(label) === target);
  }

  function exactCandidates(panel, selector, expected, excluded) {
    return [...assertPanel(panel).querySelectorAll(selector)]
      .filter(element => element !== excluded && labelMatches(element, expected));
  }

  function requireExactlyOne(panel, selector, expected, purpose, excluded) {
    const candidates = exactCandidates(panel, selector, expected, excluded);
    if (candidates.length !== 1) {
      throw new Error(`EM ${purpose} requires exactly one visible '${expected}' control; found ${candidates.length}`);
    }
    return candidates[0];
  }

  function semanticSelected(element) {
    if (typeof element?.checked === "boolean") return element.checked;
    const pressed = element?.getAttribute?.("aria-pressed");
    if (pressed === "true" || pressed === "false") return pressed === "true";
    const checked = element?.getAttribute?.("aria-checked");
    if (checked === "true" || checked === "false") return checked === "true";
    const selected = element?.getAttribute?.("aria-selected");
    if (selected === "true" || selected === "false") return selected === "true";
    return null;
  }

  function canonicalFromMap(value, map, feature) {
    const wanted = fold(value);
    const match = Object.entries(map).find(([key, label]) => fold(key) === wanted || fold(label) === wanted);
    if (!match) throw new Error(`Unsupported EM ${feature}: ${normalize(value)}`);
    return match[1];
  }

  function canonicalMetric(value) {
    const wanted = fold(value);
    const valuation = VALUATION_ROWS.find(label => fold(label) === wanted);
    if (valuation) {
      throw new Error(`EM ${valuation} is a read-only valuation-table row, not a selectable matrix metric`);
    }
    const metric = METRICS.find(label => fold(label) === wanted) ?? METRIC_ALIASES[wanted];
    if (!metric) throw new Error(`Unsupported EM metric: ${normalize(value)}`);
    return metric;
  }

  function normalizeAction(action, payload) {
    if (action && typeof action === "object") return action;
    if (action === "configure") return payload;
    if (action === "selectMetric") return { feature: "metric", operation: "select", value: payload?.value };
    if (action === "selectChart") return { feature: "chart", operation: "select", value: payload?.value };
    if (action === "selectGrowth") return { feature: "growth", operation: "select", value: payload?.value };
    if (action === "setSeriesVisibility") {
      return { feature: "series", operation: payload?.visible === false ? "hide" : "show", value: payload?.value };
    }
    throw new Error(`Unsupported EM adapter action: ${normalize(action)}`);
  }

  function validateAction(action, payload) {
    const candidate = normalizeAction(action, payload);
    const feature = fold(candidate?.feature);
    const operation = fold(candidate?.operation);
    if (feature === "metric") {
      if (operation !== "select") throw new Error("EM metric only supports select");
      return Object.freeze({ feature, operation, value: canonicalMetric(candidate.value) });
    }
    if (feature === "chart") {
      if (operation !== "select") throw new Error("EM chart only supports select");
      return Object.freeze({ feature, operation, value: canonicalFromMap(candidate.value, CHART_MODES, "chart mode") });
    }
    if (feature === "growth") {
      if (operation !== "select") throw new Error("EM growth only supports select");
      return Object.freeze({ feature, operation, value: canonicalFromMap(candidate.value, GROWTH_MODES, "growth mode") });
    }
    if (feature === "series") {
      if (!new Set(["show", "hide"]).has(operation)) throw new Error("EM series only supports show or hide");
      return Object.freeze({ feature, operation, value: canonicalFromMap(candidate.value, SERIES, "series") });
    }
    throw new Error(`Unsupported EM feature: ${normalize(candidate?.feature)}`);
  }

  function hasExactVisibleLabel(panel, expected) {
    return exactCandidates(
      panel,
      "h1,h2,h3,h4,h5,h6,th,[role='heading'],[role='columnheader'],[role='rowheader'],[aria-label],button",
      expected
    ).length > 0;
  }

  function metricTrigger(panel) {
    const controls = [...assertPanel(panel).querySelectorAll("button,[role='combobox']")].filter(visible);
    const exactMetricControls = controls.filter(element => METRICS.some(metric => labelMatches(element, metric)));
    const namedMetricControls = controls.filter(element =>
      ["Metric", "Fundamental Metric"].some(name => normalize(element.getAttribute?.("aria-label")) === name));
    const candidates = [...new Set([...exactMetricControls, ...namedMetricControls])];
    if (candidates.length !== 1) throw new Error(`EM metric dropdown requires one exact panel-scoped control; found ${candidates.length}`);
    return candidates[0];
  }

  async function waitUntil(predicate, description, timeoutMs, intervalMs) {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() <= deadline) {
      try {
        if (predicate()) return;
      } catch (error) {
        lastError = error;
      }
      await sleep(intervalMs);
    }
    if (lastError) throw lastError;
    throw new Error(`Timed out verifying ${description}`);
  }

  function clickExact(control, purpose) {
    if (control.disabled === true || control.getAttribute?.("aria-disabled") === "true") {
      throw new Error(`EM ${purpose} control is disabled`);
    }
    if (typeof control.click !== "function") throw new Error(`EM ${purpose} control is not clickable`);
    control.click();
  }

  async function selectMetric(panel, metric, options) {
    let trigger = metricTrigger(panel);
    if (labelMatches(trigger, metric) && hasExactVisibleLabel(panel, "Values") && hasExactVisibleLabel(panel, "Growth")) return;
    clickExact(trigger, "metric dropdown");
    const option = requireExactlyOne(
      panel,
      "[role='option'],[role='menuitem'],button",
      metric,
      "metric selection",
      trigger
    );
    clickExact(option, `${metric} metric`);
    await waitUntil(() => {
      trigger = metricTrigger(panel);
      return labelMatches(trigger, metric)
        && hasExactVisibleLabel(panel, "Values")
        && hasExactVisibleLabel(panel, "Growth");
    }, `${metric} metric with Values and Growth tables`, options.timeoutMs, options.intervalMs);
  }

  async function selectSemanticToggle(panel, label, purpose, options) {
    const control = requireExactlyOne(panel, "button,[role='tab'],[role='radio']", label, purpose);
    const selected = semanticSelected(control);
    if (selected === true) return;
    if (selected === null) throw new Error(`EM ${purpose} has no verified aria-selected, aria-pressed, or aria-checked state`);
    clickExact(control, purpose);
    await waitUntil(() => {
      const next = requireExactlyOne(panel, "button,[role='tab'],[role='radio']", label, purpose);
      return semanticSelected(next) === true && hasExactVisibleLabel(panel, label);
    }, purpose, options.timeoutMs, options.intervalMs);
  }

  async function setSeriesVisibility(panel, label, show, options) {
    const control = requireExactlyOne(
      panel,
      "button,[role='checkbox'],[role='switch'],input[type='checkbox']",
      label,
      `${label} visibility`
    );
    const selected = semanticSelected(control);
    if (selected === null) throw new Error(`EM ${label} has no verified visibility state`);
    if (selected === show) return;
    clickExact(control, `${label} visibility`);
    await waitUntil(() => {
      const next = requireExactlyOne(
        panel,
        "button,[role='checkbox'],[role='switch'],input[type='checkbox']",
        label,
        `${label} visibility`
      );
      return semanticSelected(next) === show && hasExactVisibleLabel(panel, label);
    }, `${label} ${show ? "shown" : "hidden"}`, options.timeoutMs, options.intervalMs);
  }

  function readValuationTable(panel) {
    assertPanel(panel);
    if (!hasExactVisibleLabel(panel, "Multiples")) throw new Error("EM Multiples table heading is not visible");
    const headers = ["Last 4Q", "Next 4Q"]
      .filter(label => hasExactVisibleLabel(panel, label));
    const fiscalYears = [...panel.querySelectorAll("th,[role='columnheader']")]
      .filter(visible)
      .map(element => normalize(element.textContent))
      .filter(label => /^FY \d{4}$/.test(label));
    const rows = VALUATION_ROWS.filter(label => hasExactVisibleLabel(panel, label));
    if (headers.length !== 2) throw new Error("EM valuation table is missing Last 4Q or Next 4Q headings");
    if (rows.length === 0) throw new Error("EM valuation table has no recognized valuation rows");
    return Object.freeze({
      mode: "read-only",
      headers: Object.freeze([...headers, ...fiscalYears]),
      rows: Object.freeze(rows)
    });
  }

  function createAdapter(configuration) {
    const options = Object.freeze({
      timeoutMs: Number.isFinite(configuration?.timeoutMs) ? configuration.timeoutMs : 5000,
      intervalMs: Number.isFinite(configuration?.intervalMs) ? configuration.intervalMs : 50
    });
    return Object.freeze({
      command: "EM",
      contract: CONTRACT,
      async run(panel, action, payload) {
        assertPanel(panel);
        const validated = validateAction(action, payload);
        if (validated.feature === "metric") return selectMetric(panel, validated.value, options);
        if (validated.feature === "chart") return selectSemanticToggle(panel, validated.value, `${validated.value} mode`, options);
        if (validated.feature === "growth") return selectSemanticToggle(panel, validated.value, `${validated.value} mode`, options);
        if (validated.feature === "series") {
          return setSeriesVisibility(panel, validated.value, validated.operation === "show", options);
        }
        throw new Error("Unsupported EM action");
      },
      readValuationTable
    });
  }

  return Object.freeze({
    CONTRACT,
    METRICS,
    METRIC_ALIASES,
    VALUATION_ROWS,
    CHART_MODES,
    GROWTH_MODES,
    SERIES,
    validateAction,
    readValuationTable,
    createAdapter
  });
});
