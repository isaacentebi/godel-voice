(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GodelVoiceMOSTAdapter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const RANKINGS = Object.freeze(["Active", "Gainers", "Losers", "Value"]);
  const RESULT_COUNTS = Object.freeze([10, 25, 50, 100]);
  const UNITS = Object.freeze(["raw", "K", "M", "B", "T"]);
  const SECTORS = Object.freeze([
    "All", "Financial Services", "Healthcare", "Technology", "Industrials",
    "Consumer Cyclical", "Basic Materials", "Energy", "Real Estate",
    "Communication Services", "Consumer Defensive", "Utilities"
  ]);

  const CONTROL_LABELS = Object.freeze({
    ranking: ["Ranking", "Rank By", "Sort By"],
    results: ["Results", "Result Count", "Show"],
    minimum: ["Minimum Market Cap", "Min Market Cap"],
    maximum: ["Maximum Market Cap", "Max Market Cap"],
    sector: ["Sector"]
  });

  function clean(value) {
    return String(value == null ? "" : value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function same(a, b) {
    return clean(a).toLowerCase() === clean(b).toLowerCase();
  }

  function exactEnum(value, allowed, field) {
    const match = allowed.find(item => same(item, value));
    if (match == null) throw new Error(`Unsupported MOST ${field}: ${clean(value) || "empty"}`);
    return match;
  }

  function finiteNonNegative(value, field) {
    const number = typeof value === "number" ? value : Number(clean(value).replace(/,/g, ""));
    if (!Number.isFinite(number) || number < 0) throw new Error(`MOST ${field} must be a non-negative number`);
    return number;
  }

  function normalizeBound(value, fallbackUnit) {
    if (value == null || value === "") return null;
    if (typeof value === "object") {
      return {
        value: finiteNonNegative(value.value, "market-cap bound"),
        unit: exactEnum(value.unit ?? fallbackUnit ?? "raw", UNITS, "market-cap unit")
      };
    }
    const match = clean(value).match(/^\$?\s*([0-9]+(?:\.[0-9]+)?)\s*(K|M|B|T)?$/i);
    if (!match) throw new Error(`Invalid MOST market-cap bound: ${clean(value)}`);
    return {
      value: finiteNonNegative(match[1], "market-cap bound"),
      unit: exactEnum(match[2] ?? fallbackUnit ?? "raw", UNITS, "market-cap unit")
    };
  }

  function rawValue(bound) {
    if (!bound) return null;
    const factor = { raw: 1, K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[bound.unit];
    return bound.value * factor;
  }

  function canonicalBound(bound) {
    if (!bound) return "";
    return `${bound.value}${bound.unit === "raw" ? "" : bound.unit}`;
  }

  function normalizeRange(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("MOST market-cap value must be an object");
    }
    const unit = value.unit == null ? null : exactEnum(value.unit, UNITS, "market-cap unit");
    const minimum = normalizeBound(value.minimum ?? value.min, unit);
    const maximum = normalizeBound(value.maximum ?? value.max, unit);
    if (!minimum && !maximum) throw new Error("MOST market-cap range needs a minimum or maximum");
    if (minimum && maximum && rawValue(minimum) > rawValue(maximum)) {
      throw new Error("MOST minimum market cap cannot exceed maximum market cap");
    }
    return { minimum, maximum };
  }

  function normalizeAction(action, payload) {
    const source = typeof action === "object" && action ? action : { feature: action, value: payload };
    const feature = clean(source.feature ?? source.id).toLowerCase().replace(/[._-]+/g, "_");
    const operation = clean(source.operation || (feature === "market_cap" ? "set" : "select")).toLowerCase();
    const value = source.value !== undefined ? source.value : payload;
    if (feature === "ranking" && operation === "select") {
      return { feature: "ranking", operation, value: exactEnum(value, RANKINGS, "ranking") };
    }
    if ((feature === "results" || feature === "result_count") && operation === "select") {
      const count = finiteNonNegative(value, "result count");
      if (!RESULT_COUNTS.includes(count)) throw new Error(`Unsupported MOST result count: ${count}`);
      return { feature: "results", operation, value: count };
    }
    if ((feature === "market_cap" || feature === "market_cap_range") && operation === "set") {
      return { feature: "market_cap", operation, value: normalizeRange(value) };
    }
    if (feature === "sector" && operation === "select") {
      return { feature: "sector", operation, value: exactEnum(value, SECTORS, "sector") };
    }
    throw new Error(`Unsupported MOST action: ${feature || "empty"}.${operation || "empty"}`);
  }

  function assertPanel(root) {
    if (!root || typeof root.querySelectorAll !== "function") throw new Error("MOST requires an exact panel root");
    const command = clean(root.getAttribute?.("data-cy-command-type") ?? root.getAttribute?.("data-command"));
    const title = clean(root.getAttribute?.("aria-label") ?? root.getAttribute?.("data-panel-title") ?? root.textContent);
    if (same(command, "MOST") || /\bMOST ACTIVE\b/i.test(title) || /^MOST$/i.test(title)) return root;
    throw new Error("Addressed panel is not MOST");
  }

  function explicitSelected(element) {
    if (!element) return false;
    if (element.checked === true || element.selected === true) return true;
    return ["aria-checked", "aria-pressed", "aria-selected", "data-selected"]
      .some(name => same(element.getAttribute?.(name), "true")) ||
      ["checked", "on", "selected"]
        .some(value => same(element.getAttribute?.("data-state"), value));
  }

  function elementValue(element) {
    if (!element) return "";
    if (element.tagName === "SELECT") {
      const option = element.options?.[element.selectedIndex];
      return clean(option?.textContent ?? element.value);
    }
    return clean(element.value ?? element.getAttribute?.("data-value") ?? element.textContent);
  }

  function candidateLabel(element) {
    return clean(element.getAttribute?.("aria-label") ?? element.getAttribute?.("title") ??
      element.getAttribute?.("data-label") ?? element.textContent);
  }

  function unique(items, description) {
    const matches = [...new Set(items.filter(Boolean))];
    if (matches.length !== 1) throw new Error(`MOST ${description} is ${matches.length ? "ambiguous" : "unavailable"}`);
    return matches[0];
  }

  function controls(root) {
    return [...root.querySelectorAll("select,input,button,[role='button'],[role='radio'],[role='option']")];
  }

  function findNamedControl(root, key) {
    const explicit = controls(root).filter(element => same(element.getAttribute?.("data-most-control"), key));
    if (explicit.length) return unique(explicit, `${key} control`);
    const labels = CONTROL_LABELS[key] ?? [];
    const matches = controls(root).filter(element => labels.some(label => same(candidateLabel(element), label)));
    return unique(matches, `${key} control`);
  }

  function findExactChoice(root, key, value) {
    const group = findNamedControl(root, key);
    if (group.tagName === "SELECT") return group;
    const scope = group.getAttribute?.("role") === "radiogroup" ? group : (group.parentElement ?? root);
    const options = [...scope.querySelectorAll("button,input,[role='radio'],[role='option']")]
      .filter(element => same(elementValue(element), value) || same(candidateLabel(element), value));
    return unique(options, `${key} choice ${value}`);
  }

  function dispatchValue(element, value) {
    if (element.tagName === "SELECT") {
      const options = [...element.options].filter(option => same(option.textContent, value) || same(option.value, value));
      const option = unique(options, `choice ${value}`);
      element.value = option.value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    if (element.tagName === "INPUT" && !["radio", "checkbox"].includes(clean(element.type).toLowerCase())) {
      element.value = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    element.click();
  }

  function defaultSetControl(root, key, value) {
    if (key === "minimum" || key === "maximum") {
      return dispatchValue(findNamedControl(root, key), value);
    }
    const control = findExactChoice(root, key, value);
    if (control.tagName === "SELECT" || !explicitSelected(control)) dispatchValue(control, value);
  }

  function defaultReadControl(root, key) {
    const control = findNamedControl(root, key);
    if (control.tagName === "SELECT" || control.tagName === "INPUT") return elementValue(control);
    const scope = control.getAttribute?.("role") === "radiogroup" ? control : (control.parentElement ?? root);
    const selected = [...scope.querySelectorAll("button,input,[role='radio'],[role='option']")].filter(explicitSelected);
    return elementValue(unique(selected, `${key} selected choice`));
  }

  function defaultReadResultMetadata(root) {
    const rows = [...root.querySelectorAll("tbody tr,[role='row'][data-result-row],tr[data-result-row]")];
    return {
      ranking: clean(root.getAttribute?.("data-most-ranking")) || null,
      limit: Number(root.getAttribute?.("data-most-results-count")) || null,
      sector: clean(root.getAttribute?.("data-most-sector")) || null,
      minimum_market_cap: root.getAttribute?.("data-most-min-market-cap") ?? null,
      maximum_market_cap: root.getAttribute?.("data-most-max-market-cap") ?? null,
      rows: rows.map(row => ({
        sector: clean(row.getAttribute?.("data-sector")) || null,
        market_cap: row.getAttribute?.("data-market-cap") == null ? null : Number(row.getAttribute("data-market-cap"))
      }))
    };
  }

  function parseMetadataBound(value) {
    if (value == null || value === "") return null;
    return rawValue(normalizeBound(value));
  }

  function assertControl(readControl, root, key, wanted) {
    const observed = readControl(root, key);
    if (!same(observed, wanted)) throw new Error(`MOST ${key} control did not select ${wanted}`);
  }

  function assertCompletion(root, action, environment) {
    const readControl = environment.readControl ?? defaultReadControl;
    const metadata = (environment.readResultMetadata ?? defaultReadResultMetadata)(root);
    if (!metadata || typeof metadata !== "object") throw new Error("MOST result metadata is unavailable");

    if (action.feature === "ranking") {
      assertControl(readControl, root, "ranking", action.value);
      if (!same(metadata.ranking, action.value)) throw new Error("MOST result ranking metadata did not update");
    } else if (action.feature === "results") {
      assertControl(readControl, root, "results", String(action.value));
      if (Number(metadata.limit) !== action.value) throw new Error("MOST result-count metadata did not update");
      if (!Array.isArray(metadata.rows)) throw new Error("MOST result rows are unavailable");
      if (metadata.rows.length > action.value) throw new Error("MOST rendered more rows than requested");
    } else if (action.feature === "sector") {
      assertControl(readControl, root, "sector", action.value);
      if (!same(metadata.sector, action.value)) throw new Error("MOST sector metadata did not update");
      if (action.value !== "All") {
        if (!Array.isArray(metadata.rows) || metadata.rows.length === 0 ||
          metadata.rows.some(row => !same(row?.sector, action.value))) {
          throw new Error("MOST returned rows do not prove the requested sector");
        }
      }
    } else if (action.feature === "market_cap") {
      const { minimum, maximum } = action.value;
      if (minimum) assertControl(readControl, root, "minimum", canonicalBound(minimum));
      if (maximum) assertControl(readControl, root, "maximum", canonicalBound(maximum));
      const observedMin = parseMetadataBound(metadata.minimum_market_cap);
      const observedMax = parseMetadataBound(metadata.maximum_market_cap);
      if (minimum && observedMin !== rawValue(minimum)) throw new Error("MOST minimum market-cap metadata did not update");
      if (maximum && observedMax !== rawValue(maximum)) throw new Error("MOST maximum market-cap metadata did not update");
      if (!Array.isArray(metadata.rows)) throw new Error("MOST result rows are unavailable");
      for (const row of metadata.rows) {
        if (!Number.isFinite(row?.market_cap)) throw new Error("MOST row market-cap metadata is unavailable");
        if (minimum && row.market_cap < rawValue(minimum)) throw new Error("MOST returned a row below the minimum market cap");
        if (maximum && row.market_cap > rawValue(maximum)) throw new Error("MOST returned a row above the maximum market cap");
      }
    }
    return true;
  }

  function currentMatches(root, action, environment) {
    try {
      return assertCompletion(root, action, environment);
    } catch {
      return false;
    }
  }

  function createMOSTAdapter(environment = {}) {
    const setControl = environment.setControl ?? defaultSetControl;
    const waitForCompletion = environment.waitForCompletion ?? (async check => {
      const started = Date.now();
      do {
        try { return check(); } catch (error) {
          if (Date.now() - started >= 2500) throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      } while (true);
    });

    return Object.freeze({
      command: "MOST",
      async run(panel, action, payload) {
        const root = assertPanel(panel);
        const normalized = normalizeAction(action, payload);
        if (currentMatches(root, normalized, environment)) {
          return { changed: false, action: normalized };
        }
        if (normalized.feature === "market_cap") {
          if (normalized.value.minimum) setControl(root, "minimum", canonicalBound(normalized.value.minimum));
          if (normalized.value.maximum) setControl(root, "maximum", canonicalBound(normalized.value.maximum));
        } else {
          setControl(root, normalized.feature, String(normalized.value));
        }
        await waitForCompletion(() => assertCompletion(root, normalized, environment));
        return { changed: true, action: normalized };
      }
    });
  }

  return Object.freeze({
    RANKINGS, RESULT_COUNTS, UNITS, SECTORS,
    clean, normalizeBound, normalizeRange, normalizeAction, rawValue, canonicalBound,
    assertPanel, explicitSelected, assertCompletion, createMOSTAdapter
  });
});
