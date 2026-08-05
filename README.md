# Godel Voice

Jarvis for [Godel Terminal](https://godelterminal.com).

You speak naturally. Godel Voice understands the request, opens the right Godel tools, arranges the windows, and answers when the work is done.

> “Open the market heatmap on the left and Amazon earnings on the right.”

It opens `HMAP` and `AMZN EM` separately, places them correctly, and replies after Godel confirms both actions.

## What it can do

- Turn company names into tickers.
- Open all 59 catalogued Godel commands.
- Open and arrange several windows from one sentence.
- Remember follow-ups such as “make it bigger” or “close that window.”
- Build comparisons, charts, earnings views, screeners, options views, news searches, and research layouts.
- Search earnings-call transcripts and answer from the passage Godel returned.
- Handle imperfect transcription, filler words, and spoken corrections.

Try:

- “Compare Amazon, Meta and Microsoft over five years.”
- “Show Nvidia's option chain with fifteen strikes.”
- “Set forward P/E between ten and twenty and run the screener.”
- “Search Amazon earnings calls for AWS backlog.”
- “Close the heatmap and show active market halts on the left.”

You do not need to click Godel's command field. Keep the Godel tab visible and speak.

## Models and voices

| Option | What it does | Recommended choice |
|---|---|---|
| OpenAI Realtime Mini | Low-latency microphone and Jarvis voice; validated local code performs every Godel action | `gpt-realtime-2.1-mini` |
| OpenAI Realtime | Higher-quality audio option; unnecessary for most Godel commands because it does not plan actions | `gpt-realtime-2.1` |
| Intent model | Converts requests outside the instant local phrase library into validated Godel plans | GPT-OSS-120B through Cerebras |
| Accuracy fallback | Handles requests rejected by the fast model | Gemini 3.6 Flash |
| ElevenLabs | Optional spoken completion voice for VoiceInk mode | `eleven_flash_v2_5` |

VoiceInk can use any transcription model. Parakeet V2 is the tested recommendation.

The intent model can run through OpenRouter, Cerebras, Groq, or another OpenAI-compatible `/chat/completions` API.

OpenAI Realtime Mini is the recommended voice setup. It does not need VoiceInk or ElevenLabs. Command accuracy comes from the same validated intent compiler in either voice mode, not from the audio model.

## Install

Requires macOS, Node.js 22+, Arc, and an authenticated Godel account.

### 1. Clone

```sh
git clone https://github.com/isaacentebi/godel-voice.git
cd godel-voice
cp .env.example .env
```

### 2. Add your model key

Recommended Realtime setup in `.env`:

```sh
GODEL_VOICE_REALTIME_ENABLED=true
OPENAI_API_KEY=your_openai_api_key
GODEL_VOICE_REALTIME_MODEL=gpt-realtime-2.1-mini
GODEL_VOICE_REALTIME_REASONING_EFFORT=low
GODEL_VOICE_REALTIME_VOICE=cedar
GODEL_VOICE_REALTIME_VAD_EAGERNESS=low
```

VoiceInk/OpenRouter alternative:

```sh
VOICE_LLM_BASE_URL=https://openrouter.ai/api/v1
VOICE_LLM_API_KEY=your_openrouter_api_key
VOICE_LLM_MODEL=openai/gpt-oss-120b
OPENROUTER_PROVIDER_ONLY=cerebras
```

Optional ElevenLabs voice:

```sh
GODEL_VOICE_TTS_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_VOICE_ID=your_voice_id
ELEVENLABS_MODEL_ID=eleven_flash_v2_5
```

### 3. Run setup

```sh
npm install
npm run setup
npm run doctor
```

### 4. Load the extension

1. Open `arc://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the repository's `extension/` folder.
5. Reload Godel Terminal.

You should see **Jarvis ready** in the lower-right corner. Click it or press **Control–Shift–J** to start.

For VoiceInk, set output to **Custom Command** and use the absolute path to `bin/voiceink-deliver`.

## Limits

- Every Godel command can open, but not every button inside every panel is voice-controlled yet.
- Unsupported or ambiguous actions stop instead of guessing.
- Trading, money movement, account changes, billing changes, and messages are not performed unattended.
- Reload the unpacked extension and the Godel tab after updating the repository.

API keys stay in the ignored local `.env` file. Raw audio is not stored.

For the exact supported commands and controls, read the [full user guide](docs/user-guide.md).

## Troubleshooting

```sh
npm run doctor
npm run service:restart
```

If Godel reports an invalidated extension context, reload the extension in `arc://extensions`, then reload Godel.

## Development

```sh
npm run build
npm test
```

The repository includes more than 800 offline tests. No API key is needed to run them.

[Documentation](docs/README.md) · [Architecture](docs/architecture.md) · [User guide](docs/user-guide.md) · [Security](.github/SECURITY.md)

## License

MIT. Independent and unofficial; bring your own Godel account and API access.
