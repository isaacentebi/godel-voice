import assert from "node:assert/strict";
import test from "node:test";

await import("../extension/adapters/em.js");
const em = globalThis.GodelVoiceEMAdapter;

class FakeControl {
  constructor(label, attributes = {}) {
    this.textContent = label;
    this.attributes = new Map(Object.entries(attributes).map(([key, value]) => [key, String(value)]));
    this.hidden = false;
    this.disabled = false;
    this.style = {};
    this.checked = attributes.checked;
    this.onClick = null;
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  click() { this.onClick?.(); }
}

class FakePanel {
  constructor(groups) { this.groups = groups; }
  querySelectorAll(selector) {
    const keys = [];
    if (/button|combobox|option|menuitem|radio|checkbox|switch|input/.test(selector)) keys.push("controls");
    if (/h1|h2|h3|h4|h5|h6|th|heading|columnheader|rowheader|aria-label/.test(selector)) keys.push("labels");
    if (/^th|columnheader/.test(selector)) keys.push("headers");
    return [...new Set(keys.flatMap(key => this.groups[key] ?? []))];
  }
}

function label(text) { return new FakeControl(text); }

test("EM contract is comprehensive but remains disabled until live verification", () => {
  assert.equal(em.CONTRACT.command, "EM");
  assert.equal(em.CONTRACT.status, "pending-live-verification");
  assert.equal(em.CONTRACT.enabled, false);
  assert.deepEqual([...em.METRICS], [
    "Sales", "Gross Revenue", "Net Revenue", "EBITDA", "Net Income", "EPS (GAAP)", "Total Assets", "Current Assets",
    "Current Liabilities", "Shareholder Equity", "Cash Flow From Operations",
    "Cash Flow From Investing", "Cash Flow From Financing"
  ]);
});

test("EM validates documented metric, chart, growth and series enums", () => {
  assert.equal(em.validateAction({ feature: "metric", operation: "select", value: "ebitda" }).value, "EBITDA");
  assert.equal(em.validateAction({ feature: "metric", operation: "select", value: "gross revenue" }).value, "Gross Revenue");
  assert.equal(em.validateAction({ feature: "metric", operation: "select", value: "net revenue" }).value, "Net Revenue");
  assert.equal(em.validateAction({ feature: "metric", operation: "select", value: "net income" }).value, "Net Income");
  assert.equal(em.validateAction({ feature: "metric", operation: "select", value: "net income (BFNG)" }).value, "Net Income");
  assert.equal(em.validateAction({ feature: "metric", operation: "select", value: "EPS GAAP" }).value, "EPS (GAAP)");
  assert.equal(em.validateAction({ feature: "metric", operation: "select", value: "CFO" }).value, "Cash Flow From Operations");
  assert.equal(em.validateAction({ feature: "metric", operation: "select", value: "CFI" }).value, "Cash Flow From Investing");
  assert.equal(em.validateAction({ feature: "metric", operation: "select", value: "CFF" }).value, "Cash Flow From Financing");
  assert.equal(em.validateAction("selectChart", { value: "growth" }).value, "Growth Chart");
  assert.equal(em.validateAction("selectGrowth", { value: "year-over-year" }).value, "YoY % Growth");
  assert.equal(em.validateAction("setSeriesVisibility", { value: "estimates", visible: false }).operation, "hide");
  assert.throws(() => em.validateAction({ feature: "metric", operation: "select", value: "NOPAT" }), /Unsupported EM metric/);
  assert.throws(() => em.validateAction({ feature: "chart", operation: "toggle", value: "Values" }), /only supports select/);
});

test("EM public contract exposes canonical values without alias duplicates", () => {
  assert.deepEqual(em.CONTRACT.features.chart, ["Values Chart", "Growth Chart"]);
  assert.deepEqual(em.CONTRACT.features.growth, ["YoY % Growth", "PoP % Growth"]);
  assert.deepEqual(em.CONTRACT.features.series, ["Historical", "Estimates"]);
  assert.equal(new Set(em.CONTRACT.features.metric).size, em.CONTRACT.features.metric.length);
});

test("EM valuation rows are read-only and are never accepted as matrix metrics", () => {
  for (const valuation of em.VALUATION_ROWS) {
    assert.throws(
      () => em.validateAction({ feature: "metric", operation: "select", value: valuation }),
      /read-only valuation-table row/
    );
  }
});

test("EM metric selection is panel-scoped, idempotent, and waits for Values/Growth headings", async () => {
  const current = new FakeControl("Sales");
  const option = new FakeControl("EBITDA", { role: "option" });
  option.hidden = true;
  const panel = new FakePanel({ controls: [current, option], labels: [label("Values"), label("Growth")] });
  let triggerClicks = 0;
  let optionClicks = 0;
  current.onClick = () => { triggerClicks += 1; option.hidden = false; };
  option.onClick = () => {
    optionClicks += 1;
    current.textContent = "EBITDA";
    panel.groups.controls = [current];
  };
  const adapter = em.createAdapter({ timeoutMs: 100, intervalMs: 1 });
  await adapter.run(panel, { feature: "metric", operation: "select", value: "EBITDA" });
  assert.equal(triggerClicks, 1);
  assert.equal(optionClicks, 1);
  await adapter.run(panel, { feature: "metric", operation: "select", value: "EBITDA" });
  assert.equal(triggerClicks, 1, "already selected metric must not be clicked again");
});

test("EM selects the live-observed Gross Revenue option without confusing it with Sales", async () => {
  const current = new FakeControl("Sales");
  const gross = new FakeControl("Gross Revenue", { role: "option" });
  const net = new FakeControl("Net Revenue", { role: "option" });
  gross.hidden = true;
  net.hidden = true;
  current.onClick = () => { gross.hidden = false; net.hidden = false; };
  gross.onClick = () => {
    current.textContent = "Gross Revenue";
    panel.groups.controls = [current];
  };
  const panel = new FakePanel({ controls: [current, gross, net], labels: [label("Values"), label("Growth")] });
  await em.createAdapter({ timeoutMs: 100, intervalMs: 1 }).run(
    panel,
    { feature: "metric", operation: "select", value: "gross revenue" }
  );
  assert.equal(current.textContent, "Gross Revenue");
});

test("EM chart and growth toggles require semantic state, never generic active CSS", async () => {
  const values = new FakeControl("Values Chart", { "aria-pressed": "true", class: "active" });
  const growth = new FakeControl("Growth Chart", { "aria-pressed": "false" });
  values.onClick = () => { values.setAttribute("aria-pressed", "true"); growth.setAttribute("aria-pressed", "false"); };
  growth.onClick = () => { values.setAttribute("aria-pressed", "false"); growth.setAttribute("aria-pressed", "true"); };
  const yoy = new FakeControl("YoY % Growth", { "aria-selected": "false" });
  const pop = new FakeControl("PoP % Growth", { "aria-selected": "true" });
  yoy.onClick = () => { yoy.setAttribute("aria-selected", "true"); pop.setAttribute("aria-selected", "false"); };
  const panel = new FakePanel({ controls: [values, growth, yoy, pop], labels: [values, growth, yoy, pop] });
  const adapter = em.createAdapter({ timeoutMs: 100, intervalMs: 1 });
  await adapter.run(panel, "selectChart", { value: "Growth" });
  await adapter.run(panel, "selectGrowth", { value: "YoY" });
  assert.equal(growth.getAttribute("aria-pressed"), "true");
  assert.equal(yoy.getAttribute("aria-selected"), "true");

  const unsafe = new FakeControl("Values Chart", { class: "active" });
  const unsafePanel = new FakePanel({ controls: [unsafe], labels: [unsafe] });
  await assert.rejects(
    em.createAdapter().run(unsafePanel, "selectChart", { value: "Values" }),
    /no verified aria-selected, aria-pressed, or aria-checked state/
  );
});

test("EM historical/estimates visibility only operates an exact stateful control", async () => {
  const historical = new FakeControl("Historical", { "aria-checked": "true" });
  const estimates = new FakeControl("Estimates", { "aria-checked": "false" });
  estimates.onClick = () => estimates.setAttribute("aria-checked", "true");
  const panel = new FakePanel({ controls: [historical, estimates], labels: [historical, estimates] });
  const adapter = em.createAdapter({ timeoutMs: 100, intervalMs: 1 });
  await adapter.run(panel, "setSeriesVisibility", { value: "Estimates", visible: true });
  assert.equal(estimates.getAttribute("aria-checked"), "true");

  const legendOnly = new FakeControl("Estimates");
  const legendPanel = new FakePanel({ controls: [legendOnly], labels: [legendOnly] });
  await assert.rejects(
    adapter.run(legendPanel, "setSeriesVisibility", { value: "Estimates", visible: true }),
    /no verified visibility state/
  );
});

test("EM reads only observed valuation headings and rows", () => {
  const headings = [label("Multiples"), label("Last 4Q"), label("Next 4Q"), label("FY 2027"), label("P/E"), label("EV/EBITDA")];
  const panel = new FakePanel({ labels: headings, headers: [headings[1], headings[2], headings[3]] });
  const table = em.readValuationTable(panel);
  assert.equal(table.mode, "read-only");
  assert.deepEqual([...table.headers], ["Last 4Q", "Next 4Q", "FY 2027"]);
  assert.deepEqual([...table.rows], ["P/E", "EV/EBITDA"]);
  assert(Object.isFrozen(table));
});

test("EM rejects ambiguous duplicate controls and missing table completion labels", async () => {
  const a = new FakeControl("Sales");
  const b = new FakeControl("Sales");
  const ambiguous = new FakePanel({ controls: [a, b], labels: [label("Values"), label("Growth")] });
  await assert.rejects(
    em.createAdapter().run(ambiguous, "selectMetric", { value: "Sales" }),
    /requires one exact panel-scoped control; found 2/
  );

  const sales = new FakeControl("Sales");
  const missingGrowth = new FakePanel({ controls: [sales], labels: [label("Values")] });
  await assert.rejects(
    em.createAdapter({ timeoutMs: 5, intervalMs: 1 }).run(missingGrowth, "selectMetric", { value: "Sales" }),
    /metric selection requires exactly one visible 'Sales' control; found 0/
  );
});
