import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function runtimeFiles(root = projectRoot) {
  const manifest = path.join(root, "runtime-manifest.json");
  if (fs.existsSync(manifest)) return JSON.parse(fs.readFileSync(manifest, "utf8"));
  return [
    ...fs.readdirSync(path.join(root, "src")).filter(file => file.endsWith(".mjs")).sort().map(file => `src/${file}`),
    "data/commands.json",
    "data/intent.schema.json",
    "data/workflow.schema.json"
  ];
}

export function runtimeBuildId(root = projectRoot) {
  const digest = crypto.createHash("sha256");
  for (const relative of runtimeFiles(root)) {
    digest.update(relative);
    digest.update("\0");
    digest.update(fs.readFileSync(path.join(root, relative)));
    digest.update("\0");
  }
  return digest.digest("hex").slice(0, 16);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${runtimeBuildId()}\n`);
}
