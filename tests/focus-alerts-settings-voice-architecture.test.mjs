import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { FOCUS_FIELDS, PDF_PREFERENCES, compileALVoice, compileFOCUSVoice, compilePDFSettingsVoice, compileFocusAlertsSettingsVoice, normalizeFOCUSFacts, normalizeALGroundedFacts } from "../src/focus-alerts-settings-followup.mjs";

const security = { ticker:"META", venue:"US", asset_class:"EQ" };
const focusFacts = { observed:true, source:"Godel FOCUS panel", security, last:590.2, change:12.4, change_percent:2.15, bid:590.1, ask:590.3, volume:1234567, day_low:570, day_high:595, currency:"USD", as_of:"2026-08-04T12:00:00-06:00" };
const alert = { id:"alert-1", security, condition:"above 600 USD", enabled:true, triggered:false, observed:true };
const alertFacts = { observed:true, source:"Godel AL panel", as_of:"2026-08-04T12:00:00-06:00", alerts:[alert] };

test("publishes closed FOCUS fields and PDF preference keys", () => {
  assert.deepEqual(FOCUS_FIELDS, ["last","change","change_percent","bid","ask","volume","day_range"]);
  assert.equal(PDF_PREFERENCES.length, 14);
});

test("FOCUS noisy flashing and explicit native popout compose", () => {
  const result = compileFOCUSVoice({ security }, "stop the price flesh and pop out this focus into a native window");
  assert.deepEqual(result.actions.map(x => x.feature), ["price flashing","native popout"]);
  assert.equal(result.actions[0].value, "off");
  assert.deepEqual(result.actions[1].value.security, security);
  assert.equal(result.ready_for_live_executor, false);
});

test("FOCUS requires exact security and flashing contradictions fail closed", () => {
  assert.equal(compileFOCUSVoice({}, "turn off price flashing").kind, "clarify");
  const result = compileFOCUSVoice({ security }, "turn on and turn off price flashing");
  assert.equal(result.kind, "clarify");
  assert.deepEqual(result.actions, []);
});

test("FOCUS reads only requested exact grounded quote fields", () => {
  const result = compileFOCUSVoice({ security, grounded_facts:focusFacts }, "tell me the last price bid ask volume and day range");
  assert.equal(result.ready_for_grounded_narration, true);
  assert.deepEqual(result.grounded_narration.fields, ["last","bid","ask","volume","day_range"]);
  assert.equal(result.grounded_narration.facts.last, 590.2);
});

test("FOCUS rejects mismatched missing and corrupt facts", () => {
  const other = { ticker:"MSFT", venue:"US", asset_class:"EQ" };
  for (const grounded_facts of [undefined, { ...focusFacts, security:other }, { ...focusFacts, day_high:500 }, { ...focusFacts, last:Infinity }]) {
    const result = compileFOCUSVoice({ security, grounded_facts }, "what is the price and day range");
    assert.equal(result.ready_for_grounded_narration, false);
  }
  assert.throws(() => normalizeFOCUSFacts({ ...focusFacts, source:"model" }), /exact observed/);
});

test("AL opens and reads existing alerts without mutation", () => {
  const open = compileALVoice({}, "show my existing allerts don't create one yet");
  assert.deepEqual(open.actions, [{ feature:"alert list", operation:"open", value:"existing", scope:"panel" }]);
  const read = compileALVoice({ grounded_facts:alertFacts }, "tell me my alert status");
  assert.equal(read.ready_for_grounded_narration, true);
  assert.equal(read.grounded_narration.alerts[0].id, "alert-1");
});

test("AL create is exact confirmation-only", () => {
  const result = compileALVoice({ security }, "create a price alert above 600");
  assert.equal(result.kind, "confirmation-required");
  assert.deepEqual(result.actions, []);
  assert.deepEqual(result.proposed_action.value, { security, relation:"above", price:600 });
  assert.equal(result.unsupported_unattended, true);
});

test("AL selected mutations are confirmation-only", () => {
  for (const operation of ["edit","delete","enable","disable"]) {
    const result = compileALVoice({ selected_alert:alert }, `${operation} this alert`);
    assert.equal(result.kind, "confirmation-required");
    assert.equal(result.proposed_action.operation, operation);
    assert.deepEqual(result.actions, []);
  }
});

test("AL missing identity and mutation contradictions are atomic", () => {
  assert.equal(compileALVoice({}, "delete this alert").kind, "clarify");
  const conflict = compileALVoice({ selected_alert:alert }, "enable and disable this alert");
  assert.equal(conflict.kind, "clarify");
  assert.equal(conflict.proposed_action, undefined);
});

test("AL correction discards superseded mutation", () => {
  const result = compileALVoice({ selected_alert:alert }, "delete this alert wait no disable this alert");
  assert.equal(result.proposed_action.operation, "disable");
});

test("AL facts reject invented or malformed rows", () => {
  assert.throws(() => normalizeALGroundedFacts({ ...alertFacts, source:"model" }), /exact observed/);
  assert.throws(() => normalizeALGroundedFacts({ ...alertFacts, alerts:[{ ...alert, observed:false }] }), /exact observed/);
});

test("PDF opens settings read-only and rejects file-PDF confusion", () => {
  assert.deepEqual(compilePDFSettingsVoice({}, "open terminal settings dont change anything").actions[0], { feature:"settings", operation:"open", value:"read-only", scope:"panel" });
  assert.equal(compilePDFSettingsVoice({}, "download this article as a PDF").kind, "blocked");
});

test("PDF boolean preferences are persistent confirmation proposals", () => {
  const result = compilePDFSettingsVoice({ current_state:{ theme:"Dark" } }, "enable grid snacking and disable table animation");
  assert.equal(result.kind, "confirmation-required");
  assert.deepEqual(result.actions, []);
  assert.deepEqual(result.proposed_actions.map(x => x.value), [
    { key:"table_animation", value:false }, { key:"grid_snapping", value:true }
  ]);
  assert.equal(result.required_confirmation, "persistent-settings-change");
});

test("PDF dynamic values must exactly match current live options", () => {
  const context = { live_options:{ theme:["Dark","Light"], font:["JetBrains Mono","Geist Mono"] } };
  const result = compilePDFSettingsVoice(context, "set theme to dark and set font to geist mono");
  assert.equal(result.kind, "confirmation-required");
  assert.deepEqual(result.proposed_actions.map(x => x.value), [{ key:"theme", value:"Dark" }, { key:"font", value:"Geist Mono" }]);
  assert.equal(compilePDFSettingsVoice(context, "set theme to purple").kind, "clarify");
});

test("PDF external-link trust has a separate confirmation class", () => {
  const result = compilePDFSettingsVoice({}, "trust external link trust");
  assert.equal(result.required_confirmation, "explicit-trust-change");
  assert.deepEqual(result.actions, []);
  assert.equal(result.proposed_actions[0].value.key, "external_link_trust");
});

test("PDF contradictions vague pinning and relative zoom fail closed", () => {
  assert.equal(compilePDFSettingsVoice({}, "enable and disable breaking news").kind, "clarify");
  assert.equal(compilePDFSettingsVoice({}, "pin earnings").kind, "clarify");
  assert.equal(compilePDFSettingsVoice({}, "increase terminal zoom").kind, "clarify");
});

test("PDF corrections remove superseded settings", () => {
  const result = compilePDFSettingsVoice({}, "enable grid snapping no sorry disable grid snapping");
  assert.deepEqual(result.proposed_actions[0].value, { key:"grid_snapping", value:false });
});

test("schema and dispatcher preserve runtime boundary", () => {
  const schema = JSON.parse(fs.readFileSync(new URL("../data/focus-alerts-settings-nested.schema.json", import.meta.url)));
  assert.equal(schema["x-runtime-enabled"], false);
  assert.equal(schema.oneOf.length, 5);
  assert.equal(compileFocusAlertsSettingsVoice({ command:"FOCUS", security }, "turn off price flashing").command, "FOCUS");
  assert.equal(compileFocusAlertsSettingsVoice({ command:"AL" }, "show alerts").command, "AL");
  assert.equal(compileFocusAlertsSettingsVoice({ command:"PDF" }, "open settings").command, "PDF");
  assert.equal(compileFocusAlertsSettingsVoice({ command:"N" }, "save PDF"), null);
});
