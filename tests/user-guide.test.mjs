import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const guide = fs.readFileSync(new URL("../docs/user-guide.md", import.meta.url), "utf8");
const registry = JSON.parse(fs.readFileSync(new URL("../data/commands.json", import.meta.url), "utf8"));

test("user guide lists every canonical command exactly once", () => {
  const listed = [...guide.matchAll(/\| `([A-Z]+)` \|/g)].map(match => match[1]);
  assert.equal(listed.length, registry.commands.length);
  for (const { code } of registry.commands) {
    assert.equal(listed.filter(value => value === code).length, 1, `${code} guide coverage`);
  }
});

test("user guide distinguishes verified nested control from open-only coverage", () => {
  for (const command of ["GF", "HMS", "GR", "HALT", "HMAP"]) {
    assert.match(guide, new RegExp("\\| `" + command + "` \\|[^\\n]+Working \\+ configured"));
  }
  assert.match(guide, /Working open.*does not promise/i);
  assert.match(guide, /small allowlist of grounded panel facts/i);
  assert.match(guide, /No voice download is enabled today/i);
  assert.match(guide, /IPO XLSX live proof failed/i);
});
