import assert from "node:assert/strict";
import test from "node:test";
import { encodeControlFollowup, parseControlFollowup } from "../src/control-followup.mjs";
import { parseWorkflowMarker } from "../src/workflow-plan.mjs";

test("compiles short contextual window controls without an LLM", () => {
  assert.deepEqual(
    parseControlFollowup("make that window bigger").steps[0],
    {
      id: "control-1", kind: "control", operation: "resize",
      target: { mode: "last", command: null, security: null }, value: "larger",
      required: true, failure_policy: "stop"
    }
  );
  assert.equal(parseControlFollowup("put it on the left").steps[0].value, "left");
  assert.equal(parseControlFollowup("close the heatmap").steps[0].target.command, "HMAP");
  assert.deepEqual(parseControlFollowup("close the meta earnings matrix").steps[0].target, { mode: "command", command: "EM", security: "META" });
  assert.equal(parseControlFollowup("download this data").steps[0].operation, "export");
  assert.equal(parseControlFollowup("make the current window bigger").steps[0].target.mode, "last");
  assert.equal(parseControlFollowup("bring the earnings matrix to the front").steps[0].operation, "focus");
});

test("window controls win over nested market-map and halt vocabulary", () => {
  const heatmap = parseControlFollowup("make the market heatmap bigger").steps[0];
  assert.deepEqual({kind:heatmap.kind,operation:heatmap.operation,value:heatmap.value,target:heatmap.target}, {
    kind:"control", operation:"resize", value:"larger",
    target:{mode:"command",command:"HMAP",security:null}
  });
  const halts = parseControlFollowup("close the active market halts window").steps[0];
  assert.equal(halts.kind,"control");
  assert.equal(halts.operation,"close");
  assert.equal(halts.target.command,"HALT");
});

test("bulk destructive window language fails closed", () => {
  assert.equal(parseControlFollowup("close all windows"), null);
  assert.equal(parseControlFollowup("close everything"), null);
  assert.equal(parseControlFollowup("remove every panel"), null);
  assert.equal(parseControlFollowup("dismiss the whole screen"), null);
  assert.equal(parseControlFollowup("close the Meta earnings matrix").steps[0].operation, "close");
});

test("bulk close uses only exact current non-consequential panel context", () => {
  const plan = parseControlFollowup("please close all the windows", {
    panels: [
      { command: "G", security: "AMZN", connected: true },
      { command: "HMAP", security: null, connected: true },
      { command: "CHAT", security: null, connected: true }
    ]
  });
  assert.equal(plan.steps.length, 2);
  assert.deepEqual(plan.steps.map(step => [step.operation, step.target.command, step.target.security, step.required]), [
    ["close", "G", "AMZN", false], ["close", "HMAP", null, false]
  ]);
  assert.deepEqual(plan.steps.map(step => step.failure_policy), ["continue", "continue"]);
  assert.equal(parseControlFollowup("close these windows well please", {
    panels: [{ command: "WEI", connected: true }, { command: "WEIF", connected: true }, { command: "G", security: "VIX", connected: true }]
  }).steps.length, 3);
});

test("real conversational compounds preserve every requested operation", () => {
  const replace = parseControlFollowup("please close it and open the heatmap", {
    focused_panel: { command: "G", security: "AMZN", connected: true }
  });
  assert.deepEqual(replace.steps.map(step => step.kind), ["control", "command"]);
  assert.equal(replace.steps[0].target.mode, "focused");
  assert.equal(replace.steps[0].required, false);
  assert.equal(replace.steps[1].command, "HMAP");

  const geometry = parseControlFollowup("smaller smaller and actually to the right");
  assert.deepEqual(geometry.steps.map(step => [step.operation, step.value]), [["resize", "smaller"], ["move", "right"]]);

  const pair = parseControlFollowup("please open the heatmap and I also want an Amazon stock price chart");
  assert.deepEqual(pair.steps.map(step => [step.command, step.terminal_command]), [["HMAP", "HMAP"], ["G", "AMZN EQ G"]]);
  assert.equal(pair.layout.preset, "market");
  assert.deepEqual(pair.steps.map(step => step.layout?.placement), ["left", "right"]);
});

test("mixed Godel surfaces preserve clause-level left and right placement", () => {
  const plan = parseControlFollowup("open the market heatmap on the left and Meta earnings matrix on the right");
  assert.deepEqual(plan.steps.map(step => [step.command, step.layout?.placement]), [
    ["HMAP", "left"], ["EM", "right"]
  ]);
  assert.equal(plan.steps.some(step => step.kind === "control"), false);
});

test("Realtime-style spacing keeps screener and heatmap on the zero-model path", () => {
  const plan = parseControlFollowup("open an equity screener and a heat map");
  assert.deepEqual(plan.steps.map(step => step.terminal_command), ["EQS", "HMAP"]);
});

test("repairs QQQ speech and builds automatically arranged macro desks", () => {
  for (const voice of ["Q Q Q Nasdaq", "Q, Nazak", "How is the Q Q doing the Nasdaq?"]) {
    const plan = parseControlFollowup(voice);
    assert.equal(plan.steps[0].terminal_command, "QQQ EQ G", voice);
  }
  for (const voice of [
    "open a macro monitor",
    "I want to see what happened today, how are the indices doing, open a window with price action and volatility"
  ]) {
    const plan = parseControlFollowup(voice);
    assert.deepEqual(plan.steps.map(step => step.terminal_command), ["WEI", "WEIF", "VIX CBOE IDX G"], voice);
    assert.equal(plan.layout.preset, "market");
    assert.deepEqual(plan.steps.map(step => step.layout.placement), ["top-left", "top-right", "bottom"]);
  }
});

test("opens the documented CBOE VIX chart from direct natural voice aliases", () => {
  for (const voice of [
    "open the VIX chart",
    "show me the CBOE volatility index",
    "pull up the fear index",
    "how is the VIX doing",
    "bring up a market volatility graph"
  ]) {
    const plan = parseControlFollowup(voice);
    assert.equal(plan.steps.length, 1, voice);
    assert.equal(plan.steps[0].command, "G", voice);
    assert.equal(plan.steps[0].terminal_command, "VIX CBOE IDX G", voice);
    assert.equal(plan.steps[0].layout.placement, "full", voice);
  }
});

test("natural stock price questions use a grounded chart surface", () => {
  for (const voice of ["what is Meta's stock price", "tell me Amazon's share price", "how is Microsoft doing"]) {
    const plan = parseControlFollowup(voice);
    assert.equal(plan.steps[0].command, "G", voice);
    assert.match(plan.steps[0].terminal_command, /^(META|AMZN|MSFT) EQ G$/, voice);
  }
  const followup = parseControlFollowup("what about Meta", { focused_panel: { command: "G", security: "QQQ", connected: true } });
  assert.equal(followup.steps[0].terminal_command, "META EQ G");
});

test("after-hours and premarket questions use Godel's grounded Q header", () => {
  for (const voice of [
    "How is Amazon doing after hours? Can you check?",
    "show me Meta's after-hours quote",
    "tell me Microsoft's premarket price"
  ]) {
    const step = parseControlFollowup(voice).steps[0];
    assert.equal(step.command, "Q", voice);
    assert.match(step.terminal_command, /^(AMZN|META|MSFT) EQ Q$/, voice);
  }
});

test("VoiceInk forward-P/E variants route to the grounded earnings matrix", () => {
  for (const voice of [
    "now can we see forward p for meta",
    "do we have a chart of forward piece for Meta",
    "a forward P chart for Amazon"
  ]) {
    const step = parseControlFollowup(voice).steps[0];
    assert.equal(step.command, "EM", voice);
    assert.match(step.terminal_command, /^(?:META|AMZN) EQ EM$/, voice);
  }
});

test("plain high-frequency opens compile locally without an LLM", () => {
  const em = parseControlFollowup("Open Amazon's earnings matrix").steps[0];
  assert.equal(em.command, "EM");
  assert.equal(em.terminal_command, "AMZN EQ EM");

  const heatmap = parseControlFollowup("please pull up the market heatmap").steps[0];
  assert.equal(heatmap.command, "HMAP");
  assert.equal(heatmap.terminal_command, "HMAP");

  const configured = parseControlFollowup("open Amazon's earnings matrix and switch it to EBITDA").steps[0];
  assert.equal(configured.command, "EM");
  assert.deepEqual(configured.actions, [{ feature: "metric", operation: "select", value: "EBITDA" }]);
  const halts = parseControlFollowup("open the active market halts").steps[0];
  assert.equal(halts.command, "HALT");
  assert.deepEqual(halts.actions, [{ feature: "tab", operation: "select", value: "Active" }]);

  const profile = parseControlFollowup("bring up Google's company profile").steps[0];
  assert.equal(profile.terminal_command, "GOOG EQ DES");

  const estimates = parseControlFollowup("open Palantir analyst estimates").steps[0];
  assert.equal(estimates.terminal_command, "PLTR EQ ERN");

  const pair = parseControlFollowup("open the market heatmap and Amazon's earnings matrix");
  assert.deepEqual(pair.steps.map(step => step.terminal_command), ["HMAP", "AMZN EQ EM"]);
  assert.equal(pair.layout.preset, "grid");

  const ratingsDesk = parseControlFollowup("open the heatmap and Amazon analyst ratings");
  assert.deepEqual(ratingsDesk.steps.map(step => step.terminal_command), ["HMAP", "AMZN EQ ANR"]);
  assert.equal(ratingsDesk.layout.preset, "grid");

  assert.equal(parseControlFollowup("open the heatmap and compare Amazon with Meta"), null);
});

test("ordinary finance surfaces and noisy speech stay on the zero-model route", () => {
  const cases = [
    ["show me the three statements for micro soft", "MSFT EQ FA"],
    ["open n vidia earnings matt tricks", "NVDA EQ EM"],
    ["pull reddit short interest and days to cover", "RDDT EQ SI"],
    ["open oracle historical prices", "ORCL EQ HP"],
    ["latest news for eli lilly", "LLY EQ N"],
    ["show me world stock indexes live", "WEI"],
    ["open global commodities", "GLCO"],
    ["bring up forex cross rates", "FX"],
    ["open most active options", "MOSO"],
    ["show me top Reuters stories", "TOP"],
    ["open the IPO calendar", "IPO"],
    ["pull up my quote moniter watch list", "QM"]
  ];
  for (const [voice, terminalCommand] of cases) {
    const plan = parseControlFollowup(voice);
    assert.ok(plan, voice);
    assert.equal(plan.steps[0].terminal_command, terminalCommand, voice);
  }
});

test("opens one exact five-year operating-margin graph without the model", () => {
  for (const voice of [
    "open Amazon's operating margin graph for the past five years",
    "create a five year operating margin chart for Amazon"
  ]) {
    const plan = parseControlFollowup(voice);
    assert.equal(plan.steps.length, 1, voice);
    assert.equal(plan.steps[0].terminal_command, "AMZN EQ GF", voice);
    assert.deepEqual(plan.steps[0].actions, [
      { feature: "range", operation: "select", value: "5Y" },
      { feature: "margin metric", operation: "add", value: "Operating Margin" }
    ], voice);
    assert.equal(plan.steps[0].layout.placement, "full", voice);
  }

  const existing = parseControlFollowup(
    "open Amazon's operating margin graph for the past five years",
    {
      focused_panel: { command: "GF", security: "AMZN", connected: true },
      panels: [{ command: "GF", security: "AMZN", connected: true }]
    }
  );
  assert.equal(existing.steps[0].kind, "configure");
  assert.deepEqual(existing.steps[0].target, { mode: "focused", command: "GF", security: "AMZN" });
  assert.deepEqual(existing.steps[0].actions, [
    { feature: "range", operation: "select", value: "5Y" },
    { feature: "margin metric", operation: "add", value: "Operating Margin" }
  ]);
});

test("repairs the observed noisy US-technology screener request locally", () => {
  const voice = "Can you create an equity screener? I want all the companies that are above a fourteen P on US technology, please.";
  const plan = parseControlFollowup(voice);
  assert.equal(plan.steps.length, 1);
  assert.equal(plan.steps[0].terminal_command, "EQS");
  assert.deepEqual(plan.steps[0].actions, [
    { feature: "range_filter", operation: "add", value: { field: "P/E (TTM)", minimum: 14, maximum: null } },
    { feature: "list_filter", operation: "add", value: { field: "HQ Country", items: ["United States"] } },
    { feature: "list_filter", operation: "add", value: { field: "Sector", items: ["Technology"] } },
    { feature: "screen", operation: "run", value: null }
  ]);
  const existing = parseControlFollowup(voice, {
    panels: [{ command: "EQS", security: null, connected: true }]
  });
  assert.equal(existing.steps[0].kind, "configure");
  assert.deepEqual(existing.steps[0].target, { mode: "command", command: "EQS", security: null });
  assert.deepEqual(existing.steps[0].actions, plan.steps[0].actions);
});

test("close and resize followups address each market/news panel family exactly", () => {
  const cases = [
    ["make the index map bigger","IMAP","resize","larger"],
    ["close the market heatmap","HMAP","close",null],
    ["make the news feed smaller","N","resize","smaller"],
    ["close the market halts","HALT","close",null],
    ["put the filings on the right","CF","move","right"]
  ];
  for (const [voice,command,operation,value] of cases) {
    const step = parseControlFollowup(voice).steps[0];
    assert.equal(step.target.command,command,voice);
    assert.equal(step.operation,operation,voice);
    assert.equal(step.value,value,voice);
  }
});

test("fast path declines ungrounded research and compiles exact GF comparison", () => {
  assert.equal(parseControlFollowup("open Meta earnings and download ten years of financials"), null);
  const plan = parseControlFollowup("compare Amazon and Microsoft revenue");
  assert.equal(plan.steps[0].command, "GF");
  assert.deepEqual(plan.steps[0].actions, [
    { feature: "add company", operation: "add", value: "MSFT" },
    { feature: "add metric", operation: "add", value: "Revenue" }
  ]);
});

test("control followup round trips through canonical GV2", () => {
  const encoded = encodeControlFollowup("make the current panel smaller");
  assert.equal(parseWorkflowMarker(encoded).steps[0].value, "smaller");
});

test("compiles short nested followups without an LLM", () => {
  const halts = parseControlFollowup("show all halts in that window").steps[0];
  assert.equal(halts.kind, "configure");
  assert.deepEqual(halts.target, { mode: "command", command: "HALT", security: null });
  assert.deepEqual(halts.actions, [{ feature: "tab", operation: "select", value: "All" }]);

  const heatmap = parseControlFollowup("switch the market heatmap to table view").steps[0];
  assert.equal(heatmap.target.command, "HMAP");
  assert.equal(heatmap.actions[0].value, "Table");

  const range = parseControlFollowup("make the fundamentals graph five years").steps[0];
  assert.equal(range.target.command, "GF");
  assert.deepEqual(range.actions, [{ feature: "range", operation: "select", value: "5Y" }]);
});

test("switches an existing holders panel among its exact native views", () => {
  const bubble = parseControlFollowup("switch the Meta institutional holders to bubbles").steps[0];
  assert.deepEqual(bubble.target, { mode: "command", command: "HDS", security: "META" });
  assert.deepEqual(bubble.actions, [{ feature: "view", operation: "select", value: "Bubble" }]);
  const treemap = parseControlFollowup("show the holders window as a tree map").steps[0];
  assert.deepEqual(treemap.actions, [{ feature: "view", operation: "select", value: "Treemap" }]);
  const opener = parseControlFollowup("open Meta institutional holders as a bubble").steps[0];
  assert.equal(opener.kind, "command");
  assert.equal(opener.command, "HDS");
  assert.deepEqual(opener.actions, [{ feature: "view", operation: "select", value: "Bubble" }]);
  const noisy = parseControlFollowup("uh show me micro soft institushunal holders in the bub bull view").steps[0];
  assert.equal(noisy.terminal_command, "MSFT EQ HDS");
  assert.deepEqual(noisy.actions, [{ feature: "view", operation: "select", value: "Bubble" }]);
});

test("runs and clears an existing equity screener locally", () => {
  const run = parseControlFollowup("run the screener query").steps[0];
  assert.deepEqual(run.target, { mode: "command", command: "EQS", security: null });
  assert.deepEqual(run.actions, [{ feature: "screen", operation: "run", value: null }]);
  const clear = parseControlFollowup("clear the screener filters").steps[0];
  assert.deepEqual(clear.actions, [{ feature: "screen", operation: "clear", value: null }]);
  assert.equal(parseControlFollowup("open the equity screener").steps[0].command, "EQS");
});

test("uses recent authenticated panel context for bounded pronouns", () => {
  const eqsContext = { focused_panel: { command: "EQS", security: null } };
  const run = parseControlFollowup("run it", eqsContext).steps[0];
  assert.deepEqual(run.target, { mode: "focused", command: "EQS", security: null });
  assert.deepEqual(run.actions, [{ feature: "screen", operation: "run", value: null }]);
  const hds = parseControlFollowup("make the holders window bubbles", {
    focused_panel: { command: "HDS", security: "META" }
  }).steps[0];
  assert.deepEqual(hds.target, { mode: "focused", command: "HDS", security: "META" });
});

test("compiles spoken EQS ranges and a trailing run as one atomic workflow", () => {
  const step = parseControlFollowup("on the equity screener set forward pee between 10 and 20 and run the screen").steps[0];
  assert.deepEqual(step.target, { mode: "command", command: "EQS", security: null });
  assert.deepEqual(step.actions, [
    { feature: "range_filter", operation: "add", value: { field: "P/E (Fwd)", minimum: 10, maximum: 20 } },
    { feature: "screen", operation: "run", value: null }
  ]);
  assert.equal(parseControlFollowup("on the equity screener set forward pee"), null);
});

test("compiles earnings-matrix metric followups without an LLM", () => {
  const named = parseControlFollowup("change the Meta earnings matrix to EBITDA");
  assert.deepEqual(named.steps[0].target, { mode: "command", command: "EM", security: "META" });
  assert.deepEqual(named.steps[0].actions, [{ feature: "metric", operation: "select", value: "EBITDA" }]);

  const noisy = parseControlFollowup("switch this earnings matrix to e bit duh");
  assert.deepEqual(noisy.steps[0].actions, [{ feature: "metric", operation: "select", value: "EBITDA" }]);

  const valuation = parseControlFollowup("read the pee e multiple", {
    focused_panel: { command: "EM", security: "AMZN" }
  });
  assert.deepEqual(valuation.steps[0].target, { mode: "focused", command: "EM", security: "AMZN" });
  assert.deepEqual(valuation.steps[0].actions, [{
    feature: "valuation", operation: "read",
    value: { row: "P/E", section: "Multiples", semantic_unit: "Multiple" }
  }]);

  for (const voice of ["what is the p e multiple", "tell me the price to earnings multiple", "read EV over e bit duh"]) {
    const plan = parseControlFollowup(voice, { focused_panel: { command: "EM", security: "AMZN" } });
    assert.equal(plan.steps[0].target.command, "EM", voice);
    assert.equal(plan.steps[0].actions[0].value.semantic_unit, "Multiple", voice);
  }
  assert.equal(parseControlFollowup("tell me the p e percentage", {
    focused_panel: { command: "EM", security: "AMZN" }
  }), null);
});

test("compiles MOST result-count followups without an LLM", () => {
  const plan = parseControlFollowup("show 10 results in the most active stocks window");
  assert.deepEqual(plan.steps[0].target, { mode: "command", command: "MOST", security: null });
  assert.deepEqual(plan.steps[0].actions, [{ feature: "results", operation: "select", value: 10 }]);
});

test("compiles compound GF followups locally in dependency order", () => {
  const plan = parseControlFollowup("on the fundamentals graph add Microsoft show five years operating margin with estimates");
  assert.equal(plan.steps[0].target.command, "GF");
  assert.deepEqual(plan.steps[0].actions, [
    { feature: "range", operation: "select", value: "5Y" },
    { feature: "include consensus estimates", operation: "select", value: "on" },
    { feature: "add company", operation: "add", value: "MSFT" },
    { feature: "margin metric", operation: "add", value: "Operating Margin" }
  ]);
});

test("fast-paths verified GF period, layout, and currency controls", () => {
  const plan = parseControlFollowup("make the fundamentals graph annual and split it in euros");
  assert.deepEqual(plan.steps[0].actions, [
    { feature: "periodicity", operation: "select", value: "Annual" },
    { feature: "layout", operation: "select", value: "Split" },
    { feature: "display currency", operation: "select", value: "EUR" }
  ]);
});

test("opens an explicit multi-company GF comparison instead of treating it as a focused followup", () => {
  const plan = parseControlFollowup("open a fundamentals graph comparing Meta and Microsoft revenue");
  assert.equal(plan.steps[0].terminal_command, "META EQ GF");
  assert.deepEqual(plan.steps[0].actions, [
    { feature: "add company", operation: "add", value: "MSFT" },
    { feature: "add metric", operation: "add", value: "Revenue" }
  ]);
});

test("opens an explicit Dow index map as a table without the LLM", () => {
  const plan = parseControlFollowup("show me the Dow intraday map as a table");
  assert.equal(plan.steps[0].command, "IMAP");
  assert.equal(plan.steps[0].terminal_command, "IMAP");
  assert.deepEqual(plan.steps[0].actions, [
    { feature: "index", operation: "select", value: "DJIA" },
    { feature: "view", operation: "select", value: "Table" }
  ]);
});

test("compiles multi-quarter transcript research and contextual followups locally", () => {
  const plan = parseControlFollowup("Search Amazon's last four earnings calls for AWS revenue and tell me whether management mentioned margin pressure");
  assert.equal(plan.steps[0].command, "TRAN");
  assert.equal(plan.steps[0].terminal_command, "AMZN EQ TRAN");
  assert.deepEqual(plan.steps[0].actions[0].value.topics, ["aws revenue", "margin pressure"]);
  assert.equal(plan.steps[0].actions[0].value.periods, 4);

  const context = { research_session: { security: "AMZN", periods: ["Q2 2026", "Q1 2026", "Q4 2025", "Q3 2025"], topics: ["aws revenue"] } };
  const followup = parseControlFollowup("what about margins?", context);
  assert.deepEqual(followup.steps[0].target, { mode: "command", command: "TRAN", security: "AMZN" });
  assert.deepEqual(followup.steps[0].actions[0].value.topics, ["margins"]);
  assert.equal(parseControlFollowup("what about margins?"), null);
});

test("transcript research removes conversational call scope from the requested topic", () => {
  for (const [voice, expected] of [
    ["Did Meta mention business agents in its latest earnings call?", "business agents"],
    ["Did Meta discuss business AI agents on the most recent call?", "business ai agents"],
    ["Has Amazon talked about GPU availability during its latest transcript?", "gpu availability"]
  ]) {
    const step = parseControlFollowup(voice).steps[0];
    assert.equal(step.command, "TRAN", voice);
    assert.deepEqual(step.actions[0].value.topics, [expected], voice);
    assert.equal(step.actions[0].value.periods, 1, voice);
  }
});

test("read-only account-adjacent opens are deterministic but mutations remain gated", () => {
  const cases = [
    ["open the read only brokerage connection manager do not connect anything", "BROK", null],
    ["open account management do not change my plan", "ACM", null],
    ["open terminal settings dont change anything", "PDF", null],
    ["show current data entitlements dont subscribe to anything", "ENT", null],
    ["open the bug report form but dont send anything", "ERR", null],
    ["open the tesla ticker chat just read it do not post", "CHAT", "TSLA"],
    ["open my amazon company note without editing it", "NOTE", "AMZN"]
  ];
  for (const [voice, command, security] of cases) {
    const step = parseControlFollowup(voice).steps[0];
    assert.equal(step.command, command);
    assert.equal(step.terminal_command, security ? `${security} EQ ${command}` : command);
  }
  assert.equal(parseControlFollowup("connect my brokerage account"), null);
  assert.equal(parseControlFollowup("post in the tesla ticker chat"), null);
  assert.equal(parseControlFollowup("create an apple alert"), null);
});

test("noisy quick quote uses the authenticated chart surface", () => {
  const step = parseControlFollowup("quick quote for orr a cul uh oracle please").steps[0];
  assert.equal(step.command, "G");
  assert.equal(step.terminal_command, "ORCL EQ G");
});

test("bulk cleanup preserves an and-connected open and its trailing maximize", () => {
  const context = { panels: [
    { command: "HMAP", connected: true },
    { command: "G", security: "AMZN", connected: true }
  ] };
  const opened = parseControlFollowup("close all windows and open Meta earnings matrix", context);
  assert.deepEqual(opened.steps.map(step => step.kind), ["control", "control", "command"]);
  assert.equal(opened.steps.at(-1).terminal_command, "META EQ EM");

  const maximized = parseControlFollowup(
    "close everything then open Meta earnings matrix and maximize it",
    context
  );
  assert.deepEqual(maximized.steps.map(step => step.kind), ["control", "control", "command", "control"]);
  assert.deepEqual(maximized.steps.slice(-2).map(step => step.command ?? step.operation), ["EM", "maximize"]);
});

test("close-open compositions retain every requested open and window action", () => {
  const context = { focused_panel: { command: "G", security: "AMZN" } };
  const full = parseControlFollowup(
    "close the chart and open Meta earnings estimates full screen",
    context
  );
  assert.deepEqual(full.steps.map(step => step.command ?? step.operation), ["close", "ERN", "maximize"]);

  const resized = parseControlFollowup(
    "close the chart and open Meta earnings estimates and make it bigger",
    context
  );
  assert.deepEqual(resized.steps.map(step => step.command ?? step.operation), ["close", "ERN", "resize"]);
  assert.equal(resized.steps.at(-1).value, "larger");

  const multiple = parseControlFollowup(
    "close the chart and open the heatmap and active halts",
    context
  );
  assert.deepEqual(multiple.steps.map(step => step.command ?? step.operation), ["close", "HMAP", "HALT"]);
  assert.deepEqual(multiple.steps.at(-1).actions, [
    { feature: "tab", operation: "select", value: "Active" }
  ]);
});

test("window corrections use the final clause and ambiguous plurals fail closed", () => {
  const context = { focused_panel: { command: "HMAP" } };
  const moved = parseControlFollowup("move it left no wait right", context);
  assert.equal(moved.steps[0].operation, "move");
  assert.equal(moved.steps[0].value, "right");

  const restored = parseControlFollowup("maximize it no wait restore it", context);
  assert.equal(restored.steps[0].operation, "restore");

  assert.equal(parseControlFollowup("close both charts", context), null);
  assert.equal(parseControlFollowup("close those two charts", context), null);
  assert.equal(parseControlFollowup("move them left", context), null);
});
