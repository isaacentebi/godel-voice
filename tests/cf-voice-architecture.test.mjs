import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { CF_FEATURES, CF_FILING_TYPES, CF_RENDERERS, CF_SCOPES, normalizeCFAction } from "../src/cf-actions.mjs";
import { compileCFFollowup } from "../src/cf-followup.mjs";
import { validateWorkflowPlan } from "../src/workflow-plan.mjs";

const target = { mode: "command", command: "CF", security: null };
const selected = { row_id: "row-17", accession_number: "0001326801-26-000044", ticker: "META", form: "10-Q", filed_date: "2026-07-30", company: "Meta Platforms Inc" };

test("CF publishes only the exact audited scopes, forms, renderers and action families", () => {
  assert.deepEqual(CF_SCOPES, ["Global", "Security", "Watchlist"]);
  assert.deepEqual(CF_FILING_TYPES, ["10-K", "10-Q", "8-K", "Proxy", "13F", "S-1"]);
  assert.deepEqual(CF_RENDERERS, ["Godel", "EDGAR"]);
  assert.deepEqual(CF_FEATURES, ["feed", "filing"]);
});

test("noisy company and form speech compiles a security-scoped Godel feed", () => {
  const draft = compileCFFollowup({ command: "CF", target }, "show me face book ten cue and eight kay filings inside godel");
  assert.equal(draft.actions[0].value.scope, "Security");
  assert.equal(draft.actions[0].value.security.ticker, "META");
  assert.deepEqual(draft.actions[0].value.filing_types, ["10-Q", "8-K"]);
  assert.equal(draft.actions[0].value.render, "Godel");
  assert.equal(draft.blockers.length, 0);
  assert.equal(draft.ready_for_live_executor, false);
});

test("global and watchlist scopes preserve exact type ordering", () => {
  const global = compileCFFollowup("CF", "all filings thirteen eff proxy and ess one inside godel");
  assert.equal(global.actions[0].value.scope, "Global");
  assert.deepEqual(global.actions[0].value.filing_types, ["Proxy", "13F", "S-1"]);
  const watchlist = compileCFFollowup("CF", "ten kay filings for my core holdings watch list in godel");
  assert.equal(watchlist.actions[0].value.scope, "Watchlist");
  assert.equal(watchlist.actions[0].value.watchlist, "Core Holdings");
});

test("corrections replace the superseded form while uncorrected render and scope conflicts fail closed", () => {
  assert.deepEqual(compileCFFollowup("CF", "Meta ten kay no sorry ten cue filings").actions[0].value.filing_types, ["10-Q"]);
  const render = compileCFFollowup("CF", "Meta ten Q in Godel and EDGAR");
  assert.match(render.blockers.join(" "), /Conflicting CF render/);
  assert.equal(render.configure_step_draft, null);
  assert.match(compileCFFollowup("CF", "all filings for Meta").blockers.join(" "), /Conflicting CF scopes/);
});

test("context preserves omitted scope, target, filing types and renderer", () => {
  const context = { command: "CF", target, current_config: { scope: "Watchlist", watchlist: "Core", filing_types: ["10-K", "10-Q"], render: "Godel" } };
  const draft = compileCFFollowup(context, "show filings");
  assert.deepEqual(draft.actions[0].value, { scope: "Watchlist", security: null, watchlist: "Core", filing_types: ["10-K", "10-Q"], render: "Godel", explicit_external: false });
  assert.deepEqual(draft.target, target);
});

test("EDGAR rendering requires explicit external navigation language", () => {
  const action = compileCFFollowup("CF", "show Nvidia ten K filings on EDGAR").actions[0];
  assert.equal(action.value.render, "EDGAR");
  assert.equal(action.value.explicit_external, true);
  assert.throws(() => normalizeCFAction({ ...action, value: { ...action.value, explicit_external: false } }), /explicit external-navigation/);
});

test("exact selected rows may open internally or externally, never approximate speech rows", () => {
  const internal = compileCFFollowup({ command: "CF", selected_filing: selected }, "open this filing inside Godel");
  assert.equal(internal.actions[0].feature, "filing");
  assert.equal(internal.actions[0].value.identity.accession_number, selected.accession_number);
  const external = compileCFFollowup({ command: "CF", selected_filing: selected }, "open this filing on EDGAR");
  assert.equal(external.external_navigation_requested, true);
  assert.equal(external.actions[0].value.destination, "EDGAR");
  const approximate = compileCFFollowup("CF", "open Meta's ten Q filing in Godel");
  assert.match(approximate.blockers.join(" "), /authoritative selected filing/);
  assert.equal(approximate.configure_step_draft, null);
});

test("exact identity rejects incomplete or synthetic row claims", () => {
  const action = { feature: "filing", operation: "open", value: { identity: { ...selected, row_id: null, accession_number: null }, destination: "Godel", explicit_external: false } };
  assert.throws(() => normalizeCFAction(action), /row_id or accession_number/);
});

test("vague downloads, exports, paging, date filters and search are explicit blockers", () => {
  for (const speech of ["download this filing", "export the filing", "next page", "filings filed after 2025", "search within filings for AI"]) {
    const draft = compileCFFollowup("CF", speech);
    assert.ok(draft.blockers.length, speech);
    assert.equal(draft.configure_step_draft, null);
  }
  assert.match(compileCFFollowup("CF", "download this filing").blockers.join(" "), /does not document file export or download/);
});

test("compound requests are atomic: one unsupported clause nulls the whole step", () => {
  const draft = compileCFFollowup("CF", "show Meta ten K and ten Q filings in Godel then download the filing");
  assert.equal(draft.actions.length, 1);
  assert.ok(draft.blockers.length);
  assert.equal(draft.configure_step_draft, null);
});

test("workflow recognizes both strict CF shapes but keeps runtime disabled", () => {
  const actions = [
    compileCFFollowup("CF", "show Meta ten Q filings in Godel").actions[0],
    compileCFFollowup({ command: "CF", selected_filing: selected }, "open this in Godel").actions[0]
  ];
  for (const action of actions) assert.throws(() => validateWorkflowPlan({ version: 2, failure_policy: "stop_on_any", layout: null, steps: [{ id: "cf-1", kind: "configure", target, actions: [action], required: true }] }), /schema-valid but not live-enabled/);
});

test("dedicated schema records the strict safety and unsupported-control boundary", () => {
  const schema = JSON.parse(fs.readFileSync(new URL("../data/contracts/cf-nested.schema.json", import.meta.url), "utf8"));
  assert.equal(schema["x-runtime-enabled"], false);
  assert.deepEqual(schema["x-unsupported"], ["paging", "date filtering", "search", "download", "export"]);
  assert.match(JSON.stringify(schema), /exact filing identity/);
});
