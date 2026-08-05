import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

await import("../extension/cdp.js");
const cdp = globalThis.GodelVoiceCDP;

test("CDP clicks the center of a Godel control", () => {
  const commands = cdp.clickCommands({ x: 10, y: 20, width: 100, height: 40 });
  assert.equal(commands.length, 3);
  assert.deepEqual(commands[1][1], {
    type: "mousePressed", x: 60, y: 40, button: "left", buttons: 1, clickCount: 1
  });
});

test("CDP text replacement selects, clears and inserts without OS keystrokes", () => {
  const commands = cdp.replaceTextCommands({ x: 0, y: 0, width: 20, height: 20 }, "AAPL EQ GF");
  assert(commands.some(([method, params]) => method === "Input.dispatchKeyEvent" && params.commands?.includes("selectAll")));
  assert(commands.some(([method, params]) => method === "Input.insertText" && params.text === "AAPL EQ GF"));
});

test("CDP inserts into an empty nested Godel input without select-all", () => {
  const commands = cdp.insertTextCommands({ x: 10, y: 20, width: 100, height: 30 }, "META");
  assert.equal(commands.at(-1)[0], "Input.insertText");
  assert.deepEqual(commands.at(-1)[1], { text: "META" });
  assert.equal(commands.some(([method, params]) => method === "Input.dispatchKeyEvent" && params.commands?.includes("selectAll")), false);
});

test("CDP trusted typing emits physical key, character and key-up events for every character", () => {
  const commands = cdp.trustedReplaceAndSubmitCommands("META US");
  const chars = commands
    .filter(([method, params]) => method === "Input.dispatchKeyEvent" && params.type === "char")
    .map(([, params]) => params.text)
    .join("");
  assert.equal(chars, "META US");
  assert.equal(commands.at(-2)[1].key, "Enter");
  assert.equal(commands.at(-2)[1].type, "keyDown");
  assert.equal(commands.at(-1)[1].type, "keyUp");
  assert.equal(commands.some(([method]) => method === "Input.insertText"), false);
});

test("top-level Godel commands use trusted replacement instead of synthetic insertText", () => {
  const content = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
  assert.match(content, /cdp\("trustedReplaceAndSubmit"/);
  assert.match(content, /await trustedReplace\(currentInput, terminalCommand\)/);
  assert.doesNotMatch(content, /await replaceText\(currentInput, terminalCommand\)/);
});

test("CDP chart interval typing emits only trusted digit events", () => {
  const commands = cdp.trustedTypeCommands("60");
  assert.equal(commands.length, 6);
  assert.deepEqual(commands.filter(([, payload]) => payload.type === "char").map(([, payload]) => payload.text), ["6", "0"]);
});

test("G resolution adapter has per-value trusted input and exact popup/chart-label proof", () => {
  const content = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
  assert.match(content, /function gChartFrameContext/);
  assert.match(content, /popupCandidates\.length !== 1 \|\| chartCandidates\.length !== 1/);
  assert.match(content, /chartInterval !== popup\.interval/);
  for (const [resolution, input, label] of [
    ["1m", "1", "1 minute"], ["5m", "5", "5 minutes"], ["15m", "15", "15 minutes"],
    ["30m", "30", "30 minutes"], ["1h", "60", "1 hour"], ["1d", "1D", "1 day"]
  ]) {
    assert.match(content, new RegExp(`"${resolution}": Object\\.freeze\\(\\{ input: "${input}", label: "${label}" \\}\\)`));
  }
  assert.match(content, /await trustedType\(proof\.input\)/);
  assert.match(content, /current\?\.interval === resolution/);
  assert.match(content, /current\.chartLabel\.toLowerCase\(\)\.endsWith\(`, \$\{proof\.label\}`\)/);
  assert.match(content, /G resolution must be one of 1m, 5m, 15m, 30m, 1h, 1d/);
});

test("CDP exact input lookup safely embeds selectors and requires one editable element", () => {
  const expression = cdp.exactEditableExpression('[data-godel-voice-target="a\\"b"]');
  assert.match(expression, /querySelectorAll/);
  assert.match(expression, /matches\.length !== 1/);
  assert.match(expression, /HTMLInputElement/);
  assert.doesNotMatch(expression, /a"b\]\);/);
  assert.throws(() => cdp.exactEditableExpression(""), /non-empty selector/);
});

test("background supports coordinate-free trusted nested input delivery", () => {
  const background = fs.readFileSync(new URL("../extension/background.js", import.meta.url), "utf8");
  assert.match(background, /DOM\.requestNode/);
  assert.match(background, /DOM\.focus/);
  assert.match(background, /document\.activeElement === this/);
  assert.match(background, /trustedReplaceAndSubmit/);
  assert.match(background, /focusAndInsert/);
  assert.match(background, /Input\.insertText/);
});

test("Godel internal bridge is injected into the page main world", () => {
  const background = fs.readFileSync(new URL("../extension/background.js", import.meta.url), "utf8");
  const bridge = fs.readFileSync(new URL("../extension/main-world.js", import.meta.url), "utf8");
  const manifest = JSON.parse(fs.readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));
  assert(manifest.permissions.includes("scripting"));
  assert.match(background, /chrome\.scripting\.executeScript/);
  assert.match(background, /world:\s*"MAIN"/);
  assert.match(background, /files:\s*\["adapters\/imap\.js",\s*"main-world\.js"\]/);
  assert.equal(manifest.content_scripts.some(entry => entry.js.includes("main-world.js")), false);
  assert.match(bridge, /godel-voice:panel-action/);
  assert.match(bridge, /function registerAdapter/);
  assert.match(bridge, /registerAdapter\("GF"/);
  assert.match(bridge, /registerAdapter\("EM"/);
  assert.match(bridge, /registerAdapter\("MOST"/);
  assert.match(bridge, /registerAdapter\("LAYOUT"/);
  assert.match(bridge, /requireGodelModule\(17065\)/);
  assert.match(bridge, /updateWindowPosition/);
  assert.doesNotMatch(bridge, /eval\(|new Function/);
});

test("MOST uses the exact native result-count selector and proves row bounds", () => {
  const content = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
  const bridge = fs.readFileSync(new URL("../extension/main-world.js", import.meta.url), "utf8");
  assert.match(content, /MOST: \["MOST ACTIVE", "MOST"\]/);
  assert.match(content, /panelInternalAction\(panel, "MOST", "selectResultCount"/);
  assert.match(bridge, /function mostResultCountSelect/);
  assert.match(bridge, /new Set\(\["10", "25", "50", "100"\]\)/);
  assert.match(bridge, /rows\.length > 0 && rows\.length <= count/);
});

test("EM uses its exact native metric selector and verifies the selected option", () => {
  const content = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
  const bridge = fs.readFileSync(new URL("../extension/main-world.js", import.meta.url), "utf8");
  assert.match(content, /EM: \["EARNINGS MATRIX", "EM"\]/);
  assert.match(content, /EM: "EARNINGS_MATRIX"/);
  assert.match(content, /panelInternalAction\(panel, "EM", "selectMetric"/);
  assert.match(bridge, /function emMetricSelect/);
  assert.match(bridge, /root\.querySelectorAll\("select"\)/);
  assert.match(bridge, /selectedOptions/);
  assert.match(bridge, /reactProps\.onChange/);
  assert.doesNotMatch(bridge, /document\.querySelectorAll\("select"\)/);
});

test("GF P/E uses Godel's native metric controls without rewriting financial data", () => {
  const bridge = fs.readFileSync(new URL("../extension/main-world.js", import.meta.url), "utf8");
  assert.match(bridge, /pe: "P\/E"/);
  assert.match(bridge, /ps: "P\/S"/);
  assert.match(bridge, /pb: "P\/B"/);
  assert.match(bridge, /pcf: "P\/CF"/);
  assert.match(bridge, /Godel \$\{metricLabels\[metricKey\]\} has no data/);
  assert.doesNotMatch(bridge, /financial-metric-group|tv-advanced\/bars|window\.fetch\s*=/);
});

test("GF supports native multi-company revenue and margin comparisons", () => {
  const content = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
  const bridge = fs.readFileSync(new URL("../extension/main-world.js", import.meta.url), "utf8");
  for (const metric of ["REVENUE", "GROSS MARGIN", "OPERATING MARGIN", "NET MARGIN", "RETURN ON EQUITY"]) {
    assert.match(content, new RegExp(`"${metric}"`));
  }
  assert.match(bridge, /revenue: "Revenue"/);
  assert.match(bridge, /gross_margin: "Gross Margin"/);
  assert.match(bridge, /operating_margin: "Operating Margin"/);
  assert.match(bridge, /net_margin: "Net Margin"/);
  assert.match(bridge, /company series/);
  assert.match(bridge, /function semanticMetricControl/);
  assert.match(bridge, /\["BUTTON", "LABEL", "INPUT"\]/);
  assert.match(bridge, /Add series\(\?:\\s\|\$\)/);
  assert.match(bridge, /metricDialogFor\(element\)\)\?\.click\(\)/);
  assert.match(bridge, /metricDialogFor\(metric\) \?\? livePanelRoot\(\)/);
  assert.match(content, /function orderedGFActions/);
  assert.match(bridge, /remove \$\{symbol\} us \$\{label\}/);
  assert.match(bridge, /metricRendered\(metricLabel\)/);
  assert.match(bridge, /removeDefaultRevenue\(\)/);
});

test("GF period, layout, and currency use exact native controls with rendered postconditions", () => {
  const mainWorldSource = fs.readFileSync(new URL("../extension/main-world.js", import.meta.url), "utf8");
  const contentSource = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
  assert.match(mainWorldSource, /setGFChoice\(root, "Periodicity", \["Quarterly", "Annual"\]/);
  assert.match(mainWorldSource, /setGFChoice\(root, "Layout", \["Overlay", "Split"\]/);
  assert.match(mainWorldSource, /candidate\.title === title && Array\.isArray\(candidate\.options\)/);
  assert.match(mainWorldSource, /\^FY\\s\*'\?\\d\{2,4\}\$/);
  assert.match(mainWorldSource, /afterRender !== beforeRender/);
  assert.match(mainWorldSource, /action === "verifyRange"/);
  assert.match(mainWorldSource, /GF verified Range/);
  assert.match(mainWorldSource, /typeof props\?\.onClick !== "function"/);
  assert.match(mainWorldSource, /bg-\[\#222222\]/);
  assert.match(mainWorldSource, /document\.getElementById\(stableRootId\)/);
  assert.match(mainWorldSource, /const groupFor = \(\) => currentRoot\(\)\.querySelector/);
  assert.match(mainWorldSource, /const panelRoot = root/);
  assert.match(mainWorldSource, /setGFRange\(panelRoot/);
  assert.match(mainWorldSource, /const props = reactPropsFor\(button\)/);
  assert.match(mainWorldSource, /return current && active\(current\) \? current : null/);
  assert.match(mainWorldSource, /for \(let attempt = 1; attempt <= 5; attempt \+= 1\)/);
  assert.match(mainWorldSource, /GF panel can replace its first range-button fiber/);
  assert.doesNotMatch(mainWorldSource, /Date\.now\(\) - stableSince >= 900/);
  assert.match(mainWorldSource, /const liveScopedRoot = \(\) => scopedGFRoot/);
  assert.match(mainWorldSource, /loaded && addMetric/);
  assert.doesNotMatch(mainWorldSource, /company series did not stabilize/);
  assert.match(mainWorldSource, /selectedMatches && renderedUnit/);
  assert.match(contentSource, /"setRange"/);
  assert.match(contentSource, /"setPeriodicity"/);
  assert.match(contentSource, /"setLayout"/);
  assert.match(contentSource, /"setDisplayCurrency"/);
});

test("GF comparison removes replay sleeps and records each native nested action", () => {
  const mainWorldSource = fs.readFileSync(new URL("../extension/main-world.js", import.meta.url), "utf8");
  const contentSource = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
  const executeGFSource = contentSource.slice(contentSource.indexOf("async function measuredGFAction"),
    contentSource.indexOf("async function executeHMS"));
  assert.match(contentSource, /async function measuredGFAction/);
  assert.match(contentSource, /panelNestedActionTimings\.set\(panel, nestedActionTimings\)/);
  assert.match(contentSource, /nested_actions: panelNestedActionTimings\.get\(executedPanel\)/);
  assert.match(contentSource, /error\.godelVoiceTiming = \{ phases, nested_actions: nestedActionTimings \}/);
  assert.match(contentSource, /error\.godelVoiceTiming\?\.nested_actions/);
  assert.match(contentSource, /return \[\.\.\.controls, \.\.\.companies, \.\.\.metrics\]/);
  assert.doesNotMatch(contentSource, /return \[\.\.\.controls, \.\.\.metrics, \.\.\.companies, \.\.\.metrics\]/);
  assert.doesNotMatch(executeGFSource, /await pause\(250\)/);
  assert.match(mainWorldSource, /GF stale metric builder closed/);
  assert.doesNotMatch(mainWorldSource, /setTimeout\(resolve, 180\)/);
});

test("GF contextual metrics use companies loaded in the native series rail", () => {
  const content = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
  assert.match(content, /\^Add metric for \(\[A-Z0-9\.\/\-\]\{1,16\}\)\$/);
  assert.match(content, /!\["CONTEXT", "GF"\]\.includes\(terminalCompany\)/);
  assert.match(content, /Godel GF loaded companies are unavailable/);
});

test("HALT adapter is panel-scoped, idempotent and asserts selected state", () => {
  const content = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
  assert.match(content, /HALT: \["MARKET HALTS", "HALT"\]/);
  assert.match(content, /panel\.querySelectorAll\("\[role='tab'\],button"\)/);
  assert.match(content, /candidates\.length === 1/);
  assert.match(content, /panel\.querySelectorAll\("table tr, \[role='row'\]"\)/);
  assert.match(content, /if \(haltTabMatchesData\(panel, canonical\)\) return/);
  assert.doesNotMatch(content, /haltTabSelected\(tab\) \|\| haltTabMatchesData/);
  assert.match(content, /HALT \$\{canonical\} selected/);
  assert.doesNotMatch(content, /document\.querySelectorAll\("\[role='tab'\],button"\)/);
});

test("HMAP universe/view adapter is panel-scoped, enum-only, idempotent and verifies rendered state", () => {
  const content = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
  assert.match(content, /HMAP: \["MARKET HEATMAP", "HMAP"\]/);
  assert.match(content, /const scope = nativeWindowRoot\(panel\) \?\? panel/);
  assert.match(content, /scope\.querySelectorAll\("button,\[role='tab'\]"\)/);
  assert.match(content, /candidates\.length === 1/);
  assert.match(content, /scope\.querySelectorAll\("table,\[role='table'\],\[role='grid'\]"\)/);
  assert.match(content, /scope\.querySelectorAll\("canvas,svg,\[class\*='heatmap' i\],\[class\*='treemap' i\]"\)/);
  assert.match(content, /if \(hmapViewMatches\(panel, canonical\)\) return/);
  assert.match(content, /HMAP authoritative member count/);
  assert.ok(content.indexOf("HMAP authoritative member count") < content.indexOf("if (hmapUniverseMatches(panel, canonical)) return"));
  assert.match(content, /if \(hmapUniverseMatches\(panel, canonical\)\) return/);
  assert.match(content, /count === 30/);
  assert.match(content, /count >= 500 && count <= 505/);
  assert.match(content, /after\.count !== before\.count/);
  assert.match(content, /authoritative changed member count and changed tile signature when available/);
  assert.match(content, /HMAP \$\{canonical\} view/);
  assert.doesNotMatch(content, /document\.querySelectorAll\("button,\[role='tab'\]"\)/);
});

test("HDS adapter proves mutually exclusive Table Treemap and Bubble rendering", () => {
  const content = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
  const bridge = fs.readFileSync(new URL("../extension/main-world.js", import.meta.url), "utf8");
  assert.match(content, /HDS: \["HOLDERS", "HDS"\]/);
  assert.match(content, /panelInternalAction\(panel, "HDS", "selectView"/);
  assert.match(bridge, /registerAdapter\("HDS", \{ expandRoot: expandHDSRoot, run: runHDS \}\)/);
  assert.match(bridge, /function expandHDSRoot\(root\)/);
  assert.match(bridge, /visibleCount !== 1/);
  assert.match(bridge, /table_visible: table/);
  assert.match(bridge, /treemap_visible: treemap/);
  assert.match(bridge, /bubble_visible: bubble/);
  assert.match(bridge, /circles\.length >= 5/);
  assert.match(content, /function detachedUniqueHDSPanel/);
  assert.match(content, /nearby\[1\]\.distance - nearby\[0\]\.distance < 80/);
  assert.match(content, /distance <= 360/);
});

test("EM adapter identifies valuation tables by exact schema without requiring a decorative heading", () => {
  const bridge = fs.readFileSync(new URL("../extension/main-world.js", import.meta.url), "utf8");
  assert.match(bridge, /headers\[0\] !== "Last 4Q" \|\| headers\[1\] !== "Next 4Q"/);
  assert.match(bridge, /Expected one Godel EM \$\{rowLabel\} Multiples row/);
  assert.doesNotMatch(bridge, /Godel EM Multiples heading is missing/);
  assert.match(bridge, /registerAdapter\("EM", \{ expandRoot: expandEMRoot, run: runEM \}\)/);
});

test("News query adapter is exact, panel-scoped and render-verified", () => {
  const content = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
  const bridge = fs.readFileSync(new URL("../extension/main-world.js", import.meta.url), "utf8");
  assert.match(content, /panelInternalAction\(panel, "N", "setQuery"/);
  assert.match(bridge, /function newsQueryInput/);
  assert.match(bridge, /"search exact term"/);
  assert.match(bridge, /\["headline", "date", "time", "ticker", "source"\]/);
  assert.match(bridge, /newsQueryClearAffordance/);
  assert.match(bridge, /KeyboardEvent\("keydown", \{ key: "Enter"/);
  assert.match(bridge, /registerAdapter\("N", \{ run: runNews \}\)/);
  assert.doesNotMatch(bridge, /document\.querySelectorAll\([^\n]*search exact term/);
});

test("EQS Run and Clear are exact, panel-scoped and render-verified", () => {
  const content = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
  assert.match(content, /function executeEQS/);
  assert.match(content, /exactText\(panel, label, "button,\[role='button'\]"\)/);
  assert.match(content, /eqsFilterControls\(panel\)\.length === 0/);
  assert.match(content, /panelMutated && eqsResultsReady\(panel\)/);
  assert.doesNotMatch(content, /document\.querySelectorAll\("table,\[role='table'\],\[role='grid'\]"\)/);
});

test("EQS range editor uses exact live labels and min/max input postconditions", () => {
  const content = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
  for (const label of ["P/E (Fwd)", "P/E (TTM)", "P/S (Fwd)", "P/B (Fwd)", "P/CF (Fwd)", "Net Inc. (Fwd 12mo, USD)"]) {
    assert.match(content, new RegExp(label.replace(/[()/.]/g, "\\$&")));
  }
  assert.match(content, /\["min", "minimum"\]\.includes/);
  assert.match(content, /\["max", "maximum"\]\.includes/);
  assert.match(content, /minimum > maximum/);
  assert.match(content, /String\(current\.minimum\.value/);
  assert.match(content, /String\(current\.maximum\.value/);
});

test("grounded ERN narration reads the exact forward P/E table column", () => {
  const content = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
  assert.match(content, /groundedPanelText/);
  assert.match(content, /columnheader/);
  assert.match(content, /multipleIndex/);
  assert.match(content, /cells\[multipleIndex\]/);
  assert.match(content, /\[x×\]/);
  assert.doesNotMatch(content, /innerHTML/);
});

test("grounded EM narration requires the exact requested row, labelled horizons, and semantic units", () => {
  const content = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
  assert.match(content, /command === "EM"/);
  assert.match(content, /if \(!requestedRow \|\| !semanticUnit\) return "";/,
    "plain EM opens must not narrate an unrequested valuation row");
  assert.match(content, /headers\[0\] !== "Last 4Q" \|\| headers\[1\] !== "Next 4Q"/);
  assert.match(content, /cells\[0\] !== rowLabel/);
  assert.match(content, /const unit = semanticUnit;/);
  assert.match(content, /unit === "Percent"/);
  assert.match(content, /\[x×\]/);
  assert.match(content, /EM Multiples \$\{rowLabel\} \$\{unit\}/);
  assert.match(content, /const grounded = \[\]/);
  assert.match(content, /grounded\.push\(\{ step, panel \}\)/);
  assert.match(content, /completionMessage\(workflow, result\.grounded, result\.timings\)/);
});

test("main-world EM valuation reader enforces the allowlisted row, Multiples section, and row-correct unit", () => {
  const bridge = fs.readFileSync(new URL("../extension/main-world.js", import.meta.url), "utf8");
  assert.match(bridge, /allowedRows = new Set\(\["P\/E"/);
  assert.match(bridge, /payload\.section !== "Multiples"/);
  assert.match(bridge, /rowLabel === "Dividend Yield" \? "Percent" : "Multiple"/);
  assert.match(bridge, /headers\[0\] !== "Last 4Q" \|\| headers\[1\] !== "Next 4Q"/);
  assert.match(bridge, /semanticUnit === "Multiple"/);
});

test("VoiceInk delivery contains no AppleScript or System Events automation", () => {
  const script = fs.readFileSync(new URL("../bin/voiceink-deliver", import.meta.url), "utf8");
  assert.doesNotMatch(script, /osascript|System Events|keystroke|key code/i);
  assert.match(script, /127\.0\.0\.1:17841/);
  assert.match(script, /if \[\[ -z "\$workflow_id" \]\]/);
  assert.match(script, /could not confirm that the workflow was queued/);
});
