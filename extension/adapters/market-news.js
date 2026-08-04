(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GodelVoiceMarketNewsAdapters = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const COMMANDS = Object.freeze(["IMAP", "HMAP", "N", "HALT", "CF"]);
  const TABLE_SORTS = Object.freeze(["Ticker", "Name", "Last", "Change", "Chg %"]);
  const NEWS_SORTS = Object.freeze(["Headline", "Date", "Time", "Ticker", "Source"]);
  const DIRECTIONS = Object.freeze(["Ascending", "Descending"]);

  const SPECS = Object.freeze({
    IMAP: Object.freeze({
      index: { operation: "select", values: ["S&P 500", "DJIA"] },
      view: { operation: "select", values: ["Map", "Table"] },
      sector: { operation: "drill", dynamic: "sectors" },
      back: { operation: "select", values: ["Back"] },
      sort: { operation: "select", sortColumns: TABLE_SORTS }
    }),
    HMAP: Object.freeze({
      universe: { operation: "select", dynamic: "universes" },
      watchlist: { operation: "select", dynamic: "watchlists" },
      "size by": { operation: "select", dynamic: "size_metrics" },
      label: { operation: "select", dynamic: "label_metrics" },
      sectors: { operation: "select", values: ["Show", "Hide"] },
      animate: { operation: "select", values: ["On", "Off"] },
      "update interval": { operation: "set", positiveInteger: true },
      color: { operation: "select", values: ["Auto", "Manual"] },
      movers: { operation: "select", values: ["Open", "Closed"] },
      view: { operation: "select", values: ["Map", "Table"] },
      sort: { operation: "select", sortColumns: TABLE_SORTS }
    }),
    N: Object.freeze({
      query: { operation: "set", nonEmptyString: true },
      watchlist: { operation: "select", dynamic: "watchlists" },
      "date range": { operation: "select", values: ["All", "Before"] },
      "before date": { operation: "set", isoDate: true },
      pause: { operation: "select", values: ["Paused", "Live"] },
      clear: { operation: "select", values: ["Clear"] },
      sort: { operation: "select", sortColumns: NEWS_SORTS },
      "article pdf": { operation: "download", values: ["PDF"] }
    }),
    HALT: Object.freeze({
      tab: { operation: "select", values: ["All", "Active", "Resumed"] },
      refresh: { operation: "refresh", values: [null] }
    }),
    CF: Object.freeze({
      watchlist: { operation: "select", dynamic: "watchlists" },
      "filing types": { operation: "select", dynamicMany: "filing_types" },
      apply: { operation: "select", values: ["Apply"] },
      "select all filing types": { operation: "select", values: ["Select All"] }
    })
  });

  const BLOCKED = Object.freeze({
    IMAP: Object.freeze(["export", "movers", "subindustry", "member open", "hover"]),
    HMAP: Object.freeze(["export", "manual color parameters", "tile quick action", "hover"]),
    N: Object.freeze([
      "advanced filters", "sources", "categories", "languages", "include text", "exclude text",
      "class action", "tts", "info panel", "inline context", "article open", "reader back",
      "set to recommended", "clear global filters", "save global filters", "breaking alert", "feed export"
    ]),
    HALT: Object.freeze(["export", "row open", "reason tooltip"]),
    CF: Object.freeze([
      "render filings in Godel", "download", "export", "filter search", "filing open",
      "edgar navigation", "company scope", "global scope"
    ])
  });

  function clean(value) {
    return String(value == null ? "" : value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function same(a, b) { return clean(a).toLowerCase() === clean(b).toLowerCase(); }

  function exact(value, allowed, description) {
    const matches = allowed.filter(item => same(item, value));
    if (matches.length !== 1) throw new Error(`Unsupported ${description}: ${clean(value) || "empty"}`);
    return matches[0];
  }

  function normalizeSort(value, columns) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Sort requires column and direction");
    return {
      column: exact(value.column, columns, "sort column"),
      direction: exact(value.direction, DIRECTIONS, "sort direction")
    };
  }

  function isoDate(value) {
    const text = clean(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
      throw new Error("Date must be YYYY-MM-DD");
    }
    return text;
  }

  function assertPanel(panel, command) {
    if (!panel || typeof panel.getAttribute !== "function") throw new Error(`${command} requires an exact panel root`);
    const type = clean(panel.getAttribute("data-cy-command-type") ?? panel.getAttribute("data-command"));
    if (same(type, command)) return panel;
    throw new Error(`Addressed panel is not ${command}`);
  }

  function available(environment, panel, command, key) {
    const values = environment.availableOptions?.(panel, command, key);
    if (!Array.isArray(values) || values.length === 0 || values.some(value => !clean(value))) {
      throw new Error(`${command} live ${key} options are unavailable`);
    }
    return values.map(clean);
  }

  function integerWithinLiveBounds(environment, panel, command, key, value) {
    const bounds = environment.availableBounds?.(panel, command, key);
    if (!bounds || !Number.isInteger(bounds.minimum) || !Number.isInteger(bounds.maximum)
      || bounds.minimum <= 0 || bounds.minimum > bounds.maximum) {
      throw new Error(`${command} live ${key} bounds are unavailable`);
    }
    value = Number(value);
    if (!Number.isInteger(value) || value < bounds.minimum || value > bounds.maximum) {
      throw new Error(`${command} ${key} must be an integer from ${bounds.minimum} to ${bounds.maximum}`);
    }
    return value;
  }

  function normalizeAction(command, input, environment, panel) {
    command = exact(command, COMMANDS, "command");
    const action = input && typeof input === "object" ? input : {};
    const feature = clean(action.feature).toLowerCase();
    const operation = clean(action.operation).toLowerCase();
    if ((BLOCKED[command] ?? []).some(name => same(name, feature))) {
      throw new Error(`${command} ${feature} is intentionally blocked`);
    }
    const spec = SPECS[command]?.[feature];
    if (!spec || operation !== spec.operation) throw new Error(`Unsupported ${command} action: ${feature}.${operation}`);
    let value = action.value;
    if (spec.values) value = spec.values[0] === null && value == null ? null : exact(value, spec.values, `${command} ${feature}`);
    else if (spec.dynamic) value = exact(value, available(environment, panel, command, spec.dynamic), `${command} ${feature}`);
    else if (spec.dynamicMany) {
      if (!Array.isArray(value) || value.length === 0) throw new Error(`${command} ${feature} requires at least one value`);
      const options = available(environment, panel, command, spec.dynamicMany);
      value = [...new Set(value.map(item => exact(item, options, `${command} ${feature}`)))];
    } else if (spec.sortColumns) value = normalizeSort(value, spec.sortColumns);
    else if (spec.positiveInteger) value = integerWithinLiveBounds(environment, panel, command, feature, value);
    else if (spec.nonEmptyString) {
      value = clean(value);
      if (!value || value.length > 200) throw new Error(`${command} ${feature} requires 1-200 characters`);
    } else if (spec.isoDate) value = isoDate(value);
    return { feature, operation, value };
  }

  function scalarEqual(a, b) {
    if (Array.isArray(a) || Array.isArray(b)) {
      return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => same(value, b[index]));
    }
    if (a && typeof a === "object" || b && typeof b === "object") {
      return Boolean(a && b) && same(a.column, b.column) && same(a.direction, b.direction);
    }
    return same(a, b);
  }

  function requireMetadata(environment, panel, command) {
    const metadata = environment.readResultMetadata?.(panel, command);
    if (!metadata || typeof metadata !== "object") throw new Error(`${command} result metadata is unavailable`);
    return metadata;
  }

  function assertTable(metadata, command) {
    const headers = Array.isArray(metadata.table_headers) ? metadata.table_headers : [];
    const required = command === "IMAP" ? ["Ticker", "Name", "Last", "Change", "Chg %"] : ["Ticker", "Last", "Change", "Volume"];
    if (!required.every(label => headers.some(header => same(header, label)))) throw new Error(`${command} table result is unverified`);
  }

  function assertCompletion(environment, panel, command, action, before = null) {
    const control = environment.readControl?.(panel, command, action.feature);
    const metadata = requireMetadata(environment, panel, command);

    if (action.operation === "download") {
      const receipt = metadata.download;
      if (!receipt || receipt.mime !== "application/pdf" || !Number.isFinite(receipt.bytes) || receipt.bytes <= 0
        || !/\.pdf$/i.test(clean(receipt.filename)) || receipt.overwrite_protected !== true) {
        throw new Error("News PDF download was not verified");
      }
      if (!metadata.article_id) throw new Error("News PDF requires an opened article");
      return true;
    }
    if (action.operation === "refresh") {
      const changed = clean(metadata.updated_at) && !same(metadata.updated_at, before?.updated_at);
      const completed = metadata.refresh_request_id && metadata.refresh_request_id !== before?.refresh_request_id;
      if (!changed && !completed) throw new Error("HALT refresh completion is unverified");
      return true;
    }
    if (!scalarEqual(control, action.value)) throw new Error(`${command} ${action.feature} control did not update`);

    if (action.feature === "view") {
      if (same(action.value, "Table")) assertTable(metadata, command);
      else if (!metadata.map_rendered || metadata.table_headers?.length) throw new Error(`${command} map result is unverified`);
    } else if (action.feature === "index" || action.feature === "universe" || (command === "HMAP" && action.feature === "watchlist")) {
      if (!scalarEqual(metadata.universe ?? metadata.watchlist, action.value) || !Number.isInteger(metadata.member_count)) {
        throw new Error(`${command} universe result is unverified`);
      }
    } else if (action.feature === "sector") {
      if (!same(metadata.sector, action.value) || !metadata.map_rendered) throw new Error("IMAP sector drilldown is unverified");
    } else if (action.feature === "back") {
      if (metadata.sector) throw new Error("IMAP did not return to the full index");
    } else if (action.feature === "sort") {
      if (!scalarEqual(metadata.sort, action.value)) throw new Error(`${command} sort metadata did not update`);
    } else if (command === "N" && action.feature === "query") {
      if (!same(metadata.query, action.value) || !Number.isInteger(metadata.result_count)) throw new Error("News query result is unverified");
    } else if (command === "N" && action.feature === "before date") {
      if (!same(metadata.before_date, action.value)) throw new Error("News date result is unverified");
    } else if (command === "N" && action.feature === "watchlist") {
      if (!same(metadata.watchlist, action.value) || !Number.isInteger(metadata.result_count)) throw new Error("News watchlist result is unverified");
    } else if (command === "N" && action.feature === "date range") {
      if (!same(metadata.date_range, action.value)) throw new Error("News date-range result is unverified");
    } else if (command === "N" && action.feature === "pause") {
      if (!same(metadata.feed_state, action.value)) throw new Error("News pause state is unverified");
    } else if (command === "N" && action.feature === "clear") {
      const cleared = metadata.clear_request_id && metadata.clear_request_id !== before?.clear_request_id;
      if (!cleared || metadata.per_window_filters_cleared !== true || metadata.query || !same(metadata.date_range, "All")) {
        throw new Error("News clear result is unverified");
      }
    } else if (command === "HMAP" && ["size by", "label", "sectors", "animate", "update interval", "color", "movers"].includes(action.feature)) {
      const key = action.feature.replace(/ /g, "_");
      if (!scalarEqual(metadata[key], action.value)) throw new Error(`HMAP ${action.feature} result is unverified`);
    } else if (command === "CF" && action.feature === "watchlist") {
      if (!same(metadata.watchlist, action.value) || !Number.isInteger(metadata.result_count)) throw new Error("CF watchlist result is unverified");
    } else if (command === "CF" && action.feature === "filing types") {
      if (!scalarEqual(metadata.filing_types, action.value)) throw new Error("CF filing-type result is unverified");
    } else if (command === "CF" && action.feature === "apply") {
      if (!metadata.apply_request_id || metadata.apply_request_id === before?.apply_request_id) throw new Error("CF apply completion is unverified");
    } else if (command === "CF" && action.feature === "select all filing types") {
      const all = available(environment, panel, command, "filing_types");
      if (!scalarEqual(metadata.filing_types, all)) throw new Error("CF Select All result is unverified");
    } else if (command === "HALT" && action.feature === "tab") {
      if (!same(metadata.tab, action.value) || !Number.isInteger(metadata.total) || !Number.isInteger(metadata.active)) {
        throw new Error("HALT tab result is unverified");
      }
      const statuses = metadata.row_statuses;
      if (!Array.isArray(statuses)) throw new Error("HALT row statuses are unavailable");
      if (same(action.value, "Active") && statuses.some(status => !same(status, "Active"))) {
        throw new Error("HALT Active rows are unverified");
      }
      if (same(action.value, "Resumed") && statuses.some(status => !same(status, "Resumed"))) {
        throw new Error("HALT Resumed rows are unverified");
      }
    }
    return true;
  }

  function createAdapter(command, environment = {}) {
    command = exact(command, COMMANDS, "command");
    return Object.freeze({
      command,
      enabled: false,
      supportedFeatures: Object.freeze(Object.keys(SPECS[command])),
      blockedFeatures: BLOCKED[command] ?? Object.freeze([]),
      async run(panel, input) {
        assertPanel(panel, command);
        const action = normalizeAction(command, input, environment, panel);
        const observedBefore = environment.readResultMetadata?.(panel, command) ?? null;
        // Snapshot only JSON-shaped authoritative state. Holding the live
        // object would let an in-place React store mutation rewrite "before".
        const before = observedBefore == null ? null : JSON.parse(JSON.stringify(observedBefore));
        if (!["download", "refresh"].includes(action.operation)) {
          try {
            assertCompletion(environment, panel, command, action, before);
            return { changed: false, action };
          } catch {}
        }
        if (action.operation === "download") {
          if (!before?.article_id) throw new Error("News PDF requires an opened article");
          await environment.downloadArticlePdf?.(panel, before.article_id);
        } else if (action.operation === "refresh") {
          await environment.refresh?.(panel, command);
        } else {
          if (typeof environment.setControl !== "function") throw new Error(`${command} control binding is unavailable`);
          await environment.setControl(panel, command, action.feature, action.value);
        }
        if (typeof environment.waitForCompletion !== "function") throw new Error(`${command} completion binding is unavailable`);
        await environment.waitForCompletion(() => assertCompletion(environment, panel, command, action, before));
        return { changed: true, action };
      }
    });
  }

  return Object.freeze({ COMMANDS, TABLE_SORTS, NEWS_SORTS, DIRECTIONS, SPECS, BLOCKED, normalizeAction, assertCompletion, createAdapter });
});
