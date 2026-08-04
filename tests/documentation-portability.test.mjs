import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const contracts = JSON.parse(read("data/adapter-contracts-v1.json"));
const audit = JSON.parse(read("data/parser-architecture-coverage-v1.json"));
const expectedEnabled = contracts.contracts.flatMap(contract => (contract.actions || [])
  .filter(action => action.binding?.enabled === true)
  .map(action => `${contract.command}.${action.id}`));

function enabledBlock(markdown) {
  const match = markdown.match(/<!-- enabled-controls:start -->([\s\S]*?)<!-- enabled-controls:end -->/);
  assert(match, "missing machine-readable enabled controls block");
  return [...match[1].matchAll(/^\s*-\s+([A-Z0-9]+\.[a-z0-9_.]+)\s*$/gim)].map(item => item[1]);
}

test("README and user guide enabled-control blocks exactly match runtime contracts", () => {
  for (const file of ["README.md", "docs/user-guide.md"]) {
    assert.deepEqual(enabledBlock(read(file)), expectedEnabled, `${file} enabled controls drifted`);
  }
});

test("handoff docs state exhaustive architecture without confusing it with execution", () => {
  assert.equal(audit.commands.length, 59);
  assert.deepEqual(audit.generic_catalog_only, []);
  for (const file of ["README.md", "docs/user-guide.md"]) {
    const text = read(file);
    assert.match(text, /59/);
    assert.match(text, /424/);
    assert.match(text, /zero generic-(?:catalog-)?only gaps/i);
    assert.match(text, /strict-unbound/i);
    assert.match(text, /safety-gated/i);
    assert.doesNotMatch(text, /initial(?:ly)? (?:automates? )?(?:only )?HMS[\s/,]+GR[\s/,]+(?:and )?GF/i);
    assert.doesNotMatch(text, /^## Next Phase\s*$/im);
  }
});

test("portable docs contain no committed provider secret", () => {
  for (const file of ["README.md", "docs/user-guide.md", ".env.example"]) {
    assert.doesNotMatch(read(file), /sk-or-v1-[A-Za-z0-9_-]{20,}/, `${file} contains an OpenRouter key`);
  }
});
