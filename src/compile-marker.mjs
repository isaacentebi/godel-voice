import fs from "node:fs";
import { compileVoiceRequest } from "./compiler.mjs";
import { encodeAutomationMarker } from "./automation-plan.mjs";

async function main() {
  const transcript = fs.readFileSync(0, "utf8").trim();
  if (!transcript) throw new Error("VoiceInk supplied an empty transcript");

  const result = await compileVoiceRequest(transcript);
  if (result.intent.kind === "clarify") {
    throw new Error(result.intent.clarification || "The Godel request needs clarification");
  }
  if (result.intent.kind !== "execute") {
    throw new Error(result.intent.reason || "The request cannot be executed in Godel");
  }
  process.stdout.write(encodeAutomationMarker(result.intent));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
