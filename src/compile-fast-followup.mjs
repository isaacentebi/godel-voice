import fs from "node:fs";
import { encodeControlFollowup } from "./control-followup.mjs";
import { readRecentExecutorContext } from "./executor-context.mjs";

const transcript = fs.readFileSync(0, "utf8").trim();
const marker = encodeControlFollowup(transcript, readRecentExecutorContext());
if (!marker) process.exitCode = 1;
else process.stdout.write(marker);
