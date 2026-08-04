import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runtimeBuildId, runtimeFiles } from "../src/runtime-build-id.mjs";

function runtimeFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "godel-runtime-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "src", "commands"), { recursive: true });
  fs.mkdirSync(path.join(root, "catalog", "schemas"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "server.mjs"), "export default 1;\n");
  fs.writeFileSync(path.join(root, "src", "commands", "quote.mjs"), "export default 2;\n");
  fs.writeFileSync(path.join(root, "catalog", "commands.json"), "{}\n");
  fs.writeFileSync(path.join(root, "catalog", "schemas", "intent.schema.json"), "{}\n");
  fs.writeFileSync(path.join(root, "catalog", "schemas", "workflow.schema.json"), "{}\n");
  return root;
}

test("runtime manifest includes nested command modules", t => {
  const root = runtimeFixture(t);
  assert.deepEqual(runtimeFiles(root), [
    "src/commands/quote.mjs",
    "src/server.mjs",
    "catalog/commands.json",
    "catalog/schemas/intent.schema.json",
    "catalog/schemas/workflow.schema.json"
  ]);
});

test("runtime build id changes when a nested command module changes", t => {
  const root = runtimeFixture(t);
  const before = runtimeBuildId(root);
  fs.writeFileSync(path.join(root, "src", "commands", "quote.mjs"), "export default 3;\n");
  assert.notEqual(runtimeBuildId(root), before);
});
