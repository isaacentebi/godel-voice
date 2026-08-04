import assert from "node:assert/strict";
import test from "node:test";

await import("../extension/layout.js");
const layout = globalThis.GodelVoiceLayout;
const viewport = { x: 0, y: 90, width: 1440, height: 800 };

test("browser layout plans explicit left and right windows", () => {
  const result = layout.plan({
    viewport,
    panels: [{ id: "hmap", placement: "left" }, { id: "em", placement: "right" }]
  });
  assert.equal(result.overflow.length, 0);
  assert.ok(result.placements[0].rect.x < result.placements[1].rect.x);
});

test("browser research preset creates a large primary panel", () => {
  const result = layout.plan({ viewport, preset: "research", panels: [{ id: "des" }, { id: "em" }, { id: "cf" }] });
  assert.equal(result.overflow.length, 0);
  assert.ok(result.placements[0].rect.width > result.placements[1].rect.width);
});
