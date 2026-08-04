(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GodelVoiceIMAPAdapter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // This exact-command adapter is registered by main-world.js. Only index and
  // Map/Table are exposed by the workflow validator today. Candidate actions
  // below remain unreachable from voice until separately verified and
  // allowlisted.

  const CONTRACT = Object.freeze({
    command: "IMAP",
    enabled: true,
    indexes: Object.freeze(["S&P 500", "DJIA"]),
    views: Object.freeze(["Map", "Table"]),
    sortColumns: Object.freeze(["Ticker", "Name", "Last", "Change", "Chg %", "Volume"]),
    sortDirections: Object.freeze(["Ascending", "Descending"]),
    // The official documentation describes simultaneous Top Gainers and Top
    // Losers result panels, not a selectable movers mode.
    blocked: Object.freeze(["movers", "subindustry", "export", "member open"]),
    sectorRequiresExactLiveText: true
  });

  const CONTROL_SELECTOR = [
    "button",
    "[role='button']",
    "[role='tab']",
    "[role='option']",
    "[role='menuitem']",
    "[data-index]",
    "[data-sector]",
    "[data-view]"
  ].join(",");

  function clean(value) {
    return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function canonical(value, allowed, label) {
    const wanted = clean(value).toLowerCase();
    const match = allowed.find(item => item.toLowerCase() === wanted);
    if (!match) throw new Error(`Unsupported IMAP ${label}: ${clean(value) || "empty"}`);
    return match;
  }

  function elements(panel, selector) {
    if (!panel || typeof panel.querySelectorAll !== "function") {
      throw new Error("IMAP panel root missing");
    }
    return [...panel.querySelectorAll(selector)];
  }

  function defaultVisible(element) {
    if (!element || element.hidden || element.getAttribute?.("aria-hidden") === "true") return false;
    const style = element.ownerDocument?.defaultView?.getComputedStyle?.(element);
    if (style && (style.display === "none" || style.visibility === "hidden")) return false;
    const rect = element.getBoundingClientRect?.();
    return !rect || rect.width > 0 || rect.height > 0;
  }

  function semanticSelected(element) {
    if (!element) return false;
    if (element.getAttribute?.("aria-selected") === "true") return true;
    if (element.getAttribute?.("aria-pressed") === "true") return true;
    if (element.getAttribute?.("data-selected") === "true") return true;
    if (element.getAttribute?.("data-active") === "true") return true;
    return ["selected", "checked", "on"].includes(clean(element.getAttribute?.("data-state")).toLowerCase());
  }

  function exactControls(panel, text, visible) {
    const wanted = clean(text);
    return elements(panel, CONTROL_SELECTOR).filter(element =>
      visible(element) && clean(element.textContent) === wanted);
  }

  function oneExactControl(panel, text, visible, kind) {
    const matches = exactControls(panel, text, visible);
    if (matches.length !== 1) {
      throw new Error(`IMAP ${kind} control must be one exact visible match; found ${matches.length} for ${text}`);
    }
    return matches[0];
  }

  function tableRendered(panel, visible) {
    return elements(panel, "table,[role='table'],[role='grid']").filter(visible).some(table => {
      const headers = clean(elements(table, "th,[role='columnheader']")
        .map(element => element.textContent).join(" ")).toLowerCase();
      return (headers.includes("ticker") || headers.includes("member") || headers.includes("company"))
        && (headers.includes("change") || headers.includes("chg"));
    });
  }

  function mapRendered(panel, visible) {
    if (tableRendered(panel, visible)) return false;
    return elements(panel, "canvas,svg,[data-map],[data-visualization='map'],[class*='treemap' i],[class*='sector-map' i]")
      .filter(visible)
      .some(element => {
        const rect = element.getBoundingClientRect?.();
        return !rect || (rect.width >= 200 && rect.height >= 120);
      });
  }

  function membersRendered(panel, visible) {
    if (tableRendered(panel, visible) || mapRendered(panel, visible)) return true;
    const rows = elements(panel, "[role='row'],[data-member],[data-ticker]").filter(visible);
    return rows.length > 0;
  }

  function renderedSignature(panel, visible) {
    const rows = elements(panel, "tbody tr,[role='row'],[data-member],[data-ticker]").filter(visible);
    const visuals = elements(panel, "canvas,svg,[data-map],[data-visualization='map'],[class*='treemap' i]").filter(visible);
    const rowText = rows.slice(0, 40).map(element => clean(element.textContent)).join("|");
    const markers = visuals.map(element => [
      clean(element.getAttribute?.("data-index")),
      clean(element.getAttribute?.("data-sector")),
      clean(element.getAttribute?.("data-view")),
      clean(element.getAttribute?.("aria-label")),
      clean(element.textContent)
    ].join(":")) .join("|");
    return `${rows.length}#${rowText}#${visuals.length}#${markers}`;
  }

  function exactRenderedLabel(panel, text, visible) {
    const wanted = clean(text);
    const selector = "h1,h2,h3,h4,[role='heading'],[aria-current='page'],[data-breadcrumb],[data-current-sector],[data-current-index],[data-current-view]";
    return elements(panel, selector).some(element => visible(element) && clean(element.textContent) === wanted);
  }

  function currentIndexEvidence(panel, value, visible) {
    const attributed = elements(panel, "[data-current-index],[data-index][aria-current='true']").some(element =>
      visible(element) && [element.getAttribute?.("data-current-index"), element.getAttribute?.("data-index"), element.textContent]
        .some(candidate => clean(candidate) === value));
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const summary = new RegExp(`(?:^|\\s)${escaped}\\s+[+-]?[0-9]+(?:\\.[0-9]+)?%$`);
    const renderedSummary = elements(panel, "div,span,p").some(element =>
      visible(element) && summary.test(clean(element.textContent))
      && ![...element.children].some(child => summary.test(clean(child.textContent))));
    const expectedMembers = value === "DJIA" ? "30 members" : value === "S&P 500" ? "503 members" : null;
    const memberCount = expectedMembers && elements(panel, "div,span,p").some(element =>
      visible(element) && clean(element.textContent) === expectedMembers);
    return attributed || renderedSummary || memberCount || exactRenderedLabel(panel, value, visible);
  }

  function currentSectorEvidence(panel, value, visible) {
    const attributed = elements(panel, "[data-current-sector],[data-sector][aria-current='true']").some(element =>
      visible(element) && [element.getAttribute?.("data-current-sector"), element.getAttribute?.("data-sector"), element.textContent]
        .some(candidate => clean(candidate) === value));
    return attributed || exactRenderedLabel(panel, value, visible);
  }

  function headerLabel(header) {
    return clean(header?.textContent).replace(/\s*[▲▼]\s*$/, "");
  }

  function sortDirection(header) {
    const semantic = clean(header?.getAttribute?.("aria-sort")).toLowerCase();
    if (semantic === "ascending") return "Ascending";
    if (semantic === "descending") return "Descending";
    const text = clean(header?.textContent);
    if (/▲\s*$/.test(text)) return "Ascending";
    if (/▼\s*$/.test(text)) return "Descending";
    return null;
  }

  function exactSortTable(panel, column, visible) {
    const matches = elements(panel, "table,[role='table'],[role='grid']").filter(visible).filter(table =>
      elements(table, "th,[role='columnheader']").filter(visible)
        .filter(header => headerLabel(header) === column).length === 1);
    if (matches.length !== 1) throw new Error(`IMAP sort table must be one exact visible match; found ${matches.length}`);
    return matches[0];
  }

  function exactSortHeader(table, column, visible) {
    const matches = elements(table, "th,[role='columnheader']").filter(visible)
      .filter(header => headerLabel(header) === column);
    if (matches.length !== 1) throw new Error(`IMAP sort header must be one exact visible match; found ${matches.length} for ${column}`);
    return matches[0];
  }

  function numericCell(value) {
    const text = clean(value).replace(/[$,%]/g, "").replace(/,/g, "");
    const match = text.match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*([KMBT])?$/i);
    if (!match) return null;
    const scale = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[(match[2] ?? "").toUpperCase()] ?? 1;
    return Number(match[1]) * scale;
  }

  function sortedColumnValues(table, column, visible) {
    const headers = elements(table, "th,[role='columnheader']").filter(visible);
    const index = headers.findIndex(header => headerLabel(header) === column);
    if (index < 0) throw new Error(`IMAP sort column is unavailable: ${column}`);
    const rows = elements(table, "tbody tr,[role='row']").filter(visible);
    const values = rows.map(row => elements(row, "td,[role='cell']").filter(visible)[index])
      .filter(Boolean).map(cell => clean(cell.textContent));
    if (values.length < 2) throw new Error("IMAP sorted rows are unavailable");
    if (["Last", "Change", "Chg %", "Volume"].includes(column)) {
      const numeric = values.map(numericCell);
      if (numeric.some(value => value == null || !Number.isFinite(value))) throw new Error(`IMAP ${column} rows are not numeric`);
      return numeric;
    }
    if (values.some(value => !value)) throw new Error(`IMAP ${column} rows are empty`);
    return values.map(value => value.toLocaleLowerCase());
  }

  function monotonic(values, direction) {
    return values.every((value, index) => index === 0 || (direction === "Ascending"
      ? values[index - 1] <= value : values[index - 1] >= value));
  }

  async function defaultClick(element) {
    element.click();
  }

  function createAdapter(options = {}) {
    const visible = options.visible ?? defaultVisible;
    const click = options.click ?? defaultClick;
    const pause = options.pause ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
    const timeoutMs = options.timeoutMs ?? 5000;
    const pollMs = options.pollMs ?? 50;

    async function waitFor(predicate, description) {
      const deadline = Date.now() + timeoutMs;
      let lastError = null;
      do {
        try {
          if (predicate()) return;
        } catch (error) {
          lastError = error;
        }
        await pause(pollMs);
      } while (Date.now() <= deadline);
      const suffix = lastError ? `: ${lastError.message}` : "";
      throw new Error(`Timed out waiting for IMAP ${description}${suffix}`);
    }

    async function selectIndex(panel, rawValue) {
      const value = canonical(rawValue, CONTRACT.indexes, "index");
      const control = oneExactControl(panel, value, visible, "index");
      const current = () => semanticSelected(control) || currentIndexEvidence(panel, value, visible);
      if (membersRendered(panel, visible) && current()) return;
      const before = renderedSignature(panel, visible);
      await click(control);
      await waitFor(() => membersRendered(panel, visible)
        && current()
        && renderedSignature(panel, visible) !== before, `${value} index render`);
    }

    async function selectView(panel, rawValue) {
      const value = canonical(rawValue, CONTRACT.views, "view");
      const control = oneExactControl(panel, value, visible, "view");
      const rendered = () => value === "Table" ? tableRendered(panel, visible) : mapRendered(panel, visible);
      if (rendered()) return;
      await click(control);
      await waitFor(rendered, `${value} view render`);
    }

    async function drillSector(panel, rawValue, exactLiveText) {
      const value = clean(rawValue);
      if (!value || clean(exactLiveText) !== value) {
        throw new Error("IMAP sector drilldown requires the exact live sector text");
      }
      const control = oneExactControl(panel, value, visible, "sector");
      if (currentSectorEvidence(panel, value, visible) && membersRendered(panel, visible)) return;
      const before = renderedSignature(panel, visible);
      await click(control);
      await waitFor(() => currentSectorEvidence(panel, value, visible)
        && membersRendered(panel, visible)
        && renderedSignature(panel, visible) !== before, `${value} sector drilldown render`);
    }

    async function selectSort(panel, rawValue) {
      if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
        throw new Error("IMAP sort requires column and direction");
      }
      const column = canonical(rawValue.column, CONTRACT.sortColumns, "sort column");
      const direction = canonical(rawValue.direction, CONTRACT.sortDirections, "sort direction");
      if (!tableRendered(panel, visible)) throw new Error("IMAP sort requires Table view");
      const table = exactSortTable(panel, column, visible);
      const header = exactSortHeader(table, column, visible);
      const complete = () => sortDirection(header) === direction
        && monotonic(sortedColumnValues(table, column, visible), direction);
      if (complete()) return;
      const before = sortDirection(header);
      await click(header);
      await waitFor(() => {
        const current = sortDirection(header);
        return current && current !== before
          && monotonic(sortedColumnValues(table, column, visible), current);
      }, `${column} sort state change`);
      if (complete()) return;
      await click(header);
      await waitFor(complete, `${column} ${direction.toLowerCase()} order`);
    }

    async function configure(panel, value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("IMAP configure value must be an object");
      }
      const allowed = new Set(["index", "view", "sector", "sector_exact_live_text", "sort"]);
      const unknown = Object.keys(value).filter(key => !allowed.has(key));
      if (unknown.length) throw new Error(`Unsupported IMAP configure keys: ${unknown.join(", ")}`);
      if (value.index != null) await selectIndex(panel, value.index);
      if (value.view != null) await selectView(panel, value.view);
      if (value.sort != null) await selectSort(panel, value.sort);
      if (value.sector != null) await drillSector(panel, value.sector, value.sector_exact_live_text);
    }

    async function run(panel, action, payload = {}) {
      const feature = clean(action?.feature).toLowerCase();
      const operation = clean(action?.operation).toLowerCase();
      if (feature === "map" && operation === "configure") return configure(panel, action.value);
      if (operation !== "select") throw new Error("Unsupported IMAP operation");
      if (feature === "index") return selectIndex(panel, action.value);
      if (feature === "view") return selectView(panel, action.value);
      if (feature === "sort") return selectSort(panel, action.value);
      if (CONTRACT.blocked.includes(feature)) throw new Error(`IMAP ${feature} is intentionally blocked`);
      if (feature === "sector") {
        return drillSector(panel, action.value, action.exact_live_text ?? payload.exact_live_text);
      }
      throw new Error(`Unsupported IMAP action feature: ${feature || "empty"}`);
    }

    return Object.freeze({ run });
  }

  const adapter = createAdapter();
  function install(registerAdapter) {
    if (typeof registerAdapter !== "function") {
      throw new Error("IMAP install requires the verified adapter registry function");
    }
    registerAdapter("IMAP", adapter);
    return adapter;
  }

  return Object.freeze({
    CONTRACT,
    adapter,
    install,
    createAdapter,
    clean,
    semanticSelected,
    tableRendered,
    mapRendered,
    membersRendered,
    renderedSignature,
    headerLabel,
    sortDirection,
    sortedColumnValues,
    monotonic
  });
});
