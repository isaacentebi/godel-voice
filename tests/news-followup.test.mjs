import test from "node:test";
import assert from "node:assert/strict";
import { compileNewsFollowup, extractNewsQuery } from "../src/commands/news-followup.mjs";
import { parseControlFollowup } from "../src/control-followup.mjs";

test("extracts exact per-window News queries from natural and noisy speech", () => {
  assert.equal(extractNewsQuery("search the news for OpenAI antitrust"), "openai antitrust");
  assert.equal(extractNewsQuery("in the current news feed find stories mentioning chip export rules"), "chip export rules");
  assert.equal(extractNewsQuery("search news for fed cuts wait no search news for open eye anti trust"), "OpenAI antitrust");
});

test("does not reinterpret generic news-opening or account-filter language", () => {
  assert.equal(extractNewsQuery("open news for Amazon"), null);
  assert.equal(extractNewsQuery("exclude Reuters from my news sources"), null);
  assert.equal(extractNewsQuery("clear all global news filters"), null);
});

test("compiles one strict configure step for an existing News panel", () => {
  const plan = compileNewsFollowup({ mode: "command", command: "N", security: null }, "filter the news for AI safety testing");
  assert.equal(plan.steps[0].kind, "configure");
  assert.deepEqual(plan.steps[0].actions[0], { feature: "query", operation: "set", value: "ai safety testing" });
});

test("control followup routes exact News search before generic length guard", () => {
  const plan = parseControlFollowup("in the current news feed search for antitrust regulation involving artificial intelligence companies");
  assert.equal(plan.steps[0].target.command, "N");
  assert.equal(plan.steps[0].actions[0].value, "antitrust regulation involving artificial intelligence companies");
});
