import { completionVoiceFromEnvironment } from "./completion-voice.mjs";

const voice = completionVoiceFromEnvironment();
if (!voice) throw new Error("Set GODEL_VOICE_TTS_PROVIDER=elevenlabs and add the ElevenLabs key and voice ID to .env");
const phrase = process.argv.slice(2).join(" ").trim() || "Systems online. Ready when you are.";
await voice.speak(phrase, "manual-test");
