import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
const registryPath = path.join(projectRoot, "catalog", "commands.json");

export function loadRegistry() {
  return JSON.parse(fs.readFileSync(registryPath, "utf8"));
}

function compactList(values = []) {
  return values.length ? values.join(",") : "-";
}

export function compactCommand(command) {
  const aliases = command.aliases?.length ? `;alias=${command.aliases.join("|")}` : "";
  const args = command.arguments?.length ? `;arg=${command.arguments.join("|")}` : "";
  const features = command.features?.length ? `;ui=${compactList(command.features)}` : "";
  const constraints = command.constraints?.length ? `;limit=${compactList(command.constraints)}` : "";
  const source = command.status === "live-undocumented" ? ";src=live" : "";
  const queryPosition = command.query_position === "after" ? ";query=after-command" : "";
  return `${command.code}|${command.scope}|${command.intent}${aliases}${args}${features}${constraints}${queryPosition}${source}`;
}

export function buildCompactCatalog(registry = loadRegistry()) {
  const header = [
    `GODEL_SPEC ${registry.version}`,
    `SYNTAX ${registry.syntax}`,
    "SCOPE global=no security; security=security required; both=optional; query=free-text query before command unless query=after-command.",
    "ui=features available after the command opens; they are not terminal arguments unless listed under arg=.",
    "alias=accepted spoken/input aliases; always output only the canonical code at the start of the row.",
    "src=live means exposed by the live terminal but without a published detail page: do not invent arguments."
  ];
  return [...header, ...registry.commands.map(compactCommand)].join("\n");
}

export function commandMaps(registry = loadRegistry()) {
  const canonical = new Map();
  const accepted = new Map();
  for (const command of registry.commands) {
    canonical.set(command.code, command);
    accepted.set(command.code, command.code);
    for (const alias of command.aliases ?? []) {
      if (accepted.has(alias)) throw new Error(`Duplicate command/alias: ${alias}`);
      accepted.set(alias, command.code);
    }
  }
  return { canonical, accepted };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(buildCompactCatalog() + "\n");
}
