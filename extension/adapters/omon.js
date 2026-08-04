(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GodelVoiceOMONAdapter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const FEATURE = "strike depth";

  function clean(value) {
    return String(value == null ? "" : value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function assertPanel(panel) {
    if (!panel || typeof panel.getAttribute !== "function") throw new Error("OMON requires an exact panel root");
    const type = clean(panel.getAttribute("data-cy-command-type") ?? panel.getAttribute("data-command")).toUpperCase();
    if (type !== "OMON") throw new Error("Addressed panel is not OMON");
    return panel;
  }

  function assertLiveProof(proof) {
    if (!proof || proof.authenticated_session !== true || proof.panel_identity !== "OMON"
      || proof.control_kind !== "slider" || proof.independent_label !== true
      || proof.rendered_rows_change !== true || proof.observed_step !== 5
      || !Array.isArray(proof.observed_values) || !proof.observed_values.includes(10) || !proof.observed_values.includes(15)) {
      throw new Error("OMON strike-depth binding requires authenticated live proof");
    }
  }

  function assertBounds(bounds) {
    if (!bounds || !Number.isInteger(bounds.minimum) || !Number.isInteger(bounds.maximum)
      || !Number.isInteger(bounds.step) || bounds.minimum <= 0 || bounds.minimum > bounds.maximum
      || bounds.step !== 5) {
      throw new Error("OMON live strike-depth bounds are unavailable");
    }
    return bounds;
  }

  function normalizeValue(value, bounds) {
    value = Number(value);
    if (!Number.isInteger(value) || value < bounds.minimum || value > bounds.maximum
      || (value - bounds.minimum) % bounds.step !== 0) {
      throw new Error(`OMON strike depth must be a live slider value from ${bounds.minimum} to ${bounds.maximum} in steps of ${bounds.step}`);
    }
    return value;
  }

  function assertState(state, expected, before = null) {
    if (!state || !Number.isInteger(state.slider_value) || !Number.isInteger(state.label_value)
      || state.slider_value !== expected || state.label_value !== expected
      || clean(state.label_text).toLowerCase() !== `${expected} strikes`.toLowerCase()) {
      throw new Error("OMON strike-depth control and label did not update");
    }
    if (!Number.isInteger(state.rendered_strike_rows) || state.rendered_strike_rows < expected * 2
      || state.rendered_strike_rows > expected * 2 + 1) {
      throw new Error("OMON rendered strike rows do not match the requested depth");
    }
    if (before && before.slider_value !== expected && state.rendered_strike_rows === before.rendered_strike_rows) {
      throw new Error("OMON option rows did not rerender for the new strike depth");
    }
    return true;
  }

  function createStrikeDepthEnvironment(binding, proof) {
    assertLiveProof(proof);
    if (!binding || typeof binding.readBounds !== "function" || typeof binding.readState !== "function"
      || typeof binding.setStrikeDepth !== "function" || typeof binding.waitForCompletion !== "function") {
      throw new Error("OMON strike-depth native binding is incomplete");
    }
    return Object.freeze({
      readBounds(panel) { return assertBounds(binding.readBounds(assertPanel(panel))); },
      readState(panel) { return binding.readState(assertPanel(panel)); },
      async setStrikeDepth(panel, value) { return binding.setStrikeDepth(assertPanel(panel), value); },
      async waitForCompletion(assertion) { return binding.waitForCompletion(assertion); }
    });
  }

  function createOMONAdapter(environment = {}) {
    return Object.freeze({
      command: "OMON",
      enabled: false,
      supportedFeatures: Object.freeze([FEATURE]),
      async run(panel, input) {
        assertPanel(panel);
        const feature = clean(input?.feature).toLowerCase();
        const operation = clean(input?.operation).toLowerCase();
        if (feature !== FEATURE || operation !== "set") throw new Error(`Unsupported OMON action: ${feature}.${operation}`);
        const bounds = assertBounds(environment.readBounds?.(panel));
        const value = normalizeValue(input.value, bounds);
        const before = environment.readState?.(panel);
        try {
          assertState(before, value);
          return { changed: false, action: { feature, operation, value } };
        } catch {}
        if (typeof environment.setStrikeDepth !== "function") throw new Error("OMON strike-depth control binding is unavailable");
        await environment.setStrikeDepth(panel, value);
        if (typeof environment.waitForCompletion !== "function") throw new Error("OMON strike-depth completion binding is unavailable");
        await environment.waitForCompletion(() => assertState(environment.readState?.(panel), value, before));
        return { changed: true, action: { feature, operation, value } };
      }
    });
  }

  return Object.freeze({ FEATURE, assertLiveProof, assertBounds, normalizeValue, assertState, createStrikeDepthEnvironment, createOMONAdapter });
});
