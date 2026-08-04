import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "extension", "adapters", "imap.js"), "utf8");
const context = { globalThis: {}, setTimeout, clearTimeout };
vm.runInNewContext(source, context);
const imap = context.globalThis.GodelVoiceIMAPAdapter;

function node(text = "", attributes = {}, children = {}) {
  return {
    textContent: text,
    hidden: false,
    attributes: { ...attributes },
    children,
    clicks: 0,
    getAttribute(name) { return this.attributes[name] ?? null; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getBoundingClientRect() { return { width: 640, height: 360 }; },
    querySelectorAll(selector) {
      if (selector === "th,[role='columnheader']") return this.children.headers ?? [];
      return this.children[selector] ?? [];
    },
    click() { this.clicks += 1; this.onClick?.(); }
  };
}

function fixture({ view = "Map", index = "S&P 500", movers = "Gainers" } = {}) {
  const sp = node("S&P 500", { "aria-selected": String(index === "S&P 500") });
  const djia = node("DJIA", { "aria-selected": String(index === "DJIA") });
  const map = node("Map", { "aria-selected": String(view === "Map") });
  const table = node("Table", { "aria-selected": String(view === "Table") });
  const gainers = node("Gainers", { "aria-selected": String(movers === "Gainers") });
  const losers = node("Losers", { "aria-selected": String(movers === "Losers") });
  const tech = node("Information Technology");
  const visual = node("members", { "data-index": index, "aria-current": "true" });
  const headers = [node("Ticker"), node("Change")];
  const grid = node("", {}, { headers });
  const row = node("AAPL +1.2%", { "data-ticker": "AAPL" });
  const state = { view, index, movers, sector: null };
  const panel = node("", {}, {});

  const update = () => {
    sp.setAttribute("aria-selected", state.index === "S&P 500");
    djia.setAttribute("aria-selected", state.index === "DJIA");
    map.setAttribute("aria-selected", state.view === "Map");
    table.setAttribute("aria-selected", state.view === "Table");
    gainers.setAttribute("aria-selected", state.movers === "Gainers");
    losers.setAttribute("aria-selected", state.movers === "Losers");
    visual.setAttribute("data-index", state.index);
    visual.setAttribute("data-sector", state.sector ?? "");
    row.textContent = `${state.index}:${state.movers}:${state.sector ?? "All"}`;
  };
  sp.onClick = () => { state.index = "S&P 500"; update(); };
  djia.onClick = () => { state.index = "DJIA"; update(); };
  map.onClick = () => { state.view = "Map"; update(); };
  table.onClick = () => { state.view = "Table"; update(); };
  gainers.onClick = () => { state.movers = "Gainers"; update(); };
  losers.onClick = () => { state.movers = "Losers"; update(); };
  tech.onClick = () => { state.sector = "Information Technology"; update(); };

  panel.querySelectorAll = selector => {
    if (selector.includes("button") || selector.includes("[role='button']")) {
      return [sp, djia, map, table, gainers, losers, tech];
    }
    if (selector === "table,[role='table'],[role='grid']") return state.view === "Table" ? [grid] : [];
    if (selector.startsWith("canvas,svg")) return state.view === "Map" ? [visual] : [];
    if (selector === "tbody tr,[role='row'],[data-member],[data-ticker]") return [row];
    if (selector === "[role='row'],[data-member],[data-ticker]") return [row];
    if (selector.startsWith("h1,h2")) return state.sector ? [node(state.sector)] : [];
    if (selector.startsWith("[data-current-index]")) return state.view === "Map" ? [visual] : [];
    if (selector.startsWith("[data-current-movers]")) return [];
    if (selector.startsWith("[data-current-sector]")) {
      return state.sector ? [node(state.sector, { "data-current-sector": state.sector })] : [];
    }
    return [];
  };
  update();
  return { panel, state, controls: { sp, djia, map, table, gainers, losers, tech } };
}

function adapter() {
  return imap.createAdapter({ visible: () => true, pause: async () => {}, timeoutMs: 20, pollMs: 0 });
}

function sortFixture({ column = "Ticker", direction = "Ascending", duplicateTable = false } = {}) {
  const columns = ["Ticker","Name","Last","Change","Chg %","Volume"];
  const data = [
    ["MSFT","Microsoft","410.00","+2.00","+0.49%","20.0M"],
    ["AAPL","Apple","200.00","-3.00","-1.48%","35.0M"],
    ["NVDA","NVIDIA","180.00","+8.00","+4.65%","110.0M"]
  ];
  const headers = columns.map(label => node(label));
  const rows = data.map(values => node(values.join(" "),{}, {
    "td,[role='cell']": values.map(value => node(value))
  }));
  const state = { column, direction };
  const compareValue = (value, index) => index < 2 ? value.toLowerCase() : imap.clean(value).replace(/[$,%]/g,"").replace(/,/g,"")
    .replace(/([KMBT])$/i,(_,unit) => `e${({K:3,M:6,B:9,T:12})[unit.toUpperCase()]}`) * 1;
  const applySort = () => {
    const index = columns.indexOf(state.column);
    rows.sort((a,b) => {
      const av = compareValue(a.children["td,[role='cell']"][index].textContent,index);
      const bv = compareValue(b.children["td,[role='cell']"][index].textContent,index);
      const result = av < bv ? -1 : av > bv ? 1 : 0;
      return state.direction === "Ascending" ? result : -result;
    });
    headers.forEach((header,index) => {
      const active = columns[index] === state.column;
      header.textContent = columns[index] + (active ? state.direction === "Ascending" ? " ▲" : " ▼" : "");
      header.setAttribute("aria-sort",active ? state.direction.toLowerCase() : "none");
    });
  };
  headers.forEach((header,index) => {
    header.onClick = () => {
      const nextColumn = columns[index];
      state.direction = state.column === nextColumn && state.direction === "Ascending" ? "Descending" : "Ascending";
      state.column = nextColumn;
      applySort();
    };
  });
  const table = node("",{}, {
    headers,
    "th,[role='columnheader']": headers,
    "tbody tr,[role='row']": rows
  });
  const panel = node("",{},{});
  panel.querySelectorAll = selector => {
    if (selector === "table,[role='table'],[role='grid']") return duplicateTable ? [table,table] : [table];
    if (selector.startsWith("canvas,svg")) return [];
    return [];
  };
  applySort();
  return {panel,table,headers,rows,state,columns};
}

test("exports the live-verified UMD adapter contract", () => {
  assert.equal(imap.CONTRACT.command, "IMAP");
  assert.equal(imap.CONTRACT.enabled, true);
  assert.deepEqual([...imap.CONTRACT.indexes], ["S&P 500", "DJIA"]);
  assert.deepEqual([...imap.CONTRACT.blocked], ["movers", "subindustry", "export", "member open"]);
  assert.equal(typeof imap.adapter.run, "function");
});

test("installs only through an explicit verified registry callback", () => {
  const registrations = [];
  const installed = imap.install((command, candidate) => registrations.push([command, candidate]));
  assert.equal(installed, imap.adapter);
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0][0], "IMAP");
  assert.equal(registrations[0][1], imap.adapter);
  assert.throws(() => imap.install(null), /verified adapter registry function/);
});

test("selects DJIA and verifies changed rendered members", async () => {
  const f = fixture();
  await adapter().run(f.panel, { feature: "index", operation: "select", value: "djia" });
  assert.equal(f.state.index, "DJIA");
  assert.equal(f.controls.djia.clicks, 1);
});

test("index selection is idempotent without trusting an active CSS class", async () => {
  const f = fixture({ index: "DJIA" });
  f.controls.sp.attributes.class = "active";
  await adapter().run(f.panel, { feature: "index", operation: "select", value: "DJIA" });
  assert.equal(f.controls.djia.clicks, 0);
  assert.equal(imap.semanticSelected(f.controls.sp), false);
});

test("switches Map to Table only after a table with member headers renders", async () => {
  const f = fixture({ view: "Map" });
  await adapter().run(f.panel, { feature: "view", operation: "select", value: "Table" });
  assert.equal(f.state.view, "Table");
  assert.equal(f.controls.table.clicks, 1);
  assert.equal(imap.tableRendered(f.panel, () => true), true);
});

test("Map view is idempotent based on rendered visualization, not control styling", async () => {
  const f = fixture({ view: "Map" });
  f.controls.table.attributes.class = "active";
  await adapter().run(f.panel, { feature: "view", operation: "select", value: "Map" });
  assert.equal(f.controls.map.clicks, 0);
  assert.equal(imap.mapRendered(f.panel, () => true), true);
});

test("does not invent a movers selector from the read-only gainers and losers result panels", async () => {
  const f = fixture({ movers: "Gainers" });
  await assert.rejects(
    adapter().run(f.panel, { feature: "movers", operation: "select", value: "Losers" }),
    /intentionally blocked/
  );
  assert.equal(f.controls.losers.clicks, 0);
});

test("sector drilldown requires exact live text and verifies breadcrumb plus data change", async () => {
  const f = fixture();
  await assert.rejects(
    adapter().run(f.panel, { feature: "sector", operation: "select", value: "Information Technology" }),
    /exact live sector text/
  );
  await adapter().run(f.panel, {
    feature: "sector",
    operation: "select",
    value: "Information Technology",
    exact_live_text: "Information Technology"
  });
  assert.equal(f.state.sector, "Information Technology");
  assert.equal(f.controls.tech.clicks, 1);
});

test("sorts an exact IMAP table column and proves semantic direction plus monotonic rows", async () => {
  const f = sortFixture();
  await adapter().run(f.panel,{feature:"sort",operation:"select",value:{column:"Chg %",direction:"Descending"}});
  assert.deepEqual(f.state,{column:"Chg %",direction:"Descending"});
  assert.equal(imap.sortDirection(f.headers[4]),"Descending");
  assert.deepEqual(JSON.parse(JSON.stringify(imap.sortedColumnValues(f.table,"Chg %",()=>true))),[4.65,0.49,-1.48]);
});

test("IMAP sort is idempotent and accepts the live-observed Volume column", async () => {
  const f = sortFixture({column:"Volume",direction:"Descending"});
  await adapter().run(f.panel,{feature:"sort",operation:"select",value:{column:"Volume",direction:"Descending"}});
  assert.equal(f.headers[5].clicks,0);
  assert.deepEqual(JSON.parse(JSON.stringify(imap.sortedColumnValues(f.table,"Volume",()=>true))),[110e6,35e6,20e6]);
});

test("IMAP sort fails closed without Table view, unique table identity or parseable rows", async () => {
  const mapOnly = fixture({view:"Map"});
  await assert.rejects(adapter().run(mapOnly.panel,{feature:"sort",operation:"select",value:{column:"Ticker",direction:"Ascending"}}),/requires Table view/);
  const duplicate = sortFixture({duplicateTable:true});
  await assert.rejects(adapter().run(duplicate.panel,{feature:"sort",operation:"select",value:{column:"Ticker",direction:"Ascending"}}),/one exact visible match/);
  const corrupt = sortFixture();
  corrupt.rows[0].children["td,[role='cell']"][4].textContent = "N/A";
  await assert.rejects(adapter().run(corrupt.panel,{feature:"sort",operation:"select",value:{column:"Chg %",direction:"Descending"}}),/not numeric/);
});

test("composite configure is deterministic and rejects unknown keys", async () => {
  const f = fixture();
  await adapter().run(f.panel, {
    feature: "map",
    operation: "configure",
    value: { index: "DJIA", view: "Table" }
  });
  assert.deepEqual(f.state, { index: "DJIA", view: "Table", movers: "Gainers", sector: null });
  await assert.rejects(
    adapter().run(f.panel, { feature: "map", operation: "configure", value: { sort: "volume" } }),
    /sort requires column and direction/
  );
});

test("fails closed on unsupported enums, operations and ambiguous exact controls", async () => {
  const f = fixture();
  await assert.rejects(adapter().run(f.panel, { feature: "index", operation: "select", value: "NASDAQ 100" }), /Unsupported IMAP index/);
  await assert.rejects(adapter().run(f.panel, { feature: "view", operation: "toggle", value: "Table" }), /Unsupported IMAP operation/);
  const duplicate = node("DJIA");
  const original = f.panel.querySelectorAll;
  f.panel.querySelectorAll = selector => selector.includes("button") ? [...original(selector), duplicate] : original(selector);
  await assert.rejects(adapter().run(f.panel, { feature: "index", operation: "select", value: "DJIA" }), /found 2/);
});

test("never queries outside the supplied panel root", async () => {
  const f = fixture();
  let globalQueries = 0;
  const priorDocument = globalThis.document;
  globalThis.document = { querySelectorAll() { globalQueries += 1; return []; } };
  try {
    await adapter().run(f.panel, { feature: "view", operation: "select", value: "Table" });
  } finally {
    globalThis.document = priorDocument;
  }
  assert.equal(globalQueries, 0);
});
