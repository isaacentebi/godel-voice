import assert from "node:assert/strict";
import test from "node:test";
import { compileNaturalRequest } from "../src/compile-natural-request.mjs";
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

test("generic watchlist opens Quote Monitor locally without model availability", async () => {
  for (const utterance of ["open a watchlist", "could you please open a watchlist", "show my watchlist please"]) {
    const plan = parseControlFollowup(utterance);
    assert.equal(plan.steps[0].command, "QM", utterance);
    assert.equal(plan.steps[0].terminal_command, "QM", utterance);
    const compiled = await compileNaturalRequest(utterance, {
      compile: async () => { throw new Error("model forbidden"); }
    });
    assert.equal(compiled.kind, "execute", utterance);
    assert.equal(compiled.route, "local", utterance);
  }
  assert.notEqual(parseControlFollowup("open news for my core watchlist")?.steps?.[0]?.command, "QM");
});

test("open another preserves one exact connected multi-instance context", () => {
  const chart = parseControlFollowup("open another one", {
    focused_panel: { command: "G", security: "AMZN", connected: true }
  });
  assert.equal(chart.steps[0].terminal_command, "AMZN EQ G");
  assert.equal(chart.layout.preserve_existing, true);

  const named = parseControlFollowup("open another Meta chart", {
    focused_panel: { command: "G", security: "AMZN", connected: true }
  });
  assert.equal(named.steps[0].terminal_command, "META EQ G");
  assert.equal(named.layout.preserve_existing, true);

  assert.equal(parseControlFollowup("open another one"), null);
  assert.equal(parseControlFollowup("open another one", {
    focused_panel: { command: "HMAP", security: null, connected: true }
  }), null);
  assert.equal(parseControlFollowup("open another one", {
    focused_panel: { command: "G", security: "AMZN", connected: false }
  }), null);
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

test("bulk destructive window language compiles to a Voice-workspace reset", () => {
  for (const utterance of ["close all windows", "close everything", "remove every panel", "dismiss the whole screen"]) {
    const plan = parseControlFollowup(utterance);
    assert.equal(plan.steps.length, 1);
    assert.equal(plan.steps[0].operation, "reset_workspace");
    assert.equal(plan.steps[0].target.mode, "focused");
  }
  assert.equal(parseControlFollowup("close the Meta earnings matrix").steps[0].operation, "close");
});

test("bulk close resets the whole dedicated Voice workspace regardless of visible context", () => {
  const plan = parseControlFollowup("please close all the windows", {
    panels: [
      { command: "G", security: "AMZN", connected: true },
      { command: "HMAP", security: null, connected: true },
      { command: "CHAT", security: null, connected: true }
    ]
  });
  assert.equal(plan.steps.length, 1);
  assert.equal(plan.steps[0].operation, "reset_workspace");
  assert.equal(plan.steps[0].required, true);
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

test("open-then-close is finite, model-free, ordered, and targets the exact opened panel", async () => {
  const named = parseControlFollowup("open the market heatmap then close the heatmap");
  assert.deepEqual(named.steps.map(step => [step.kind, step.command ?? step.operation]), [
    ["command", "HMAP"], ["control", "close"]
  ]);
  assert.deepEqual(named.steps[1].target, { mode: "command", command: "HMAP", security: null });
  assert.equal(named.steps[1].required, true);

  const pronoun = parseControlFollowup("open the Amazon chart and then close it");
  assert.equal(pronoun.steps[0].terminal_command, "AMZN EQ G");
  assert.deepEqual(pronoun.steps[1].target, { mode: "command", command: "G", security: "AMZN" });

  const compiled = await compileNaturalRequest("open the market heatmap then close the heatmap", {
    compile: async () => { throw new Error("model forbidden"); }
  });
  assert.equal(compiled.kind, "execute");
  assert.equal(compiled.route, "local");
});

test("impossible single-panel placement conflicts clarify without model latency", async () => {
  let modelCalls = 0;
  const result = await compileNaturalRequest(
    "put the Amazon chart on the left and also on the right but do not duplicate it",
    { compile: async () => { modelCalls += 1; throw new Error("model forbidden"); } }
  );
  assert.equal(result.kind, "clarify");
  assert.equal(result.route, "local");
  assert.match(result.message, /left or the right/i);
  assert.equal(modelCalls, 0);
});

test("post-open geometry controls keep exact identity through recursive composition", () => {
  const plan = parseControlFollowup("open the market heatmap then move it to the left and make it bigger");
  assert.deepEqual(plan.steps.map(step => [step.kind, step.command ?? step.operation]), [
    ["command", "HMAP"], ["control", "move"], ["control", "resize"]
  ]);
  assert.deepEqual(plan.steps.slice(1).map(step => step.target), [
    { mode: "command", command: "HMAP", security: null },
    { mode: "command", command: "HMAP", security: null }
  ]);
  assert.deepEqual(plan.steps.slice(1).map(step => step.value), ["left", "larger"]);
});

test("a close-open-place-resize replacement keeps every operation and exact new identity", async () => {
  const phrase = "close the focused window then pull up Amazon estimates in its place on the left and make it larger";
  const plan = parseControlFollowup(phrase);
  assert.deepEqual(plan.steps.map(step => step.command ?? step.operation), ["close", "ERN", "resize"]);
  assert.deepEqual(plan.steps[0].target, { mode: "focused", command: null, security: null });
  assert.equal(plan.steps[1].terminal_command, "AMZN EQ ERN");
  assert.equal(plan.steps[1].layout.placement, "left");
  assert.deepEqual(plan.steps[2].target, { mode: "command", command: "ERN", security: "AMZN" });
  assert.equal(plan.steps[2].value, "larger");
  const compiled = await compileNaturalRequest(phrase, {
    compile: async () => { throw new Error("model forbidden"); }
  });
  assert.equal(compiled.route, "local");
});

test("multi-window control sequences preserve spoken order and named identities", async () => {
  const phrase = "move the Apple chart upper right shrink it then focus the Meta matrix and maximize that";
  const plan = parseControlFollowup(phrase);
  assert.deepEqual(plan.steps.map(step => [step.operation, step.target.command, step.target.security, step.value]), [
    ["move", "G", "AAPL", "top-right"],
    ["resize", "G", "AAPL", "smaller"],
    ["focus", "EM", "META", null],
    ["maximize", "EM", "META", null]
  ]);
  const compiled = await compileNaturalRequest(phrase, {
    compile: async () => { throw new Error("model forbidden"); }
  });
  assert.equal(compiled.route, "local");
});

test("two independently named company panels open locally without an imperative", async () => {
  const phrase = "Amazon earnings matrix and Meta analyst ratings";
  const plan = parseControlFollowup(phrase);
  assert.deepEqual(plan.steps.map(step => step.terminal_command), ["AMZN EQ EM", "META EQ ANR"]);
  const compiled = await compileNaturalRequest(phrase, {
    compile: async () => { throw new Error("model forbidden"); }
  });
  assert.equal(compiled.route, "local");
});

test("live-failed EM valuation and HDS Bubble requests fail closed before any model call", async () => {
  assert.equal(parseControlFollowup("open Amazon earnings matrix and read forward P E"), null);
  assert.equal(parseControlFollowup("read the P E multiple", {
    focused_panel: { command: "EM", security: "AMZN", connected: true }
  }), null);
  assert.equal(parseControlFollowup("open Meta institutional holders as a bubble"), null);
  assert.equal(parseControlFollowup("switch this to Bubble", {
    focused_panel: { command: "HDS", security: "META", connected: true }
  }), null);
  for (const [phrase, context] of [
    ["open Amazon earnings matrix and read forward P E", null],
    ["open Meta institutional holders as a bubble", null],
    ["read the P E multiple", { focused_panel: { command: "EM", security: "AMZN", connected: true } }],
    ["switch this to Bubble", { focused_panel: { command: "HDS", security: "META", connected: true } }]
  ]) {
    const compiled = await compileNaturalRequest(phrase, {
      context,
      compile: async () => { throw new Error("model forbidden"); }
    });
    assert.equal(compiled.kind, "unsupported", phrase);
    assert.equal(compiled.route, "local", phrase);
  }
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

test("direct VIX charts retain an explicit native CLI interval", () => {
  const plan = parseControlFollowup("open the VIX one hour chart");
  assert.equal(plan.steps[0].terminal_command, "VIX CBOE IDX G 1h");
  assert.deepEqual(plan.steps[0].arguments, ["1h"]);
});

test("direct chart resolutions use exact Godel CLI arguments without a model", async () => {
  for (const [spoken, resolution] of [
    ["one-minute", "1m"], ["five-minute", "5m"], ["fifteen-minute", "15m"],
    ["thirty-minute", "30m"], ["hourly", "1h"], ["daily", "1d"]
  ]) {
    for (const phrase of [
      `open a ${spoken} Apple chart`,
      `open Apple ${spoken} chart`,
      `open a chart for Apple, ${spoken}`
    ]) {
      const plan = parseControlFollowup(phrase);
      assert.equal(plan.steps[0].terminal_command, `AAPL EQ G ${resolution}`, phrase);
      assert.deepEqual(plan.steps[0].arguments, [resolution], phrase);
      assert.deepEqual(plan.steps[0].actions, [], phrase);
      const compiled = await compileNaturalRequest(phrase, {
        compile: async () => { throw new Error("model forbidden"); }
      });
      assert.equal(compiled.route, "local", phrase);
    }
  }

  assert.equal(parseControlFollowup("show Apple for five days"), null);
  const fundamental = parseControlFollowup("open Apple's five-year operating margin chart");
  assert.equal(fundamental.steps[0].command, "GF");
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

test("VoiceInk forward-P/E variants fail closed after the live EM row disappeared", () => {
  for (const voice of [
    "now can we see forward p for meta",
    "do we have a chart of forward piece for Meta",
    "a forward P chart for Amazon"
  ]) {
    assert.equal(parseControlFollowup(voice), null, voice);
  }
});

test("opens one earnings matrix and one analyst view for a real conversational compound", () => {
  const plan = parseControlFollowup(
    "Can you pull up the Amazon earnings matrix? Is there info on Amazon analyst price targets and its expectations?"
  );
  assert.deepEqual(plan.steps.map(step => [step.command, step.terminal_command]), [
    ["EM", "AMZN EQ EM"],
    ["ANR", "AMZN EQ ANR"]
  ]);
  assert.equal(plan.layout.preset, "grid");
  assert.equal(plan.steps.filter(step => step.command === "EM").length, 1);
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

test("market index, active-option, and historical-change aliases remain local", async () => {
  for (const [phrase, commands] of [
    ["open world market indices", ["WEI"]],
    ["show global market indices", ["WEI"]],
    ["open active options", ["MOSO"]],
    ["show active options and the market heatmap", ["MOSO", "HMAP"]],
    ["open Amazon historical change percent", ["HCP"]],
    ["open world market indices and the market heatmap", ["WEI", "HMAP"]]
  ]) {
    const compiled = await compileNaturalRequest(phrase, {
      compile: async () => { throw new Error("model forbidden"); }
    });
    assert.equal(compiled.route, "local", phrase);
    assert.deepEqual(parseWorkflowMarker(compiled.marker).steps.map(step => step.command), commands, phrase);
  }
});

test("ALLQ identity wins over workspace-reset grammar", async () => {
  const close = parseControlFollowup("close all quotes");
  assert.equal(close.steps.length, 1);
  assert.equal(close.steps[0].operation, "close");
  assert.deepEqual(close.steps[0].target, { mode: "command", command: "ALLQ", security: null });

  const compound = await compileNaturalRequest("open all quotes then close all quotes", {
    compile: async () => { throw new Error("model forbidden"); }
  });
  assert.equal(compound.route, "local");
  const plan = parseWorkflowMarker(compound.marker);
  assert.deepEqual(plan.steps.map(step => step.command ?? step.operation), ["ALLQ", "close"]);
  assert.deepEqual(plan.steps[1].target, { mode: "command", command: "ALLQ", security: null });
});

test("quick-quote compounds preserve exact G security and every operation", async () => {
  for (const [phrase, expected] of [
    ["open Amazon quick quote then close Amazon quick quote", ["G", "close"]],
    ["open Amazon quick quote then move it left", ["G", "move"]],
    ["close Amazon quick quote then open Amazon quick quote", ["close", "G"]]
  ]) {
    const compiled = await compileNaturalRequest(phrase, {
      compile: async () => { throw new Error("model forbidden"); }
    });
    assert.equal(compiled.route, "local", phrase);
    const plan = parseWorkflowMarker(compiled.marker);
    assert.deepEqual(plan.steps.map(step => step.command ?? step.operation), expected, phrase);
    for (const step of plan.steps.filter(step => step.kind === "control")) {
      assert.deepEqual(step.target, { mode: "command", command: "G", security: "AMZN" }, phrase);
    }
    for (const step of plan.steps.filter(step => step.kind === "command")) {
      assert.equal(step.terminal_command, "AMZN EQ G", phrase);
    }
  }
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
  assert.equal(parseControlFollowup("switch the Meta institutional holders to bubbles"), null);
  const treemap = parseControlFollowup("show the holders window as a tree map").steps[0];
  assert.deepEqual(treemap.actions, [{ feature: "view", operation: "select", value: "Treemap" }]);
  assert.equal(parseControlFollowup("open Meta institutional holders as a bubble"), null);
  assert.equal(parseControlFollowup("uh show me micro soft institushunal holders in the bub bull view"), null);
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
  });
  assert.equal(hds, null);
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
  assert.equal(valuation, null);

  for (const voice of ["what is the p e multiple", "tell me the price to earnings multiple", "read EV over e bit duh"]) {
    const plan = parseControlFollowup(voice, { focused_panel: { command: "EM", security: "AMZN" } });
    assert.equal(plan, null, voice);
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
  assert.deepEqual(opened.steps.map(step => step.kind), ["control", "command"]);
  assert.equal(opened.steps[0].operation, "reset_workspace");
  assert.equal(opened.steps.at(-1).terminal_command, "META EQ EM");

  const maximized = parseControlFollowup(
    "close everything then open Meta earnings matrix and maximize it",
    context
  );
  assert.deepEqual(maximized.steps.map(step => step.kind), ["control", "command", "control"]);
  assert.equal(maximized.steps[0].operation, "reset_workspace");
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
