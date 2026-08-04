import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sourceFiles(root, relativeDirectory = "src") {
  const directory = path.join(root, relativeDirectory);
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const relative = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) return sourceFiles(root, relative);
    return entry.isFile() && entry.name.endsWith(".mjs") ? [relative] : [];
  }).sort();
}

export function runtimeFiles(root = projectRoot) {
  const manifest = path.join(root, "runtime-manifest.json");
  if (fs.existsSync(manifest)) return JSON.parse(fs.readFileSync(manifest, "utf8"));
  return [
    ...sourceFiles(root),
    "catalog/commands.json",
    "catalog/schemas/intent.schema.json",
    "catalog/schemas/workflow.schema.json"
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
