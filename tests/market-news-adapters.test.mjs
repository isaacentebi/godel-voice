import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = { globalThis: {}, module: undefined };
vm.runInNewContext(fs.readFileSync(new URL("../extension/adapters/market-news.js", import.meta.url), "utf8"), context);
const api = context.globalThis.GodelVoiceMarketNewsAdapters;
const panel = command => ({ getAttribute: name => name === "data-cy-command-type" ? command : null });

function harness(command, initial = {}) {
  const state = {
    controls: { ...initial.controls }, metadata: { ...initial.metadata }, writes: []
  };
  const environment = {
    availableOptions(_panel, _command, key) { return initial.options?.[key] ?? []; },
    availableBounds(_panel, _command, key) { return initial.bounds?.[key] ?? null; },
    readControl(_panel, _command, feature) { return state.controls[feature]; },
    readResultMetadata() { return state.metadata; },
    async setControl(_panel, _command, feature, value) {
      state.controls[feature] = value; state.writes.push([feature, value]);
      if (feature === "view") {
        state.metadata.map_rendered = value === "Map";
        state.metadata.table_headers = value === "Table" ? (command === "IMAP" ? ["Ticker","Name","Last","Change","Chg %"] : ["Ticker","Last","Change","Volume"]) : [];
      }
      if (["index","universe"].includes(feature)) { state.metadata.universe = value; state.metadata.member_count = 500; }
      if (feature === "watchlist") { state.metadata.watchlist = value; state.metadata.member_count = 12; }
      if (feature === "sector") { state.metadata.sector = value; state.metadata.map_rendered = true; }
      if (feature === "back") { state.metadata.sector = null; }
      if (feature === "sort") state.metadata.sort = value;
      if (feature === "query") { state.metadata.query = value; state.metadata.result_count = 3; }
      if (feature === "before date") state.metadata.before_date = value;
      if (feature === "date range") state.metadata.date_range = value;
      if (feature === "pause") state.metadata.feed_state = value;
      if (feature === "clear") {
        state.metadata.clear_request_id = `${state.metadata.clear_request_id ?? "clear"}-next`;
        state.metadata.per_window_filters_cleared = true;
        state.metadata.query = "";
        state.metadata.date_range = "All";
      }
      if (feature === "filing types") state.metadata.filing_types = value;
      if (feature === "select all filing types") state.metadata.filing_types = initial.options?.filing_types ?? [];
      if (feature === "apply") state.metadata.apply_request_id = `${state.metadata.apply_request_id ?? "apply"}-next`;
      if (command === "HMAP" && ["size by","label","sectors","animate","update interval","color"].includes(feature)) {
        state.metadata[feature.replace(/ /g,"_")] = value;
      }
      if (command === "N" && feature === "watchlist") state.metadata.result_count = 3;
      if (command === "CF" && feature === "watchlist") state.metadata.result_count = 3;
      if (feature === "tab") {
        state.metadata.tab = value; state.metadata.total = 50; state.metadata.active = 2;
        state.metadata.row_statuses = value === "All" ? ["Active", "Resumed"] : [value];
      }
    },
    async refresh() { state.metadata.updated_at = "12:01"; },
    async downloadArticlePdf() {
      state.metadata.download = { mime:"application/pdf", bytes:100, filename:"article.pdf", overwrite_protected:true };
    },
    async waitForCompletion(assertion) { return assertion(); }
  };
  return { adapter: api.createAdapter(command, environment), state, environment };
}

test("IMAP verifies index/view/sector and sortable table content", async () => {
  const { adapter, state } = harness("IMAP", { options:{sectors:["Technology"]}, metadata:{map_rendered:true,table_headers:[]} });
  await adapter.run(panel("IMAP"), {feature:"index",operation:"select",value:"S&P 500"});
  await adapter.run(panel("IMAP"), {feature:"sector",operation:"drill",value:"Technology"});
  await adapter.run(panel("IMAP"), {feature:"view",operation:"select",value:"Table"});
  await adapter.run(panel("IMAP"), {feature:"sort",operation:"select",value:{column:"Chg %",direction:"Descending"}});
  assert.equal(state.metadata.universe,"S&P 500");
  assert.deepEqual(JSON.parse(JSON.stringify(state.metadata.sort)),{column:"Chg %",direction:"Descending"});
});

test("HMAP accepts only live watchlists and dynamic metrics", async () => {
  const { adapter, state } = harness("HMAP", { options:{watchlists:["Semis"],size_metrics:["Market Cap"],label_metrics:["Chg %"]}, metadata:{map_rendered:true,table_headers:[]} });
  await adapter.run(panel("HMAP"), {feature:"watchlist",operation:"select",value:"Semis"});
  await adapter.run(panel("HMAP"), {feature:"size by",operation:"select",value:"Market Cap"});
  assert.equal(state.metadata.watchlist,"Semis");
  await assert.rejects(adapter.run(panel("HMAP"), {feature:"watchlist",operation:"select",value:"Invented"}),/Unsupported/);
});

test("HMAP exercises every bounded toolbar action and rejects guessed slider values", async () => {
  const { adapter, state } = harness("HMAP", {
    options:{universes:["S&P 500","DJIA"],size_metrics:["Chg % abs"],label_metrics:["Chg %"]},
    bounds:{"update interval":{minimum:250,maximum:5000}},
    metadata:{map_rendered:true,table_headers:[]}
  });
  for (const action of [
    {feature:"universe",operation:"select",value:"DJIA"},
    {feature:"label",operation:"select",value:"Chg %"},
    {feature:"sectors",operation:"select",value:"Hide"},
    {feature:"animate",operation:"select",value:"Off"},
    {feature:"update interval",operation:"set",value:750},
    {feature:"color",operation:"select",value:"Manual"}
  ]) await adapter.run(panel("HMAP"), action);
  assert.equal(state.metadata.update_interval,750);
  await assert.rejects(adapter.run(panel("HMAP"), {feature:"update interval",operation:"set",value:100}),/250 to 5000/);
});

test("News local filters and article PDF are grounded, while global filters stay blocked", async () => {
  const { adapter, state } = harness("N", { options:{watchlists:["Core"]}, metadata:{article_id:"story-1",result_count:5} });
  await adapter.run(panel("N"), {feature:"query",operation:"set",value:"rate cuts"});
  await adapter.run(panel("N"), {feature:"before date",operation:"set",value:"2026-08-01"});
  await adapter.run(panel("N"), {feature:"article pdf",operation:"download",value:"PDF"});
  assert.equal(state.metadata.download.bytes,100);
  await assert.rejects(adapter.run(panel("N"), {feature:"sources",operation:"select",value:"Reuters"}),/intentionally blocked/);
});

test("News per-window date, pause, clear, sort and watchlist actions are independently asserted", async () => {
  const { adapter, state } = harness("N", {
    options:{watchlists:["No Watchlist","Core"]},
    metadata:{query:"old",date_range:"Before",clear_request_id:"clear-1",result_count:5}
  });
  await adapter.run(panel("N"), {feature:"watchlist",operation:"select",value:"Core"});
  await adapter.run(panel("N"), {feature:"date range",operation:"select",value:"Before"});
  await adapter.run(panel("N"), {feature:"pause",operation:"select",value:"Paused"});
  await adapter.run(panel("N"), {feature:"sort",operation:"select",value:{column:"Source",direction:"Ascending"}});
  await adapter.run(panel("N"), {feature:"clear",operation:"select",value:"Clear"});
  assert.equal(state.metadata.per_window_filters_cleared,true);
  assert.deepEqual(JSON.parse(JSON.stringify(state.metadata.sort)),{column:"Source",direction:"Ascending"});
});

test("News PDF fails closed without an opened article", async () => {
  const { adapter } = harness("N", { metadata:{} });
  await assert.rejects(adapter.run(panel("N"), {feature:"article pdf",operation:"download",value:"PDF"}),/opened article/);
});

test("HALT refresh needs a changed timestamp or native request id", async () => {
  const { adapter, state } = harness("HALT", { metadata:{updated_at:"12:00",refresh_request_id:"a",total:50,active:2,tab:"All",row_statuses:["Active","Resumed"]}, controls:{tab:"All"} });
  const result = await adapter.run(panel("HALT"), {feature:"refresh",operation:"refresh",value:null});
  assert.equal(result.changed,true);
  assert.equal(state.metadata.updated_at,"12:01");
});

test("HALT status tabs verify the rendered row population, not only the selected control", async () => {
  const { adapter, state } = harness("HALT", { metadata:{total:50,active:2,row_statuses:[]}, controls:{} });
  await adapter.run(panel("HALT"), {feature:"tab",operation:"select",value:"Active"});
  assert.deepEqual(state.metadata.row_statuses,["Active"]);
  assert.throws(() => api.assertCompletion({
    readControl:()=>"Active", readResultMetadata:()=>({tab:"Active",total:1,active:1,row_statuses:["Resumed"]})
  }, panel("HALT"), "HALT", {feature:"tab",operation:"select",value:"Active"}),/Active rows/);
});

test("CF validates filing types against the live menu and blocks the global render preference", async () => {
  const { adapter, state } = harness("CF", { options:{filing_types:["10-K","10-Q","8-K"]}, metadata:{} });
  await adapter.run(panel("CF"), {feature:"filing types",operation:"select",value:["10-Q","8-K"]});
  assert.deepEqual(JSON.parse(JSON.stringify(state.metadata.filing_types)),["10-Q","8-K"]);
  await assert.rejects(adapter.run(panel("CF"), {feature:"render filings in Godel",operation:"select",value:"on"}),/intentionally blocked/);
});

test("CF Select All and Apply require authoritative settings-state transitions", async () => {
  const { adapter, state } = harness("CF", {
    options:{filing_types:["10-K","10-Q","8-K","13F","NT 10-Q"]},
    metadata:{filing_types:["10-K"],apply_request_id:"apply-1"},
    controls:{}
  });
  await adapter.run(panel("CF"), {feature:"select all filing types",operation:"select",value:"Select All"});
  await adapter.run(panel("CF"), {feature:"apply",operation:"select",value:"Apply"});
  assert.deepEqual(state.metadata.filing_types,["10-K","10-Q","8-K","13F","NT 10-Q"]);
  assert.notEqual(state.metadata.apply_request_id,"apply-1");
});

test("every standalone market/news adapter is explicitly disabled pending live callback binding", () => {
  for (const command of api.COMMANDS) assert.equal(api.createAdapter(command).enabled,false);
  for (const [command, features] of Object.entries(api.BLOCKED)) {
    for (const feature of features) assert.throws(
      () => api.normalizeAction(command,{feature,operation:"select",value:null},{},panel(command)),
      /intentionally blocked/
    );
  }
});

test("News PDF receipt requires PDF extension and overwrite protection", () => {
  const action = {feature:"article pdf",operation:"download",value:"PDF"};
  assert.throws(() => api.assertCompletion({
    readResultMetadata:()=>({article_id:"story",download:{mime:"application/pdf",bytes:100,filename:"article.txt",overwrite_protected:true}})
  },panel("N"),"N",action),/not verified/);
  assert.throws(() => api.assertCompletion({
    readResultMetadata:()=>({article_id:"story",download:{mime:"application/pdf",bytes:100,filename:"article.pdf",overwrite_protected:false}})
  },panel("N"),"N",action),/not verified/);
});

test("wrong panels, ambiguous dynamic values and unverified completion fail closed", async () => {
  const { adapter } = harness("IMAP", { options:{sectors:["Technology"]}, metadata:{} });
  await assert.rejects(adapter.run(panel("HMAP"), {feature:"view",operation:"select",value:"Map"}),/not IMAP/);
  await assert.rejects(adapter.run(panel("IMAP"), {feature:"sector",operation:"drill",value:"Energy"}),/Unsupported/);
  const unsafe = api.createAdapter("HMAP", { readControl:()=>"Table",readResultMetadata:()=>({}),setControl(){},async waitForCompletion(a){return a();} });
  await assert.rejects(unsafe.run(panel("HMAP"), {feature:"view",operation:"select",value:"Table"}),/table result is unverified/);
});

test("source has no generic active-class success path", () => {
  const source = fs.readFileSync(new URL("../extension/adapters/market-news.js", import.meta.url),"utf8");
  assert.doesNotMatch(source,/classList\.(?:contains|toggle).*active/i);
  assert.match(source,/readResultMetadata/);
  assert.match(source,/receipt\.bytes/);
});
