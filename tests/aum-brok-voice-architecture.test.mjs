import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  AUM_TABS, compileAUMVoice, compileBROKVoice, compileAUMBROKVoice,
  normalizeAUMGroundedTotal, normalizeBROKGroundedStatus
} from "../src/aum-brok-followup.mjs";

const personalTotal = { tab: "Personal", total: 125000.5, currency: "USD", as_of: "2026-08-04T12:00:00-06:00", observed: true, source: "Godel AUM panel" };
const connection = { id: "conn-1", brokerage: "Interactive Brokers", account_label: "Individual …1234", connected: true, status: "Connected", observed: true };
const status = { observed: true, source: "Godel BROK panel", as_of: "2026-08-04T12:00:00-06:00", connections: [connection] };

test("AUM publishes only exact documented tabs", () => assert.deepEqual(AUM_TABS, ["Global", "Personal"]));

test("AUM noisy personal tab and refresh compile without disclosure", () => {
  const result = compileAUMVoice({ current_state: { panel_size: "large" } }, "show my brockerage a u m personal tab and refreshh");
  assert.deepEqual(result.actions, [
    { feature: "tab", operation: "select", value: "Personal", scope: "panel" },
    { feature: "refresh", operation: "refresh", value: null, scope: "panel" }
  ]);
  assert.equal(result.grounded_narration, null);
  assert.deepEqual(result.desired_state, { panel_size: "large", tab: "Personal" });
  assert.equal(result.ready_for_live_executor, false);
});

test("AUM never speaks an amount unless explicitly asked", () => {
  for (const speech of ["show personal aum", "open my connected brokerage account value", "refresh my aum"]) {
    const result = compileAUMVoice({ current_tab: "Personal", grounded_total: personalTotal }, speech);
    assert.equal(result.grounded_narration, null);
  }
  const explicit = compileAUMVoice({ current_tab: "Personal", grounded_total: personalTotal }, "tell me my aum total");
  assert.equal(explicit.ready_for_grounded_narration, true);
  assert.deepEqual(explicit.grounded_narration, { tab: "Personal", total: 125000.5, currency: "USD", as_of: personalTotal.as_of, source: "Godel AUM panel" });
});

test("AUM rejects wrong-tab, stale-shaped, and ungrounded totals", () => {
  const wrongTab = compileAUMVoice({ current_tab: "Global", grounded_total: personalTotal }, "what is the global aum total");
  assert.equal(wrongTab.kind, "clarify");
  assert.equal(wrongTab.grounded_narration, null);
  for (const grounded_total of [undefined, { ...personalTotal, observed: false }, { ...personalTotal, total: Infinity }, { ...personalTotal, token: "secret" }]) {
    const result = compileAUMVoice({ current_tab: "Personal", grounded_total }, "how much is my aum");
    assert.equal(result.ready_for_grounded_narration, false);
  }
});

test("AUM refresh plus amount cannot narrate pre-refresh facts", () => {
  const result = compileAUMVoice({ current_tab: "Personal", grounded_total: personalTotal }, "refresh and tell me my aum total");
  assert.equal(result.kind, "clarify");
  assert.equal(result.grounded_narration, null);
  assert.equal(result.configure_step_draft, null);
});

test("AUM corrections win and direct contradictions fail atomically", () => {
  assert.equal(compileAUMVoice({}, "global tab no sorry personal tab").actions[0].value, "Personal");
  const tabs = compileAUMVoice({}, "show global and personal tabs");
  assert.equal(tabs.kind, "clarify");
  assert.deepEqual(tabs.actions, []);
  const privacy = compileAUMVoice({ current_tab: "Personal", grounded_total: personalTotal }, "tell me my aum but don't say the amount");
  assert.equal(privacy.kind, "clarify");
  assert.equal(privacy.grounded_narration, null);
});

test("AUM fact normalizer rejects unknown private fields", () => {
  assert.throws(() => normalizeAUMGroundedTotal({ ...personalTotal, account_number: "1234" }), /unapproved or sensitive/);
});

test("BROK opens only a read-only manager", () => {
  const result = compileBROKVoice({}, "open the read only broker age connection manager");
  assert.deepEqual(result.actions, [{ feature: "manager", operation: "open", value: "read-only", scope: "panel" }]);
  assert.equal(result.ready_for_live_executor, false);
  assert.equal(result.no_secret_logging, true);
});

test("BROK reads only grounded connection status when explicitly asked", () => {
  const result = compileBROKVoice({ grounded_status: status }, "tell me the brokerage connection status");
  assert.equal(result.ready_for_grounded_narration, true);
  assert.equal(result.grounded_narration.connections[0].status, "Connected");
  assert.equal("balance" in result.grounded_narration.connections[0], false);
});

test("BROK selected status binds one exact live row", () => {
  const ok = compileBROKVoice({ grounded_status: status, selected_connection: connection }, "is this account connected");
  assert.equal(ok.grounded_narration.connections.length, 1);
  const bad = compileBROKVoice({ grounded_status: status }, "is this account connected");
  assert.equal(bad.kind, "clarify");
  assert.equal(bad.grounded_narration, null);
});

test("BROK connection mutations are confirmation-only and sanitized", () => {
  for (const operation of ["connect", "disconnect", "reconnect"]) {
    const result = compileBROKVoice({ selected_connection: connection }, `${operation} this brokerage`);
    assert.equal(result.kind, "confirmation-required");
    assert.deepEqual(result.actions, []);
    assert.equal(result.proposed_action.operation, operation);
    assert.deepEqual(result.proposed_action.value, { id: "conn-1", brokerage: "Interactive Brokers" });
    assert.equal(result.required_confirmation, true);
    assert.equal(result.unsupported_unattended, true);
  }
});

test("BROK missing mutation identity and conflicting mutations fail closed", () => {
  assert.equal(compileBROKVoice({}, "disconnect this brokerage").kind, "clarify");
  const conflict = compileBROKVoice({ selected_connection: connection }, "connect and disconnect this brokerage");
  assert.equal(conflict.kind, "clarify");
  assert.deepEqual(conflict.actions, []);
});

test("BROK blocks secrets without echoing them", () => {
  const secret = "sk-sensitive-value-123";
  const result = compileBROKVoice({}, `use api key ${secret} and token abc to connect`);
  assert.equal(result.kind, "blocked");
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(result.no_secret_logging, true);
});

test("BROK blocks orders money movement and balance reads", () => {
  for (const speech of ["buy Meta in this account", "transfer one thousand dollars", "show my buying power", "change the balance"]) {
    const result = compileBROKVoice({}, speech);
    assert.equal(result.kind, "blocked");
    assert.deepEqual(result.actions, []);
  }
});

test("BROK correction discards a superseded dangerous intent", () => {
  const result = compileBROKVoice({ grounded_status: status }, "disconnect this account wait no tell me the connection status");
  assert.equal(result.kind, "candidate");
  assert.equal(result.required_confirmation, undefined);
  assert.equal(result.ready_for_grounded_narration, true);
});

test("BROK grounded status rejects secrets and invented rows", () => {
  assert.throws(() => normalizeBROKGroundedStatus({ ...status, connections: [{ ...connection, token: "x" }] }), /invalid or unapproved/);
  assert.throws(() => normalizeBROKGroundedStatus({ ...status, source: "model" }), /exact live panel facts/);
});

test("schema records disabled runtime and strict privacy policy", () => {
  const schema = JSON.parse(fs.readFileSync(new URL("../data/contracts/aum-brok-nested.schema.json", import.meta.url), "utf8"));
  assert.equal(schema["x-runtime-enabled"], false);
  assert.match(schema["x-privacy"].credentials, /never/);
  assert.equal(schema.oneOf.length, 3);
});

test("dispatcher routes only explicit AUM and BROK contexts", () => {
  assert.equal(compileAUMBROKVoice({ command: "AUM" }, "personal tab").command, "AUM");
  assert.equal(compileAUMBROKVoice({ command: "BROK" }, "open brokerage manager").command, "BROK");
  assert.equal(compileAUMBROKVoice({ command: "PORT" }, "show balance"), null);
});

test("compiler source contains no logging sink", () => {
  const source = fs.readFileSync(new URL("../src/aum-brok-followup.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /console\.|logger\.|\.log\s*\(/);
});
