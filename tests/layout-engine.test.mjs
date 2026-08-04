import assert from "node:assert/strict";
import test from "node:test";
import { layoutPresets, layoutZones, planPanelLayout } from "../src/layout-engine.mjs";

const viewport = { x: 0, y: 90, width: 1440, height: 810 };

test("publishes every supported preset and spoken placement zone", () => {
  assert.deepEqual(layoutPresets, ["research", "market", "comparison", "options", "grid", "focus"]);
  assert.ok(layoutZones.includes("top-right"));
});

test("research gives the first panel a large primary area", () => {
  const result = planPanelLayout({
    viewport, preset: "research",
    newPanels: [{ id: "gf" }, { id: "em" }, { id: "news" }]
  });
  assert.equal(result.overflow.length, 0);
  assert.equal(result.placements.length, 3);
  const [primary, second, third] = result.placements.map(item => item.rect);
  assert.ok(primary.width > second.width);
  assert.equal(second.x, third.x);
  assert.ok(second.y < third.y);
});

test("comparison uses equal columns when the viewport can fit them", () => {
  const result = planPanelLayout({
    viewport, preset: "comparison",
    newPanels: [{ id: "a" }, { id: "b" }, { id: "c" }]
  });
  assert.equal(result.overflow.length, 0);
  assert.equal(Math.round(result.placements[0].rect.width), Math.round(result.placements[2].rect.width));
  assert.ok(result.placements[0].rect.x < result.placements[1].rect.x);
});

test("explicit left and right placement is deterministic", () => {
  const result = planPanelLayout({
    viewport,
    newPanels: [{ id: "heatmap", placement: "left" }, { id: "earnings", placement: "right" }]
  });
  assert.equal(result.overflow.length, 0);
  const left = result.placements.find(item => item.id === "heatmap").rect;
  const right = result.placements.find(item => item.id === "earnings").rect;
  assert.ok(left.x < right.x);
  assert.equal(Math.round(left.width), Math.round(right.width));
});

test("preserves existing panels and recommends a new screen when no room remains", () => {
  const result = planPanelLayout({
    viewport,
    existingPanels: [{ id: "old", rect: { x: 0, y: 90, width: 1440, height: 810 } }],
    newPanels: [{ id: "new" }]
  });
  assert.deepEqual(result.preserved, ["old"]);
  assert.deepEqual(result.overflow, ["new"]);
  assert.equal(result.recommendNewScreen, true);
});

test("focus keeps one panel and reports additional panels as overflow", () => {
  const result = planPanelLayout({
    viewport, preset: "focus",
    newPanels: [{ id: "main" }, { id: "extra" }]
  });
  assert.deepEqual(result.placements.map(item => item.id), ["main"]);
  assert.deepEqual(result.overflow, ["extra"]);
});

test("rejects unknown presets and zones", () => {
  assert.throws(() => planPanelLayout({ viewport, preset: "mess" }), /Unknown layout preset/);
  assert.throws(() => planPanelLayout({ viewport, newPanels: [{ id: "x", placement: "somewhere" }] }), /Unknown layout zone/);
});
