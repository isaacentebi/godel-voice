const securities = [
  { ticker: "AMZN", venue: "US", asset_class: "EQ", aliases: ["amazon", "amazon.com", "aws"] },
  { ticker: "AAPL", venue: "US", asset_class: "EQ", aliases: ["apple", "apple inc"] },
  { ticker: "MSFT", venue: "US", asset_class: "EQ", aliases: ["microsoft", "microsoft corporation"] },
  { ticker: "META", venue: "US", asset_class: "EQ", aliases: ["meta", "facebook", "meta platforms"] },
  { ticker: "NVDA", venue: "US", asset_class: "EQ", aliases: ["nvidia"] },
  { ticker: "TSLA", venue: "US", asset_class: "EQ", aliases: ["tesla"] },
  { ticker: "NFLX", venue: "US", asset_class: "EQ", aliases: ["netflix"] },
  { ticker: "ORCL", venue: "US", asset_class: "EQ", aliases: ["oracle"] },
  { ticker: "RDDT", venue: "US", asset_class: "EQ", aliases: ["reddit"] },
  { ticker: "PLTR", venue: "US", asset_class: "EQ", aliases: ["palantir"] },
  { ticker: "BRK.B", venue: "US", asset_class: "EQ", aliases: ["berkshire", "berkshire hathaway", "berkshire class b"] },
  { ticker: "BTCUSD", venue: "GBL", asset_class: "CRYPTO", aliases: ["bitcoin", "btc", "bitcoin usd"] },
  { ticker: "SPY", venue: "US", asset_class: "EQ", aliases: ["spy", "s p y"] },
  { ticker: "QQQ", venue: "US", asset_class: "EQ", aliases: ["qqq", "q q q"] },
  { ticker: "VIX", venue: "CBOE", asset_class: "IDX", aliases: ["vix", "volatility index", "cboe volatility index", "fear index"] }
];

const normalize = value => String(value ?? "").trim().toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ");
const byAlias = new Map(securities.flatMap(item => item.aliases.map(alias => [normalize(alias), item])));
const byTicker = new Map(securities.map(item => [item.ticker, item]));
const actionFeatures = new Set(["add company", "add/remove securities", "buy leg", "sell leg"]);

export function resolveCommonSecurities(intent) {
  if (!intent || typeof intent !== "object") return intent;
  const security = intent.security;
  if (security && typeof security === "object") {
    const known = byAlias.get(normalize(security.spoken_name)) ?? byTicker.get(String(security.ticker ?? "").toUpperCase());
    if (known) {
      security.ticker ??= known.ticker;
      security.venue ??= known.venue;
      security.asset_class ??= known.asset_class;
      security.needs_resolution = false;
    }
  }
  for (const action of intent.post_open_actions ?? []) {
    if (!actionFeatures.has(String(action.feature ?? "").toLowerCase())) continue;
    const known = byAlias.get(normalize(action.value)) ?? byTicker.get(String(action.value ?? "").toUpperCase());
    if (known) action.value = known.ticker;
  }
  return intent;
}

export function applyResolvedEntities(intent, resolvedEntities, { requireSecurity = false, primaryFromMultiple = false } = {}) {
  if (!intent || typeof intent !== "object" || !Array.isArray(resolvedEntities) || !resolvedEntities.length) return intent;
  const asSecurity = entity => ({
    spoken_name: entity.spoken_name ?? entity.ticker,
    ticker: entity.ticker,
    venue: entity.venue,
    asset_class: entity.asset_class,
    needs_resolution: false
  });
  if (!intent.security && requireSecurity && (resolvedEntities.length === 1 || primaryFromMultiple)) intent.security = asSecurity(resolvedEntities[0]);
  if (intent.security) {
    const spoken = normalize(intent.security.spoken_name);
    const ticker = String(intent.security.ticker ?? "").toUpperCase();
    const matched = resolvedEntities.find(entity => normalize(entity.spoken_name) === spoken || String(entity.ticker ?? "").toUpperCase() === ticker);
    if (matched) Object.assign(intent.security, asSecurity(matched));
  }
  for (const action of intent.post_open_actions ?? []) {
    if (!actionFeatures.has(String(action.feature ?? "").toLowerCase())) continue;
    const matched = resolvedEntities.find(entity => normalize(entity.spoken_name) === normalize(action.value) || String(entity.ticker ?? "").toUpperCase() === String(action.value ?? "").toUpperCase());
    if (matched) action.value = matched.ticker;
  }
  return intent;
}

export function rejectUnverifiedModelTicker(intent, transcript) {
  const security = intent?.security;
  if (!security || typeof security !== "object" || !security.ticker) return intent;

  const spoken = normalize(security.spoken_name);
  const ticker = String(security.ticker).trim().toUpperCase();
  const knownAlias = byAlias.get(spoken);
  if (knownAlias?.ticker === ticker) return intent;

  // Trust an explicit ticker the user actually said, but never trust the model
  // to map an unfamiliar company name from memory. Godel's own autocomplete is
  // the authority for that mapping (e.g. Lantheus is LNTH, not model-guessed LHX).
  const transcriptTokens = normalize(transcript).toUpperCase().split(/\s+/).filter(Boolean);
  const explicitTicker = spoken.toUpperCase() === ticker || transcriptTokens.includes(ticker);
  if (!explicitTicker) {
    security.ticker = null;
    security.venue = null;
    security.asset_class = null;
    security.needs_resolution = true;
  }
  return intent;
}

export function resolveTranscriptSecurities(transcript) {
  const text = ` ${normalize(transcript)} `;
  const matches = [];
  for (const security of securities) {
    const positions = security.aliases
      .map(alias => ({ alias, index: text.indexOf(` ${normalize(alias)} `) }))
      .filter(match => match.index >= 0)
      .sort((a, b) => a.index - b.index || b.alias.length - a.alias.length);
    if (positions.length) matches.push({ security, index: positions[0].index });
  }
  return matches
    .sort((a, b) => a.index - b.index)
    .map(({ security }) => ({
      spoken_name: security.aliases[0],
      ticker: security.ticker,
      venue: security.venue,
      asset_class: security.asset_class
    }));
}

export const commonSecurities = securities;
