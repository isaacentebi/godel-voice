import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCompactCatalog, commandMaps, loadRegistry } from "./catalog.mjs";
import { systemPrompt } from "./prompt.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, "../data");
const registry = loadRegistry();
const catalog = buildCompactCatalog(registry);
const maps = commandMaps(registry);

const manifest = {
  version: registry.version,
  canonical_commands: registry.commands.length,
  accepted_command_tokens: maps.accepted.size,
  documented_commands: registry.commands.filter(c => c.status === "documented").length,
  live_undocumented_commands: registry.commands.filter(c => c.status === "live-undocumented").length,
  catalog_characters: catalog.length,
  catalog_approx_tokens: Math.ceil(catalog.length / 4),
  full_system_prompt_characters: systemPrompt().length,
  full_system_prompt_approx_tokens: Math.ceil(systemPrompt().length / 4)
};

fs.writeFileSync(path.join(dataDir, "catalog.min.txt"), catalog + "\n");
fs.writeFileSync(path.join(dataDir, "voiceink-system-prompt.txt"), systemPrompt() + "\n");
fs.writeFileSync(path.join(dataDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
const sourceLines = [
  "# Godel command sources",
  "",
  `Captured ${registry.version}. Documented commands link to the official command page; live-only commands were observed in Godel's terminal autocomplete and are deliberately restricted to their exposed description.`,
  "",
  "| Command | Status | Source |",
  "|---|---|---|",
  ...registry.commands.map(command => {
    const source = command.status === "documented"
      ? `[Official docs](https://godelterminal.com/docs/commands/${command.code.toLowerCase()})`
      : "Live terminal autocomplete";
    return `| ${command.code} | ${command.status} | ${source} |`;
  })
];
fs.writeFileSync(path.join(dataDir, "sources.md"), sourceLines.join("\n") + "\n");
process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
