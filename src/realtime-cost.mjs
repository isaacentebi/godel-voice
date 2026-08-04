const PRICES = {
  "gpt-realtime-2.1": {
    input_text: 4, cached_text: 0.4, output_text: 24,
    input_audio: 32, cached_audio: 0.4, output_audio: 64
  },
  "gpt-realtime-2.1-mini": {
    input_text: 0.6, cached_text: 0.06, output_text: 2.4,
    input_audio: 10, cached_audio: 0.3, output_audio: 20
  }
};

const count = value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;

export function estimateRealtimeResponseCost(model, usage) {
  const prices = PRICES[model];
  const input = usage?.input_token_details ?? {};
  const cached = input.cached_tokens_details ?? {};
  const output = usage?.output_token_details ?? {};
  const inputText = count(input.text_tokens);
  const inputAudio = count(input.audio_tokens);
  const cachedText = count(cached.text_tokens) ?? 0;
  const cachedAudio = count(cached.audio_tokens) ?? 0;
  const outputText = count(output.text_tokens);
  const outputAudio = count(output.audio_tokens);
  const exact = Boolean(prices && inputText != null && inputAudio != null && outputText != null && outputAudio != null
    && cachedText <= inputText && cachedAudio <= inputAudio);
  if (!exact) return { exact: false, usd: null, model };
  const dollars = ((inputText - cachedText) * prices.input_text
    + cachedText * prices.cached_text
    + (inputAudio - cachedAudio) * prices.input_audio
    + cachedAudio * prices.cached_audio
    + outputText * prices.output_text
    + outputAudio * prices.output_audio) / 1_000_000;
  return { exact: true, usd: Number(dollars.toFixed(8)), model };
}
